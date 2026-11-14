import { calculateCost } from './pricing.js';
import { LLMClient, LLMRequest, LLMResponse, ToolCall } from './types.js';

export interface MockHandler {
  (request: LLMRequest): Promise<LLMResponse | string> | LLMResponse | string;
}

export class MockLLMClient implements LLMClient {
  private customHandler?: MockHandler;
  private defaultResponse: string;
  private queuedResponses: Array<LLMResponse | string> = [];

  constructor(defaultResponse: string = '{"answer":"Mock answer","citations":[{"file":"lib/express.js","start_line":10,"end_line":20}]}', customHandler?: MockHandler) {
    this.defaultResponse = defaultResponse;
    this.customHandler = customHandler;
  }

  getDefaultModel(): string {
    return 'mock-model';
  }

  setHandler(handler: MockHandler): void {
    this.customHandler = handler;
  }

  enqueueResponse(response: LLMResponse | string): void {
    this.queuedResponses.push(response);
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    if (this.queuedResponses.length > 0) {
      const queued = this.queuedResponses.shift()!;
      if (typeof queued === 'string') {
        return this.createResponse(queued, request);
      }
      return queued;
    }

    if (this.customHandler) {
      const handled = await this.customHandler(request);
      if (typeof handled === 'string') {
        return this.createResponse(handled, request);
      }
      return handled;
    }

    return this.createResponse(this.defaultResponse, request);
  }

  private createResponse(text: string, request: LLMRequest, toolCalls?: ToolCall[]): LLMResponse {
    const promptLength = request.messages.reduce(
      (acc, m) => acc + (m.content?.length ?? 0),
      0
    );
    const promptTokens = Math.max(1, Math.ceil(promptLength / 4));
    const completionTokens = Math.max(1, Math.ceil(text.length / 4));

    return {
      text,
      toolCalls,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      },
      costUsd: calculateCost('mock-model', promptTokens, completionTokens)
    };
  }
}
