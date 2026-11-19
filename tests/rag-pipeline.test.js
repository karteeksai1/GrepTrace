import { describe, expect, it, vi } from 'vitest';
import { MockLLMClient, TraceLogger } from '@greptrace/core';
import { runRagPipeline } from '@greptrace/rag';
const { mockQueryFn, mockIndexFn } = vi.hoisted(() => {
    const queryFn = vi.fn();
    const namespaceFn = vi.fn().mockReturnValue({ query: queryFn });
    const indexFn = vi.fn().mockReturnValue({ namespace: namespaceFn });
    return { mockQueryFn: queryFn, mockIndexFn: indexFn };
});
vi.mock('@pinecone-database/pinecone', () => ({
    Pinecone: vi.fn().mockImplementation(() => ({
        index: mockIndexFn
    }))
}));
describe('RAG Pipeline', () => {
    function createMockLogger(runId = 'rag-test-1') {
        const loggedEvents = [];
        const mockQuery = vi.fn().mockImplementation((query, values) => {
            if (query.includes('INSERT INTO runs')) {
                return Promise.resolve({ rows: [{ id: runId }] });
            }
            if (query.includes('INSERT INTO events')) {
                loggedEvents.push({
                    step: values[2],
                    type: values[3],
                    db_time_ms: values[11],
                    elapsed_ms: values[10]
                });
                return Promise.resolve({ rows: [{ id: 'evt-1' }] });
            }
            return Promise.resolve({ rows: [] });
        });
        const pool = { query: mockQuery };
        const logger = new TraceLogger(pool, runId);
        return { logger, loggedEvents, mockQuery };
    }
    it('runs retrieval, logs db_time_ms, formats prompt, and completes answer', async () => {
        const { logger, loggedEvents } = createMockLogger();
        mockQueryFn.mockResolvedValue({
            matches: [
                {
                    id: 'chunk-1',
                    metadata: {
                        file: 'lib/express.js',
                        start_line: 36,
                        end_line: 53,
                        text: 'function createApplication() { return app; }'
                    }
                }
            ]
        });
        const mockEmbeddingClient = {
            embed: vi.fn().mockResolvedValue({
                embeddings: [[0.1, 0.2, 0.3]],
                totalTokens: 8
            }),
            getDimension: () => 1024,
            getModel: () => 'multilingual-e5-large',
            verifyStartup: vi.fn().mockResolvedValue(undefined)
        };
        const mockLLM = new MockLLMClient(JSON.stringify({
            answer: 'RAG synthesized answer citing lib/express.js:36-53.',
            citations: [{ file: 'lib/express.js', start_line: 36, end_line: 53 }]
        }));
        const result = await runRagPipeline({
            question: 'Where is createApplication?',
            corpus: 'express',
            questionId: 'express-create-app',
            topK: 1,
            pineconeApiKey: 'test-key',
            pineconeIndexName: 'greptrace',
            pineconeNamespace: 'express',
            embeddingClient: mockEmbeddingClient,
            llmClient: mockLLM,
            logger
        });
        expect(result.status).toBe('completed');
        expect(result.citations).toHaveLength(1);
        expect(result.citations[0].file).toBe('lib/express.js');
        expect(result.retrievedChunks).toHaveLength(1);
        expect(loggedEvents).toHaveLength(2);
        expect(loggedEvents[0].type).toBe('retrieval');
        expect(typeof loggedEvents[0].db_time_ms).toBe('number');
        expect(loggedEvents[1].type).toBe('model_turn');
    });
});
//# sourceMappingURL=rag-pipeline.test.js.map