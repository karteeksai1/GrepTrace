import { AnthropicClient } from './anthropic.js';
import { MockLLMClient } from './mock.js';
import { OpenAIClient } from './openai.js';
export * from './types.js';
export * from './pricing.js';
export * from './openai.js';
export * from './anthropic.js';
export * from './mock.js';
export function createLLMClient(provider, model) {
    const chosenProvider = (provider ?? process.env.LLM_PROVIDER ?? 'openai').toLowerCase();
    if (chosenProvider === 'mock') {
        return new MockLLMClient();
    }
    if (chosenProvider === 'anthropic') {
        return new AnthropicClient({ defaultModel: model });
    }
    if (chosenProvider === 'groq') {
        return new OpenAIClient({
            baseUrl: process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
            defaultModel: model
        });
    }
    return new OpenAIClient({ defaultModel: model });
}
//# sourceMappingURL=index.js.map