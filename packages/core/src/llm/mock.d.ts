import { LLMClient, LLMRequest, LLMResponse } from './types.js';
export interface MockHandler {
    (request: LLMRequest): Promise<LLMResponse | string> | LLMResponse | string;
}
export declare class MockLLMClient implements LLMClient {
    private customHandler?;
    private defaultResponse;
    private queuedResponses;
    constructor(defaultResponse?: string, customHandler?: MockHandler);
    getDefaultModel(): string;
    setHandler(handler: MockHandler): void;
    enqueueResponse(response: LLMResponse | string): void;
    chat(request: LLMRequest): Promise<LLMResponse>;
    private createResponse;
}
//# sourceMappingURL=mock.d.ts.map