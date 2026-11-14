import { ChatMessage, LLMClient, LLMRequest, LLMResponse } from './types.js';

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
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.baseUrl = (options.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/+$/, '');
    this.defaultModel = options.defaultModel ?? process.env.LLM_MODEL ?? 'claude-3-5-haiku-20241022';
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  private calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const isHaiku = model.includes('haiku');
    const inputRate = isHaiku ? 0.0000008 : 0.000003;
    const outputRate = isHaiku ? 0.000004 : 0.000015;
    return Number((promptTokens * inputRate + completionTokens * outputRate).toFixed(6));
  }

  private separateMessages(messages: ChatMessage[]) {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const userAndAssistant = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    return { system, messages: userAndAssistant };
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
    const text = data.content?.[0]?.text ?? '';
    const promptTokens = data.usage?.input_tokens ?? 0;
    const completionTokens = data.usage?.output_tokens ?? 0;

    return {
      text,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      },
      costUsd: this.calculateCost(model, promptTokens, completionTokens)
    };
  }
}
