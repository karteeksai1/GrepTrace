import { calculateCost } from './pricing.js';
import { ChatMessage, LLMClient, LLMRequest, LLMResponse, ToolCall } from './types.js';

export interface AnthropicOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export class AnthropicClient implements LLMClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(options: AnthropicOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.LLM_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.baseUrl = (options.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/+$/, '');
    this.defaultModel = options.defaultModel ?? process.env.LLM_MODEL ?? 'claude-3-5-haiku-20241022';
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  private separateMessages(messages: ChatMessage[]) {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content ?? '')
      .join('\n\n');

    const formatted: Array<{ role: 'user' | 'assistant'; content: unknown }> = [];

    for (const m of messages) {
      if (m.role === 'system') {
        continue;
      }
      if (m.role === 'tool') {
        formatted.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.tool_call_id,
              content: m.content ?? ''
            }
          ]
        });
      } else if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        const blocks: Array<Record<string, unknown>> = [];
        if (m.content) {
          blocks.push({ type: 'text', text: m.content });
        }
        for (const tc of m.tool_calls) {
          blocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments
          });
        }
        formatted.push({ role: 'assistant', content: blocks });
      } else {
        formatted.push({
          role: m.role as 'user' | 'assistant',
          content: m.content ?? ''
        });
      }
    }

    return { system, messages: formatted };
  }

  private parseResponse(content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>): { text: string; toolCalls?: ToolCall[] } {
    let text = '';
    const toolCalls: ToolCall[] = [];

    for (const block of content) {
      if (block.type === 'text' && block.text) {
        text += block.text;
      } else if (block.type === 'tool_use' && block.id && block.name) {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input ?? {}
        });
      }
    }

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.defaultModel;
    const { system, messages } = this.separateMessages(request.messages);

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0
    };
    if (system) {
      body.system = system;
    }
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters
      }));
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const parsed = this.parseResponse(data.content ?? []);
    const promptTokens = data.usage?.input_tokens ?? 0;
    const completionTokens = data.usage?.output_tokens ?? 0;

    return {
      text: parsed.text,
      toolCalls: parsed.toolCalls,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      },
      costUsd: calculateCost(model, promptTokens, completionTokens)
    };
  }
}
