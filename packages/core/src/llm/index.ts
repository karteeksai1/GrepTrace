import { AnthropicClient } from './anthropic.js';
import { MockLLMClient } from './mock.js';
import { OpenAIClient } from './openai.js';
import { LLMClient } from './types.js';

export * from './types.js';
export * from './openai.js';
export * from './anthropic.js';
export * from './mock.js';

export function createLLMClient(provider?: string, model?: string): LLMClient {
  const chosenProvider = provider ?? process.env.LLM_PROVIDER ?? 'openai';

  if (chosenProvider === 'mock') {
    return new MockLLMClient();
  }
  if (chosenProvider === 'anthropic') {
    return new AnthropicClient({ defaultModel: model });
  }
  return new OpenAIClient({ defaultModel: model });
}
