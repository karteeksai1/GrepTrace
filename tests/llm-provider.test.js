import { describe, expect, it } from 'vitest';
import { createLLMClient, MockLLMClient } from '@greptrace/core';
describe('LLM Provider Agnostic Interface', () => {
    it('instantiates MockLLMClient and returns response with usage and cost', async () => {
        const mock = new MockLLMClient('Citing lib/express.js:36-53');
        const response = await mock.chat({
            messages: [{ role: 'user', content: 'Where is createApplication?' }]
        });
        expect(response.text).toBe('Citing lib/express.js:36-53');
        expect(response.usage.totalTokens).toBeGreaterThan(0);
        expect(response.costUsd).toBeGreaterThanOrEqual(0);
    });
    it('supports custom handler function in MockLLMClient', async () => {
        const mock = new MockLLMClient();
        mock.setHandler((req) => `Handled: ${req.messages[0].content}`);
        const response = await mock.chat({
            messages: [{ role: 'user', content: 'custom prompt' }]
        });
        expect(response.text).toBe('Handled: custom prompt');
    });
    it('factory creates mock client when specified', () => {
        const client = createLLMClient('mock', 'custom-mock');
        expect(client.getDefaultModel()).toBe('mock-model');
    });
});
//# sourceMappingURL=llm-provider.test.js.map