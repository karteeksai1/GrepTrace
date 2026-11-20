import { calculateCost } from './pricing.js';
import {
  ChatMessage,
  LLMAttemptFailure,
  LLMAttemptReason,
  LLMClient,
  LLMRequest,
  LLMRequestError,
  LLMRequestPacer,
  LLMResponse,
  ToolCall
} from './types.js';

export interface GroqOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  maxRetries?: number;
  rateLimitMaxWaitMs?: number;
  requestPacer?: LLMRequestPacer;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GroqClient implements LLMClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private maxRetries: number;
  private rateLimitMaxWaitMs: number;
  private requestPacer?: LLMRequestPacer;

  constructor(options: GroqOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.LLM_API_KEY ?? '';
    this.baseUrl = (options.baseUrl ?? process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
    this.defaultModel = options.defaultModel ?? process.env.LLM_MODEL ?? 'openai/gpt-oss-120b';
    const configuredRetries = Number.parseInt(process.env.LLM_MAX_RETRIES ?? '', 10);
    this.maxRetries = options.maxRetries ?? (Number.isFinite(configuredRetries) && configuredRetries >= 0 ? configuredRetries : 3);
    const configuredWait = Number.parseInt(process.env.LLM_RATE_LIMIT_MAX_WAIT_MS ?? '', 10);
    this.rateLimitMaxWaitMs = options.rateLimitMaxWaitMs ?? (Number.isFinite(configuredWait) && configuredWait >= 0 ? configuredWait : 600000);
    this.requestPacer = options.requestPacer;
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  private formatMessage(msg: ChatMessage): Record<string, unknown> {
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: msg.tool_call_id,
        content: msg.content ?? ''
      };
    }
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      return {
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: msg.tool_calls.map((c) => ({
          id: c.id,
          type: 'function',
          function: {
            name: c.name,
            arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments)
          }
        }))
      };
    }
    return {
      role: msg.role,
      content: msg.content ?? ''
    };
  }

  private parseToolCalls(rawCalls: Array<{ id: string; function: { name: string; arguments: string } }> | undefined): ToolCall[] {
    if (!rawCalls || !Array.isArray(rawCalls)) {
      return [];
    }
    return rawCalls.map((rc) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(rc.function.arguments || '{}');
      } catch {
        args = { raw: rc.function.arguments };
      }
      return {
        id: rc.id,
        name: rc.function.name,
        arguments: args
      };
    });
  }

  private extractRetryDelayMs(response: Response, errorText: string, retryNumber: number): number {
    const retryHeader = response.headers.get('retry-after');
    if (retryHeader) {
      const parsedSeconds = parseFloat(retryHeader);
      if (!isNaN(parsedSeconds)) {
        return Math.ceil(parsedSeconds * 1000);
      }
      const retryAt = Date.parse(retryHeader);
      if (Number.isFinite(retryAt)) {
        return Math.max(0, retryAt - Date.now());
      }
    }
    const match = errorText.match(/try again in ([0-9.]+)s/i);
    if (match && match[1]) {
      const seconds = parseFloat(match[1]);
      if (!isNaN(seconds)) {
        return Math.ceil(seconds * 1000) + 500;
      }
    }
    const base = 1000 * Math.pow(2, Math.max(0, retryNumber - 1));
    return Math.floor(base * (0.5 + Math.random() * 0.5));
  }

  private classifyFailure(status: number, errorText: string): LLMAttemptReason {
    if (status === 429 && /tokens?\s+per\s+day|\bTPD\b/i.test(errorText)) return 'daily_quota_exhausted';
    if (status === 429) return 'rate_limited';
    if (status === 400 && /tool_use_failed|failed_generation/i.test(errorText)) {
      return 'tool_call_failed';
    }
    if (status >= 500 && status <= 599) return 'transient_server';
    return 'other_error';
  }

  private getWaitMs(
    reason: LLMAttemptReason,
    response: Response,
    errorText: string,
    attempt: number
  ): number {
    if (reason === 'rate_limited') return this.extractRetryDelayMs(response, errorText, attempt);
    if (reason === 'transient_server') {
      const base = 1000 * Math.pow(2, Math.max(0, attempt - 1));
      return Math.floor(base * (0.5 + Math.random() * 0.5));
    }
    return 0;
  }

  private truncateErrorBody(value: string): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, 500);
  }

  private extractRecoveredAnswer(errorText: string): Record<string, unknown> | undefined {
    let generation: string | undefined;
    try {
      const body = JSON.parse(errorText) as { error?: { failed_generation?: unknown }; failed_generation?: unknown };
      const value = body.error?.failed_generation ?? body.failed_generation;
      if (typeof value === 'string') generation = value;
    } catch {
      const match = errorText.match(/failed_generation\s*[:=]\s*["']([\s\S]*?)["']\s*[,}]/i);
      generation = match?.[1];
    }
    if (!generation) return undefined;
    generation = generation.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
    const call = generation.match(/^(?:call\s+)?([A-Za-z_][\w-]*)\s*(?:\(([^]*)\)|\s+([\s\S]*))$/i);
    if (!call || ['grep', 'glob', 'read'].includes(call[1].toLowerCase())) return undefined;
    const argumentText = call[2] ?? call[3] ?? '';
    try {
      const args = JSON.parse(argumentText.trim());
      if (args && typeof args === 'object' && typeof args.answer === 'string' && Array.isArray(args.citations)) {
        return args as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  private createError(
    status: number,
    reason: LLMAttemptReason,
    message: string,
    attempt: number,
    activeTimeMs: number,
    waitTimeMs: number,
    rateLimitCount: number,
    toolCallFailureCount: number,
    failedAttempts: LLMAttemptFailure[],
    failureReason?: string
  ): LLMRequestError {
    const errorBody = this.truncateErrorBody(message);
    return new LLMRequestError(
      `LLM API error (${status}, ${reason}): ${errorBody}`,
      {
        attempts: attempt,
        activeTimeMs,
        waitTimeMs,
        rateLimitCount,
        toolCallFailureCount,
        failedAttempts,
        lastErrorClass: reason,
        failureReason: failureReason ?? (errorBody || `llm_${reason}`),
        errorBody
      }
    );
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.defaultModel;
    const body: Record<string, unknown> = {
      model,
      messages: request.messages.map((m) => this.formatMessage(m)),
      temperature: request.temperature ?? 0,
      max_tokens: request.maxTokens ?? 2048
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      }));
    }

    let attempt = 0;
    let activeTimeMs = 0;
    let waitTimeMs = 0;
    let pacingWaitTimeMs = 0;
    let rateLimitCount = 0;
    let toolCallFailureCount = 0;
    const failedAttempts: LLMAttemptFailure[] = [];
    let toolFailureRetries = 0;
    let transientRetries = 0;

    while (true) {
      attempt++;
      const estimatedTokens = Math.ceil(JSON.stringify(body).length / 4) + (request.maxTokens ?? 2048);
      const pacingWaitMs = await this.requestPacer?.waitForSlot(estimatedTokens) ?? 0;
      pacingWaitTimeMs += pacingWaitMs;
      const activeStart = Date.now();
      let response: Response;
      let networkError: Error | null = null;
      try {
        response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(body)
        });
      } catch (error) {
        networkError = error as Error;
        response = new Response(networkError.message, { status: 599 });
      }
      const attemptActiveTimeMs = Date.now() - activeStart;
      activeTimeMs += attemptActiveTimeMs;

      if (!response.ok) {
        const errorText = networkError ? networkError.message : await response.text();
        const reason = networkError ? 'transient_server' : this.classifyFailure(response.status, errorText);
        const recoveredAnswer = reason === 'tool_call_failed' ? this.extractRecoveredAnswer(errorText) : undefined;
        if (recoveredAnswer) {
          const errorBody = this.truncateErrorBody(errorText);
          failedAttempts.push({ attempt, reason, status: response.status, message: errorBody, errorBody, waitMs: 0, activeTimeMs: attemptActiveTimeMs });
          return {
            text: '',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            costUsd: 0,
            attempts: attempt,
            activeTimeMs,
            waitTimeMs,
            rateLimitCount,
            toolCallFailureCount: toolCallFailureCount + 1,
            failedAttempts,
            pacingWaitMs: pacingWaitTimeMs,
            recoveredAnswer
          };
        }
        const retryAllowed = reason === 'daily_quota_exhausted'
          ? false
          : reason === 'rate_limited'
          ? waitTimeMs < this.rateLimitMaxWaitMs
          : reason === 'tool_call_failed'
            ? toolFailureRetries < this.maxRetries
            : reason === 'transient_server'
              ? transientRetries < 3
              : false;
        let waitMs = retryAllowed ? this.getWaitMs(reason, response, errorText, reason === 'tool_call_failed' ? toolFailureRetries + 1 : attempt) : 0;
        if (reason === 'rate_limited') {
          waitMs = Math.min(waitMs, Math.max(0, this.rateLimitMaxWaitMs - waitTimeMs));
        }
        if (reason === 'rate_limited' || reason === 'daily_quota_exhausted') rateLimitCount++;
        if (reason === 'tool_call_failed') toolCallFailureCount++;
        if (reason === 'tool_call_failed') toolFailureRetries++;
        if (reason === 'transient_server') transientRetries++;
        const errorBody = this.truncateErrorBody(errorText);
        failedAttempts.push({
          attempt,
          reason,
          status: response.status,
          message: errorBody,
          errorBody,
          waitMs,
          activeTimeMs: attemptActiveTimeMs
        });
        if (retryAllowed && waitMs > 0) {
          waitTimeMs += waitMs;
          await delay(waitMs);
        }
        if (retryAllowed && (waitMs > 0 || reason === 'tool_call_failed' || reason === 'rate_limited')) continue;
        const failureReason = reason === 'rate_limited' && waitTimeMs >= this.rateLimitMaxWaitMs
          ? 'rate_limit_wait_cap_exceeded'
          : reason;
        throw this.createError(response.status, reason, `${failureReason}: ${errorBody}`, attempt, activeTimeMs, waitTimeMs, rateLimitCount, toolCallFailureCount, failedAttempts, failureReason);
      }

      const data = await response.json();
      const message = data.choices?.[0]?.message;
      const text = message?.content ?? '';
      const toolCalls = this.parseToolCalls(message?.tool_calls);
      const promptTokens = data.usage?.prompt_tokens ?? 0;
      const completionTokens = data.usage?.completion_tokens ?? 0;
      const totalTokens = data.usage?.total_tokens ?? (promptTokens + completionTokens);

      return {
        text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens
        },
        costUsd: calculateCost(model, promptTokens, completionTokens),
        attempts: attempt,
        activeTimeMs,
        waitTimeMs,
        rateLimitCount,
        toolCallFailureCount,
        failedAttempts,
        pacingWaitMs: pacingWaitTimeMs
      };
    }

  }
}
