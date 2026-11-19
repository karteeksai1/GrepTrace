import { calculateCost } from './pricing.js';
import {
  ChatMessage,
  LLMAttemptFailure,
  LLMAttemptReason,
  LLMClient,
  LLMRequest,
  LLMRequestError,
  LLMResponse,
  ToolCall
} from './types.js';

export interface OpenAIOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  maxRetries?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenAIClient implements LLMClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private maxRetries: number;

  constructor(options: OpenAIOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.GROQ_API_KEY ?? '';
    this.baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.defaultModel = options.defaultModel ?? process.env.LLM_MODEL ?? 'gpt-4o-mini';
    this.maxRetries = options.maxRetries ?? 3;
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

  private extractRetryDelayMs(response: Response, errorText: string): number {
    const retryHeader = response.headers.get('retry-after');
    if (retryHeader) {
      const parsedSeconds = parseFloat(retryHeader);
      if (!isNaN(parsedSeconds)) {
        return Math.ceil(parsedSeconds * 1000);
      }
    }
    const match = errorText.match(/try again in ([0-9.]+)s/i);
    if (match && match[1]) {
      const seconds = parseFloat(match[1]);
      if (!isNaN(seconds)) {
        return Math.ceil(seconds * 1000) + 500;
      }
    }
    return 3000;
  }

  private classifyFailure(status: number, errorText: string): LLMAttemptReason {
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
    if (reason === 'rate_limited') return this.extractRetryDelayMs(response, errorText);
    if (reason === 'transient_server') return 1000 * Math.pow(2, Math.max(0, attempt - 1));
    return 0;
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
    let rateLimitCount = 0;
    let toolCallFailureCount = 0;
    const failedAttempts: LLMAttemptFailure[] = [];
    const maxAttempts = this.maxRetries + 1;

    while (attempt < maxAttempts) {
      attempt++;
      const activeStart = Date.now();
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body)
      });
      const attemptActiveTimeMs = Date.now() - activeStart;
      activeTimeMs += attemptActiveTimeMs;

      if (!response.ok) {
        const errorText = await response.text();
        const reason = this.classifyFailure(response.status, errorText);
        const waitMs = this.getWaitMs(reason, response, errorText, attempt);
        if (reason === 'rate_limited') rateLimitCount++;
        if (reason === 'tool_call_failed') toolCallFailureCount++;
        failedAttempts.push({
          attempt,
          reason,
          status: response.status,
          message: errorText,
          waitMs,
          activeTimeMs: attemptActiveTimeMs
        });
        if (waitMs > 0 && attempt < maxAttempts) {
          waitTimeMs += waitMs;
          await delay(waitMs);
        }
        if (attempt < maxAttempts && reason !== 'other_error') continue;
        throw new LLMRequestError(
          `LLM API error (${response.status}): ${errorText}`,
          {
            attempts: attempt,
            activeTimeMs,
            waitTimeMs,
            rateLimitCount,
            toolCallFailureCount,
            failedAttempts
          }
        );
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
        costUsd: calculateCost(model, promptTokens, completionTokens)
        , attempts: attempt,
        activeTimeMs,
        waitTimeMs,
        rateLimitCount,
        toolCallFailureCount,
        failedAttempts
      };
    }

    throw new LLMRequestError('LLM request failed after retries.', {
      attempts: attempt,
      activeTimeMs,
      waitTimeMs,
      rateLimitCount,
      toolCallFailureCount,
      failedAttempts
    });
  }
}
