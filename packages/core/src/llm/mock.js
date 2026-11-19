import { calculateCost } from './pricing.js';
export class MockLLMClient {
    customHandler;
    defaultResponse;
    queuedResponses = [];
    constructor(defaultResponse = '{"answer":"Mock answer","citations":[{"file":"lib/express.js","start_line":10,"end_line":20}]}', customHandler) {
        this.defaultResponse = defaultResponse;
        this.customHandler = customHandler;
    }
    getDefaultModel() {
        return 'mock-model';
    }
    setHandler(handler) {
        this.customHandler = handler;
    }
    enqueueResponse(response) {
        this.queuedResponses.push(response);
    }
    async chat(request) {
        if (this.queuedResponses.length > 0) {
            const queued = this.queuedResponses.shift();
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
    createResponse(text, request, toolCalls) {
        const promptLength = request.messages.reduce((acc, m) => acc + (m.content?.length ?? 0), 0);
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
//# sourceMappingURL=mock.js.map