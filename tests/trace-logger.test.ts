import { describe, expect, it, vi } from 'vitest';
import { TraceLogger } from '@greptrace/core';
import pg from 'pg';

describe('TraceLogger', () => {
  it('creates a run with running status and returns run id', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [{ id: 'run-123' }] });
    const mockPool = { query: mockQuery } as unknown as pg.Pool;

    const logger = new TraceLogger(mockPool, 'run-123');
    const runId = await logger.startRun({
      system: 'agentic',
      corpus: 'express',
      question_id: 'q-1',
      model: 'gpt-4o'
    });

    expect(runId).toBe('run-123');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][1]).toEqual([
      'run-123',
      'agentic',
      'express',
      'q-1',
      'gpt-4o'
    ]);
  });

  it('logs events with all required fields', async () => {
    const mockEventRow = {
      id: 'event-uuid-1',
      run_id: 'run-123',
      step: 1,
      type: 'tool_call',
      tool: 'grep',
      args: { pattern: 'createApplication' },
      result_summary: 'Found in 1 file',
      result_bytes: 120,
      files_touched: ['lib/express.js'],
      tokens: 45,
      elapsed_ms: 12,
      db_time_ms: 0,
      created_at: new Date()
    };

    const mockQuery = vi.fn().mockResolvedValue({ rows: [mockEventRow] });
    const mockPool = { query: mockQuery } as unknown as pg.Pool;

    const logger = new TraceLogger(mockPool, 'run-123');
    const logged = await logger.logEvent({
      step: 1,
      type: 'tool_call',
      tool: 'grep',
      args: { pattern: 'createApplication' },
      result_summary: 'Found in 1 file',
      result_bytes: 120,
      files_touched: ['lib/express.js'],
      tokens: 45,
      elapsed_ms: 12,
      db_time_ms: 0
    });

    expect(logged.id).toBe('event-uuid-1');
    expect(logged.step).toBe(1);
    expect(logged.tool).toBe('grep');
    expect(logged.files_touched).toEqual(['lib/express.js']);
  });

  it('finishes a run updating final answer, tokens, and cost', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    const mockPool = { query: mockQuery } as unknown as pg.Pool;

    const logger = new TraceLogger(mockPool, 'run-123');
    await logger.finishRun({
      status: 'completed',
      final_answer: 'Sample answer citing lib/express.js:10-20',
      total_tokens: 350,
      cost_usd: 0.0012
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][1]).toEqual([
      'run-123',
      'completed',
      'Sample answer citing lib/express.js:10-20',
      350,
      0.0012
    ]);
  });
});
