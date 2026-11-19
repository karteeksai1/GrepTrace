import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MockLLMClient, TraceLogger } from '@greptrace/core';
import { runAgentLoop } from '@greptrace/agentic';
describe('Agent Loop', () => {
    const rootDir = process.cwd();
    const corpusRoot = path.join(rootDir, 'corpora', 'express');
    function createMockLogger(runId = 'test-run-1') {
        const mockQuery = vi.fn().mockImplementation((query, values) => {
            if (query.includes('INSERT INTO runs')) {
                return Promise.resolve({ rows: [{ id: runId }] });
            }
            if (query.includes('INSERT INTO events')) {
                return Promise.resolve({ rows: [{ id: 'evt-1', run_id: runId, step: values[2] }] });
            }
            return Promise.resolve({ rows: [] });
        });
        const pool = { query: mockQuery };
        const logger = new TraceLogger(pool, runId);
        return { logger, mockQuery };
    }
    it('completes normal run with tool calls, read tracking, and citations', async () => {
        const { logger } = createMockLogger();
        const fakeLLM = new MockLLMClient();
        let callCount = 0;
        fakeLLM.setHandler(async () => {
            callCount++;
            if (callCount === 1) {
                return {
                    text: 'Searching for createApplication',
                    toolCalls: [
                        {
                            id: 'call-1',
                            name: 'grep',
                            arguments: { pattern: 'createApplication', max_results: 5 }
                        }
                    ],
                    usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
                    costUsd: 0.0001
                };
            }
            if (callCount === 2) {
                return {
                    text: 'Reading express.js',
                    toolCalls: [
                        {
                            id: 'call-2',
                            name: 'read',
                            arguments: { file: 'lib/express.js', start_line: 36, end_line: 53 }
                        }
                    ],
                    usage: { promptTokens: 60, completionTokens: 20, totalTokens: 80 },
                    costUsd: 0.0001
                };
            }
            return {
                text: JSON.stringify({
                    answer: 'createApplication creates the app instance.',
                    citations: [{ file: 'lib/express.js', start_line: 36, end_line: 53 }]
                }),
                usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130 },
                costUsd: 0.0002
            };
        });
        const result = await runAgentLoop({
            question: 'Where is createApplication?',
            corpus: 'express',
            corpusRoot,
            llmClient: fakeLLM,
            logger,
            maxSteps: 5
        });
        expect(result.status).toBe('completed');
        expect(result.answer).toContain('createApplication creates the app');
        expect(result.citations).toHaveLength(1);
        expect(result.citations[0].file).toBe('lib/express.js');
        expect(result.readRanges).toHaveLength(1);
        expect(result.readRanges[0].file).toBe('lib/express.js');
        expect(result.readRanges[0].start_line).toBe(36);
        expect(result.readRanges[0].end_line).toBe(53);
    });
    it('triggers repair prompt on malformed JSON and completes when repaired', async () => {
        const { logger } = createMockLogger();
        const fakeLLM = new MockLLMClient();
        let callCount = 0;
        fakeLLM.setHandler(async () => {
            callCount++;
            if (callCount === 1) {
                return {
                    text: 'This is an unformatted conversational answer with no JSON.',
                    usage: { promptTokens: 40, completionTokens: 20, totalTokens: 60 },
                    costUsd: 0.00005
                };
            }
            return {
                text: JSON.stringify({
                    answer: 'Repaired formatted answer.',
                    citations: [{ file: 'lib/express.js', start_line: 1, end_line: 10 }]
                }),
                usage: { promptTokens: 70, completionTokens: 25, totalTokens: 95 },
                costUsd: 0.00008
            };
        });
        const result = await runAgentLoop({
            question: 'Test question',
            corpus: 'express',
            corpusRoot,
            llmClient: fakeLLM,
            logger,
            maxSteps: 5
        });
        expect(result.status).toBe('completed');
        expect(result.answer).toBe('Repaired formatted answer.');
        expect(callCount).toBe(2);
    });
    it('reaches max_steps limit and forces final answer', async () => {
        const { logger } = createMockLogger();
        const fakeLLM = new MockLLMClient();
        fakeLLM.setHandler(async (req) => {
            const isLimitPrompt = req.messages.some((m) => m.content?.includes('maximum tool step budget'));
            if (isLimitPrompt) {
                return {
                    text: JSON.stringify({
                        answer: 'Final answer forced by step limit.',
                        citations: []
                    }),
                    usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
                    costUsd: 0.0001
                };
            }
            return {
                text: 'Iterating with grep...',
                toolCalls: [
                    {
                        id: `call-loop`,
                        name: 'grep',
                        arguments: { pattern: 'express' }
                    }
                ],
                usage: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
                costUsd: 0.00005
            };
        });
        const result = await runAgentLoop({
            question: 'Loop test',
            corpus: 'express',
            corpusRoot,
            llmClient: fakeLLM,
            logger,
            maxSteps: 2
        });
        expect(result.status).toBe('completed');
        expect(result.answer).toBe('Final answer forced by step limit.');
    });
    it('handles tool error and passes error message back to model', async () => {
        const { logger } = createMockLogger();
        const fakeLLM = new MockLLMClient();
        let callCount = 0;
        let sawToolErrorInHistory = false;
        fakeLLM.setHandler(async (req) => {
            callCount++;
            if (callCount === 1) {
                return {
                    text: 'Calling grep with bad regex',
                    toolCalls: [
                        {
                            id: 'bad-call',
                            name: 'grep',
                            arguments: { pattern: '[invalid(' }
                        }
                    ],
                    usage: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
                    costUsd: 0.00005
                };
            }
            sawToolErrorInHistory = req.messages.some((m) => m.role === 'tool' && m.content?.includes('Error running grep:'));
            return {
                text: JSON.stringify({
                    answer: 'Recovered after tool error.',
                    citations: []
                }),
                usage: { promptTokens: 50, completionTokens: 15, totalTokens: 65 },
                costUsd: 0.00007
            };
        });
        const result = await runAgentLoop({
            question: 'Error test',
            corpus: 'express',
            corpusRoot,
            llmClient: fakeLLM,
            logger,
            maxSteps: 5
        });
        expect(result.status).toBe('completed');
        expect(result.answer).toBe('Recovered after tool error.');
        expect(sawToolErrorInHistory).toBe(true);
    });
});
//# sourceMappingURL=agent-loop.test.js.map