import { LLMClient, LLMRequest, LLMResponse } from './types.js';

export interface MockHandler {
  (request: LLMRequest): Promise<string> | string;
}

export class MockLLMClient implements LLMClient {
  private customHandler?: MockHandler;
  private defaultResponse: string;

  constructor(defaultResponse: string = 'Mock answer citation: app.js:10-20', customHandler?: MockHandler) {
    this.defaultResponse = defaultResponse;
    this.customHandler = customHandler;
  }

  getDefaultModel(): string {
    return 'mock-model';
  }

  setHandler(handler: MockHandler): void {
    this.customHandler = handler;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const text = this.customHandler
      ? await this.customHandler(request)
      : this.defaultResponse;

    const promptLength = request.messages.reduce((acc, m) => acc + m.content.length, 0);
    const promptTokens = Math.max(1, Math.ceil(promptLength / 4));
    const completionTokens = Math.max(1, Math.ceil(text.length / 4));

    return {
      text,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      },
      costUsd: 0.000001 * (promptTokens + completionTokens)
    };
  }
}
