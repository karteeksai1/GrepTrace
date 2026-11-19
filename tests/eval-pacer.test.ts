import { describe, expect, it, vi } from 'vitest';
import { Pacer } from '../packages/eval/src/runner/batch-runner.js';

describe('Eval Pacer', () => {
  it('does not delay when interval is 0', async () => {
    const pacer = new Pacer(0);
    const start = Date.now();
    await pacer.waitForSlot();
    await pacer.waitForSlot();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('delays subsequent requests to enforce minimum interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const pacer = new Pacer(60);
    await pacer.waitForSlot();
    const next = pacer.waitForSlot();
    await vi.advanceTimersByTimeAsync(59);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await next;
    expect(Date.now()).toBe(1060);
    vi.useRealTimers();
  });
});
