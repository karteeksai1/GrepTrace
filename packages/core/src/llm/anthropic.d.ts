import { LLMClient, LLMRequest, LLMResponse } from './types.js';
export interface AnthropicOptions {
    apiKey?: string;
    baseUrl?: string;
    defaultModel?: string;
}
export declare class AnthropicClient implements LLMClient {
    private apiKey;
    private baseUrl;
    private defaultModel;
    constructor(options?: AnthropicOptions);
    getDefaultModel(): string;
    private separateMessages;
    private parseResponse;
    chat(request: LLMRequest): Promise<LLMResponse>;
}
//# sourceMappingURL=anthropic.d.ts.map