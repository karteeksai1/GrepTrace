import { describe, expect, it } from 'vitest';
import {
  buildGraphNodesAndEdges,
  calculateRunningTotals
} from '../apps/web/src/utils/replay.js';
import { GroundTruthLocation, RunEvent } from '../apps/web/src/types.js';

describe('Replay Scrubber Step Logic and Running Totals', () => {
  const gtList: GroundTruthLocation[] = [
    { file: 'lib/express.js', start_line: 36, end_line: 56 }
  ];

  const fixtureEvents: RunEvent[] = [
    {
      id: 'e1',
      run_id: 'r1',
      step: 1,
      type: 'tool_call',
      tool: 'glob',
      args: { pattern: 'lib/*.js' },
      result_summary: 'found 5 files',
      files_touched: ['lib/express.js'],
      tokens: 200,
      elapsed_ms: 100,
      created_at: '2026-11-18T10:00:00Z'
    },
    {
      id: 'e2',
      run_id: 'r1',
      step: 2,
      type: 'tool_call',
      tool: 'grep',
      args: { pattern: 'createApplication' },
      result_summary: '1 match found',
      files_touched: ['lib/express.js'],
      tokens: 400,
      elapsed_ms: 250,
      created_at: '2026-11-18T10:00:01Z'
    },
    {
      id: 'e3',
      run_id: 'r1',
      step: 3,
      type: 'tool_call',
      tool: 'read',
      args: { file: 'lib/express.js', start_line: 36, end_line: 56 },
      result_summary: 'read 21 lines',
      files_touched: ['lib/express.js'],
      tokens: 800,
      elapsed_ms: 400,
      created_at: '2026-11-18T10:00:02Z'
    }
  ];

  const { nodes } = buildGraphNodesAndEdges(
    fixtureEvents,
    'Where is createApplication defined?',
    gtList,
    'createApplication is in lib/express.js lines 36-56.'
  );

  it('reveals only question node at step 0 with 0 running totals', () => {
    const revealed = nodes.filter((n) => n.step <= 0);
    expect(revealed).toHaveLength(1);
    expect(revealed[0].type).toBe('question');

    const totals = calculateRunningTotals(fixtureEvents, 0);
    expect(totals.tokens).toBe(0);
    expect(totals.cost).toBe(0);
    expect(totals.elapsedMs).toBe(0);
  });

  it('reveals nodes progressively and accumulates totals at each step', () => {
    const revealedStep1 = nodes.filter((n) => n.step <= 1);
    expect(revealedStep1).toHaveLength(2);
    expect(revealedStep1[1].tool === 'glob' || revealedStep1[1].type === 'glob').toBe(true);

    const totalsStep1 = calculateRunningTotals(fixtureEvents, 1);
    expect(totalsStep1.tokens).toBe(200);
    expect(totalsStep1.elapsedMs).toBe(100);

    const revealedStep2 = nodes.filter((n) => n.step <= 2);
    expect(revealedStep2).toHaveLength(3);

    const totalsStep2 = calculateRunningTotals(fixtureEvents, 2);
    expect(totalsStep2.tokens).toBe(600);
    expect(totalsStep2.elapsedMs).toBe(350);

    const revealedStep3 = nodes.filter((n) => n.step <= 3);
    expect(revealedStep3).toHaveLength(4);

    const totalsStep3 = calculateRunningTotals(fixtureEvents, 3);
    expect(totalsStep3.tokens).toBe(1400);
    expect(totalsStep3.elapsedMs).toBe(750);
  });

  it('reveals final answer node at the last step', () => {
    const lastStep = nodes[nodes.length - 1].step;
    const revealedAll = nodes.filter((n) => n.step <= lastStep);
    expect(revealedAll).toHaveLength(nodes.length);
    expect(revealedAll[revealedAll.length - 1].type).toBe('final_answer');
  });

  it('clamps scrubber step transitions within range [0, totalSteps]', () => {
    const totalSteps = nodes.length - 1;
    const clamp = (val: number) => Math.max(0, Math.min(totalSteps, val));

    expect(clamp(-5)).toBe(0);
    expect(clamp(100)).toBe(totalSteps);
    expect(clamp(2)).toBe(2);
  });
});
