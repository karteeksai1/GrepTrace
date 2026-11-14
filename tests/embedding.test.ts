import { describe, expect, it, vi } from 'vitest';
import { getModelSpec, PineconeEmbeddingClient, prepareInputTexts } from '@greptrace/core';

describe('Pinecone Embedding Adapter', () => {
  it('loads model specifications for supported hosted inference models', () => {
    const e5Spec = getModelSpec('multilingual-e5-large');
    expect(e5Spec.maxTokens).toBe(512);
    expect(e5Spec.maxBatchSize).toBe(96);
    expect(e5Spec.supportedDimensions).toContain(1024);

    const llamaSpec = getModelSpec('llama-text-embed-v2');
    expect(llamaSpec.maxTokens).toBe(2048);

    const openAiSpec = getModelSpec('text-embedding-3-small');
    expect(openAiSpec.maxTokens).toBe(8191);
  });

  it('truncates inputs exceeding token limit and counts affected inputs', () => {
    const shortText = 'Short text within limit';
    const longText = 'A'.repeat(512 * 4 + 100);

    const { prepared, truncatedCount } = prepareInputTexts([shortText, longText], 512);
    expect(truncatedCount).toBe(1);
    expect(prepared[0]).toBe(shortText);
    expect(prepared[1].length).toBe(512 * 4);
  });

  it('embeds batches and accumulates tokens and vectors', async () => {
    const client = new PineconeEmbeddingClient({
      apiKey: 'test-key',
      model: 'multilingual-e5-large',
      dimension: 4,
      indexName: 'test-index',
      batchSize: 2,
      pacingDelayMs: 0
    });

    const mockEmbed = vi.fn().mockImplementation(async ({ inputs, parameters }) => {
      expect(parameters.inputType).toBe('passage');
      return {
        data: inputs.map(() => ({
          vectorType: 'dense',
          values: [0.1, 0.2, 0.3, 0.4]
        })),
        usage: { totalTokens: inputs.length * 10 }
      };
    });

    (client as unknown as { pc: { inference: { embed: unknown } } }).pc = {
      inference: { embed: mockEmbed }
    };

    const result = await client.embed(['text 1', 'text 2', 'text 3'], 'passage');
    expect(result.embeddings).toHaveLength(3);
    expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(result.totalTokens).toBe(30);
    expect(mockEmbed).toHaveBeenCalledTimes(2);
  });

  it('verifies dimension matching at startup and throws on mismatch', async () => {
    const client = new PineconeEmbeddingClient({
      apiKey: 'test-key',
      model: 'multilingual-e5-large',
      dimension: 1024,
      indexName: 'test-index'
    });

    const mockEmbed = vi.fn().mockResolvedValue({
      data: [{ vectorType: 'dense', values: [0.1, 0.2] }],
      usage: { totalTokens: 5 }
    });

    (client as unknown as { pc: { inference: { embed: unknown } } }).pc = {
      inference: { embed: mockEmbed }
    };

    await expect(client.verifyStartup()).rejects.toThrowError(
      /returned vector dimension 2, but EMBEDDING_DIMENSION is configured as 1024/
    );
  });
});
