import { describe, expect, it } from 'vitest';
import { deriveRunTimingMetrics } from '../packages/eval/src/report/metrics.js';
import { Pacer } from '../packages/eval/src/runner/batch-runner.js';

describe('timing metrics', () => {
  it('separates waits and makes the RAG breakdown sum to total latency', () => {
    const metrics = deriveRunTimingMetrics([
      {
        type: 'retrieval',
        elapsed_ms: 3000,
        db_time_ms: 2000,
        args: { embedding_ms: 1000, pinecone_query_ms: 2000, neon_fetch_ms: 0 }
      },
      {
        type: 'llm_attempt_failed',
        elapsed_ms: 100,
        args: { reason: 'rate_limited', wait_ms: 3000 }
      },
      {
        type: 'model_turn',
        elapsed_ms: 4000,
        args: { llm_attempts: 2, rate_limit_wait_ms: 3000, tool_call_failure_count: 0 }
      }
    ], '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:10.000Z');

    expect(metrics.latency_ms).toBe(10000);
    expect(metrics.active_latency_ms).toBe(7000);
    expect(metrics.rate_limit_wait_ms).toBe(3000);
    expect(metrics.step_count).toBe(1);
    expect(metrics.llm_attempts).toBe(2);
    expect(metrics.answer_generation_ms).toBe(4000);
    expect((metrics.embedding_ms ?? 0) + (metrics.pinecone_query_ms ?? 0) + (metrics.neon_fetch_ms ?? 0) + (metrics.answer_generation_ms ?? 0) + (metrics.other_latency_ms ?? 0)).toBe(metrics.latency_ms);
  });

  it('returns null for hidden measurements in old events', () => {
    const metrics = deriveRunTimingMetrics([
      { type: 'model_turn', elapsed_ms: 500 }
    ]);

    expect(metrics.step_count).toBe(1);
    expect(metrics.latency_ms).toBe(500);
    expect(metrics.active_latency_ms).toBeNull();
    expect(metrics.rate_limit_wait_ms).toBeNull();
    expect(metrics.llm_attempts).toBeNull();
    expect(metrics.tool_call_failure_count).toBeNull();
  });

  it('tracks pacing separately from rate-limit waits', () => {
    const metrics = deriveRunTimingMetrics([
      { type: 'model_turn', elapsed_ms: 500, args: { llm_attempts: 1, rate_limit_wait_ms: 0, pacing_wait_ms: 200 } }
    ]);

    expect(metrics.pacing_wait_ms).toBe(200);
    expect(metrics.rate_limit_wait_ms).toBe(0);
  });

  it('waits for TPM usage and disables TPM pacing at zero', async () => {
    let now = 0;
    const waits: number[] = [];
    const pacer = new Pacer(0, 100, () => now, async (ms) => { waits.push(ms); now += ms; });
    await pacer.waitForSlot(80);
    await pacer.waitForSlot(30);
    expect(waits).toEqual([60000]);

    now = 0;
    waits.length = 0;
    const disabled = new Pacer(0, 0, () => now, async (ms) => { waits.push(ms); now += ms; });
    await disabled.waitForSlot(100000);
    await disabled.waitForSlot(100000);
    expect(waits).toEqual([]);
  });
});
