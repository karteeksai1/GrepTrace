import { MockLLMClient } from './mock.js';
import { GroqClient } from './groq.js';
import { LLMClient, LLMRequestPacer } from './types.js';

export * from './types.js';
export * from './pricing.js';
export * from './groq.js';
export * from './mock.js';

export function createLLMClient(provider?: string, model?: string, requestPacer?: LLMRequestPacer): LLMClient {
  const chosenProvider = (provider ?? process.env.LLM_PROVIDER ?? 'groq').toLowerCase();

  if (chosenProvider === 'mock') {
    return new MockLLMClient();
  }
  return new GroqClient({ defaultModel: model, requestPacer });
}
