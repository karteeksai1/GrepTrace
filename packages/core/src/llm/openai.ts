import { calculateCost } from './pricing.js';
import { ChatMessage, LLMClient, LLMRequest, LLMResponse, ToolCall } from './types.js';

export interface OpenAIOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export class OpenAIClient implements LLMClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(options: OpenAIOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.GROQ_API_KEY ?? '';
    this.baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.defaultModel = options.defaultModel ?? process.env.LLM_MODEL ?? 'gpt-4o-mini';
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

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error (${response.status}): ${errorText}`);
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
    };
  }
}
