import { LLMClient, LLMRequest, LLMResponse } from './types.js';

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
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.defaultModel = options.defaultModel ?? process.env.LLM_MODEL ?? 'gpt-4o-mini';
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  private calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const isMini = model.includes('mini');
    const inputRate = isMini ? 0.00000015 : 0.0000025;
    const outputRate = isMini ? 0.0000006 : 0.00001;
    return Number((promptTokens * inputRate + completionTokens * outputRate).toFixed(6));
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.defaultModel;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0,
        max_tokens: request.maxTokens ?? 2048
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? 0;
    const totalTokens = data.usage?.total_tokens ?? (promptTokens + completionTokens);

    return {
      text,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens
      },
      costUsd: this.calculateCost(model, promptTokens, completionTokens)
    };
  }
}
