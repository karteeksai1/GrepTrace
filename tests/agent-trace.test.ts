import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { MockLLMClient, TraceLogger } from '@greptrace/core';
import { runAgentLoop } from '@greptrace/agentic';

describe('Agent Trace Logging', () => {
  const rootDir = process.cwd();
  const corpusRoot = path.join(rootDir, 'corpora', 'express');

  it('records correct sequence of events, step numbering, and status transitions', async () => {
    const loggedEvents: Array<{ step: number; type: string; tool?: string }> = [];
    let runStatus = '';

    const mockQuery = vi.fn().mockImplementation((query, values) => {
      if (query.includes('INSERT INTO runs')) {
        runStatus = values[6] ?? 'running';
        return Promise.resolve({ rows: [{ id: values[0] }] });
      }
      if (query.includes('INSERT INTO events')) {
        loggedEvents.push({
          step: values[2],
          type: values[3],
          tool: values[4]
        });
        return Promise.resolve({ rows: [{ id: 'evt-id' }] });
      }
      if (query.includes('UPDATE runs')) {
        runStatus = values[1];
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const pool = { query: mockQuery } as unknown as pg.Pool;
    const logger = new TraceLogger(pool, 'trace-run-1');

    const fakeLLM = new MockLLMClient();
    let turn = 0;
    fakeLLM.setHandler(async () => {
      turn++;
      if (turn === 1) {
        return {
          text: 'Turn 1 calling grep',
          toolCalls: [
            {
              id: 'tc-1',
              name: 'grep',
              arguments: { pattern: 'createApplication', max_results: 5 }
            }
          ],
          usage: { promptTokens: 40, completionTokens: 10, totalTokens: 50 },
          costUsd: 0.00005
        };
      }
      return {
        text: JSON.stringify({
          answer: 'Final answer',
          citations: [{ file: 'lib/express.js', start_line: 36, end_line: 53 }]
        }),
        usage: { promptTokens: 60, completionTokens: 20, totalTokens: 80 },
        costUsd: 0.00008
      };
    });

    const result = await runAgentLoop({
      question: 'Trace test',
      corpus: 'express',
      corpusRoot,
      llmClient: fakeLLM,
      logger,
      maxSteps: 5
    });

    expect(result.status).toBe('completed');
    expect(runStatus).toBe('completed');

    expect(loggedEvents).toHaveLength(3);
    expect(loggedEvents[0]).toEqual({
      step: 1,
      type: 'model_turn',
      tool: null
    });
    expect(loggedEvents[1]).toEqual({
      step: 2,
      type: 'tool_call',
      tool: 'grep'
    });
    expect(loggedEvents[2]).toEqual({
      step: 3,
      type: 'model_turn',
      tool: null
    });
  });

  it('logs error event and transitions run to failed when irrecoverable', async () => {
    const loggedEvents: Array<{ step: number; type: string; result_summary?: string }> = [];
    let finalStatus = '';

    const mockQuery = vi.fn().mockImplementation((query, values) => {
      if (query.includes('INSERT INTO events')) {
        loggedEvents.push({
          step: values[2],
          type: values[3],
          result_summary: values[6]
        });
        return Promise.resolve({ rows: [{ id: 'evt-id' }] });
      }
      if (query.includes('UPDATE runs')) {
        finalStatus = values[1];
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [{ id: 'err-run' }] });
    });

    const pool = { query: mockQuery } as unknown as pg.Pool;
    const logger = new TraceLogger(pool, 'err-run');

    const failingLLM = new MockLLMClient();
    failingLLM.setHandler(async () => {
      return {
        text: 'Non-JSON unparseable response that refuses to format',
        usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
        costUsd: 0.00003
      };
    });

    const result = await runAgentLoop({
      question: 'Fail test',
      corpus: 'express',
      corpusRoot,
      llmClient: failingLLM,
      logger,
      maxSteps: 3
    });

    expect(result.status).toBe('failed');
    expect(finalStatus).toBe('failed');

    const errorEvent = loggedEvents.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.result_summary).toContain('JSON validation failed');
  });
});
