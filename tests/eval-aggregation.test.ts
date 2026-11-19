import { describe, expect, it } from 'vitest';
import {
  aggregateRows,
  buildHeadToHead,
  computeJudgeAgreement,
  escapeCsv,
  formatAsciiTable,
  formatHeadToHeadMarkdown,
  mean,
  median,
  p95,
  RunDetailRow,
  stdDev
} from '../packages/eval/src/report/reporter.js';

describe('Eval Reporter Aggregations', () => {
  it('computes mean, median, p95, and stdDev accurately', () => {
    const values = [10, 20, 30, 40, 50];

    expect(mean(values)).toBe(30);
    expect(median(values)).toBe(30);
    expect(p95(values)).toBe(50);
    expect(stdDev(values)).toBe(15.8114);

    expect(mean([])).toBe(0);
    expect(median([])).toBe(0);
    expect(p95([])).toBe(0);
    expect(stdDev([10])).toBe(0);
  });

  it('escapes CSV cells correctly', () => {
    expect(escapeCsv('simple')).toBe('simple');
    expect(escapeCsv('with,comma')).toBe('"with,comma"');
    expect(escapeCsv('with "quotes"')).toBe('"with ""quotes"""');
    expect(escapeCsv('line\nbreak')).toBe('"line\nbreak"');
    expect(escapeCsv(null)).toBe('');
  });

  it('aggregates run rows into group summaries', () => {
    const mockRows: RunDetailRow[] = [
      {
        run_id: 'r1',
        system: 'agentic',
        corpus: 'express',
        question_id: 'q1',
        question_type: 'identifier_lookup',
        model: 'model-a',
        status: 'completed',
        total_tokens: 1000,
        cost_usd: 0.001,
        repetition: 1,
        latency_ms: 500,
        step_count: 3,
        db_time_ms: 0,
        retrieval_hit_any: true,
        retrieval_hit_all: true,
        retrieval_recall: 1.0,
        citation_correct: true,
        answer_score: 1.0,
        judge_verdict: 'correct',
        judge_reason: 'Good',
        judge_tokens: 50,
        judge_cost_usd: 0.0001,
        final_answer: ''
      },
      {
        run_id: 'r2',
        system: 'agentic',
        corpus: 'express',
        question_id: 'q2',
        question_type: 'identifier_lookup',
        model: 'model-a',
        status: 'completed',
        total_tokens: 2000,
        cost_usd: 0.002,
        repetition: 1,
        latency_ms: 1000,
        step_count: 5,
        db_time_ms: 0,
        retrieval_hit_any: true,
        retrieval_hit_all: false,
        retrieval_recall: 0.5,
        citation_correct: false,
        answer_score: 0.5,
        judge_verdict: 'partial',
        judge_reason: 'Missing details',
        judge_tokens: 50,
        judge_cost_usd: 0.0001,
        final_answer: ''
      }
    ];

    const summaries = aggregateRows(mockRows);
    expect(summaries).toHaveLength(1);
    const s = summaries[0];
    expect(s.system).toBe('agentic');
    expect(s.total_runs).toBe(2);
    expect(s.hit_any_rate).toBe(1.0);
    expect(s.hit_all_rate).toBe(0.5);
    expect(s.mean_recall).toBe(0.75);
    expect(s.citation_correct_rate).toBe(0.5);
    expect(s.mean_score).toBe(0.75);
    expect(s.mean_tokens).toBe(1500);
    expect(s.mean_active_latency_ms).toBeNull();
    expect(s.mean_rate_limit_wait_ms).toBeNull();
    expect(s.mean_llm_attempts).toBeNull();
    expect(s.mean_tool_call_failure_count).toBeNull();
  });

  it('builds head to head comparisons between agentic and rag', () => {
    const mockRows: RunDetailRow[] = [
      {
        run_id: 'r1',
        system: 'agentic',
        corpus: 'express',
        question_id: 'q1',
        question_type: 'conceptual',
        model: 'model-a',
        status: 'completed',
        total_tokens: 1500,
        cost_usd: 0.001,
        repetition: 1,
        latency_ms: 800,
        step_count: 3,
        db_time_ms: 0,
        retrieval_hit_any: true,
        retrieval_hit_all: true,
        retrieval_recall: 1.0,
        citation_correct: true,
        answer_score: 1.0,
        judge_verdict: 'correct',
        judge_reason: 'Accurate',
        judge_tokens: 50,
        judge_cost_usd: 0.0001,
        final_answer: ''
      },
      {
        run_id: 'r2',
        system: 'rag',
        corpus: 'express',
        question_id: 'q1',
        question_type: 'conceptual',
        model: 'model-a',
        status: 'completed',
        total_tokens: 800,
        cost_usd: 0.0008,
        repetition: 1,
        latency_ms: 400,
        step_count: 1,
        db_time_ms: 120,
        retrieval_hit_any: false,
        retrieval_hit_all: false,
        retrieval_recall: 0,
        citation_correct: false,
        answer_score: 0.0,
        judge_verdict: 'incorrect',
        judge_reason: 'Missed concept',
        judge_tokens: 50,
        judge_cost_usd: 0.0001,
        final_answer: ''
      }
    ];

    const h2h = buildHeadToHead(mockRows);
    expect(h2h).toHaveLength(1);
    expect(h2h[0].question_id).toBe('q1');
    expect(h2h[0].winner).toBe('agentic');
  });

  it('surfaces failed run reasons beside scores', () => {
    const rows = [
      { run_id: 'a', system: 'agentic', status: 'failed', question_id: 'q', corpus: 'express', question_type: 'conceptual', answer_score: 0, retrieval_hit_all: false, total_tokens: 0, cost_usd: 0, latency_ms: 0, step_count: 0, db_time_ms: 0, retrieval_hit_any: false, retrieval_recall: 0, citation_correct: false, judge_verdict: 'none', judge_reason: '', judge_tokens: 0, judge_cost_usd: 0, final_answer: '', failure_reason: 'rate_limit_wait_cap_exceeded', last_error_class: 'rate_limited' },
      { run_id: 'r', system: 'rag', status: 'completed', question_id: 'q', corpus: 'express', question_type: 'conceptual', answer_score: 1, retrieval_hit_all: true, total_tokens: 1, cost_usd: 0, latency_ms: 1, step_count: 1, db_time_ms: 0, retrieval_hit_any: true, retrieval_recall: 1, citation_correct: true, judge_verdict: 'correct', judge_reason: '', judge_tokens: 0, judge_cost_usd: 0, final_answer: '' }
    ] as RunDetailRow[];
    const report = formatHeadToHeadMarkdown(buildHeadToHead(rows));
    expect(report).toContain('FAILED (rate_limit_wait_cap_exceeded)');
    expect(report).toContain('Agent Failed');
  });

  it('computes human-judge agreement rate and confusion matrix', () => {
    const csv = [
      'judge_verdict,human_verdict',
      'correct,correct',
      'correct,partial',
      'partial,partial',
      'incorrect,incorrect'
    ].join('\n');

    const report = computeJudgeAgreement(csv);
    expect(report.total).toBe(4);
    expect(report.agreed).toBe(3);
    expect(report.agreementRate).toBe(0.75);
    expect(report.confusionMatrix['correct']['correct']).toBe(1);
    expect(report.confusionMatrix['correct']['partial']).toBe(1);
  });

  it('formats ASCII table with aligned columns', () => {
    const headers = ['System', 'Score'];
    const rows = [
      ['agentic', '1.0'],
      ['rag', '0.5']
    ];
    const table = formatAsciiTable(headers, rows);
    expect(table).toContain('System  | Score');
    expect(table).toContain('agentic | 1.0  ');
  });
});
