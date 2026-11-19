import { LLMClient, LLMRequest, LLMResponse } from './types.js';
export interface OpenAIOptions {
    apiKey?: string;
    baseUrl?: string;
    defaultModel?: string;
    maxRetries?: number;
}
export declare class OpenAIClient implements LLMClient {
    private apiKey;
    private baseUrl;
    private defaultModel;
    private maxRetries;
    constructor(options?: OpenAIOptions);
    getDefaultModel(): string;
    private formatMessage;
    private parseToolCalls;
    private extractRetryDelayMs;
    chat(request: LLMRequest): Promise<LLMResponse>;
}
//# sourceMappingURL=openai.d.ts.map