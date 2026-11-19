import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { extractSystemRanges, parseRunFinalAnswer } from '../scoring/scorer.js';
import { deriveRunTimingMetrics } from './metrics.js';

export interface RunDetailRow {
  run_id: string;
  system: string;
  corpus: string;
  question_id: string;
  question_type: string;
  model: string;
  status: string;
  total_tokens: number;
  cost_usd: number;
  repetition: number;
  latency_ms: number;
  step_count: number;
  db_time_ms: number;
  active_latency_ms?: number | null;
  rate_limit_count?: number | null;
  rate_limit_wait_ms?: number | null;
  pacing_wait_ms?: number | null;
  recovered_answer?: number;
  llm_attempts?: number | null;
  tool_call_failure_count?: number | null;
  embedding_ms?: number | null;
  pinecone_query_ms?: number | null;
  neon_fetch_ms?: number | null;
  answer_generation_ms?: number | null;
  other_latency_ms?: number | null;
  failure_reason?: string | null;
  last_error_class?: string | null;
  retrieval_hit_any: boolean;
  retrieval_hit_all: boolean;
  retrieval_recall: number;
  citation_correct: boolean;
  answer_score: number;
  judge_verdict: string;
  judge_reason: string;
  judge_tokens: number;
  judge_cost_usd: number;
  final_answer: string;
}

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(4));
}

export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
}

export function p95(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(idx, sorted.length - 1)];
}

export function stdDev(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  const variance = arr.reduce((acc, val) => acc + Math.pow(val - m, 2), 0) / (arr.length - 1);
  return Number(Math.sqrt(variance).toFixed(4));
}

export function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function fetchBatchRunRows(pool: pg.Pool, batchName: string, rootDir: string): Promise<RunDetailRow[]> {
  const query = `
    SELECT
      r.id as run_id,
      r.system,
      r.corpus,
      r.question_id,
      r.model,
      r.status,
      r.started_at,
      r.finished_at,
      r.final_answer,
      r.total_tokens,
      r.cost_usd,
      r.repetition,
      s.retrieval_hit_any,
      s.retrieval_hit_all,
      s.retrieval_recall,
      s.citation_correct,
      s.answer_score,
      s.judge_verdict,
      s.judge_reason,
      s.judge_tokens,
      s.judge_cost_usd
    FROM runs r
    INNER JOIN batches b ON r.batch_id = b.id
    LEFT JOIN scores s ON r.id = s.run_id
    WHERE b.id::text = $1 OR b.name = $1
    ORDER BY r.question_id, r.system, r.repetition;
  `;
  const result = await pool.query(query, [batchName]);

  const questionsCache: Record<string, Record<string, { type: string }>> = {};
  for (const corpus of ['express', 'fastapi']) {
    try {
      const qPath = path.join(rootDir, 'data', 'questions', `${corpus}.json`);
      const raw = await fs.readFile(qPath, 'utf8');
      const list = JSON.parse(raw);
      questionsCache[corpus] = {};
      for (const q of list) {
        questionsCache[corpus][q.id] = { type: q.type };
      }
    } catch {
      questionsCache[corpus] = {};
    }
  }

  const rows: RunDetailRow[] = [];

  for (const r of result.rows) {
    const eventsRes = await pool.query(
      'SELECT step, elapsed_ms, db_time_ms, type, args FROM events WHERE run_id = $1 ORDER BY step ASC, created_at ASC',
      [r.run_id]
    );
    const metrics = deriveRunTimingMetrics(eventsRes.rows, r.started_at, r.finished_at);
    const latencyMs = metrics.latency_ms ?? eventsRes.rows.reduce((sum, e) => sum + (e.elapsed_ms || 0), 0);
    const stepCount = metrics.step_count ?? 0;
    const retrievalEvent = eventsRes.rows.find((e) => e.type === 'retrieval');
    const dbTimeMs = retrievalEvent?.db_time_ms || 0;

    const qType = questionsCache[r.corpus]?.[r.question_id]?.type ?? 'unknown';

    rows.push({
      run_id: r.run_id,
      system: r.system,
      corpus: r.corpus,
      question_id: r.question_id,
      question_type: qType,
      model: r.model,
      status: r.status,
      total_tokens: r.total_tokens ?? 0,
      cost_usd: Number(r.cost_usd ?? 0),
      repetition: r.repetition ?? 1,
      latency_ms: latencyMs,
      step_count: stepCount,
      db_time_ms: dbTimeMs,
      active_latency_ms: metrics.active_latency_ms,
      rate_limit_count: metrics.rate_limit_count,
      rate_limit_wait_ms: metrics.rate_limit_wait_ms,
      pacing_wait_ms: metrics.pacing_wait_ms,
      recovered_answer: metrics.recovered_answer,
      llm_attempts: metrics.llm_attempts,
      tool_call_failure_count: metrics.tool_call_failure_count,
      embedding_ms: metrics.embedding_ms,
      pinecone_query_ms: metrics.pinecone_query_ms,
      neon_fetch_ms: metrics.neon_fetch_ms,
      answer_generation_ms: metrics.answer_generation_ms,
      other_latency_ms: metrics.other_latency_ms,
      failure_reason: metrics.failure_reason,
      last_error_class: metrics.last_error_class,
      retrieval_hit_any: r.retrieval_hit_any ?? false,
      retrieval_hit_all: r.retrieval_hit_all ?? false,
      retrieval_recall: Number(r.retrieval_recall ?? 0),
      citation_correct: r.citation_correct ?? false,
      answer_score: Number(r.answer_score ?? 0),
      judge_verdict: r.judge_verdict ?? 'none',
      judge_reason: r.judge_reason ?? '',
      judge_tokens: r.judge_tokens ?? 0,
      judge_cost_usd: Number(r.judge_cost_usd ?? 0),
      final_answer: r.final_answer ?? ''
    });
  }

  return rows;
}

export interface GroupSummary {
  system: string;
  corpus: string;
  question_type: string;
  total_runs: number;
  failures: number;
  pending: number;
  recovered_answers: number;
  hit_any_rate: number;
  hit_all_rate: number;
  mean_recall: number;
  citation_correct_rate: number;
  mean_score: number;
  score_std_dev: number;
  mean_tokens: number;
  median_tokens: number;
  mean_cost: number;
  mean_latency_ms: number;
  p95_latency_ms: number;
  mean_step_count: number;
  mean_db_time_ms: number;
  mean_active_latency_ms: number | null;
  mean_rate_limit_wait_ms: number | null;
  mean_pacing_wait_ms: number | null;
  mean_llm_attempts: number | null;
  mean_tool_call_failure_count: number | null;
}

function knownValues(rows: RunDetailRow[], key: keyof RunDetailRow): number[] {
  return rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === 'number');
}

export function aggregateRows(rows: RunDetailRow[]): GroupSummary[] {
  const groups: Record<string, RunDetailRow[]> = {};

  for (const r of rows) {
    const key = `${r.system}__${r.corpus}__${r.question_type}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }

  const summaries: GroupSummary[] = [];

  for (const [key, group] of Object.entries(groups)) {
    const [system, corpus, question_type] = key.split('__');
    const total_runs = group.length;
    const failures = group.filter((r) => r.status === 'failed').length;
    const pending = group.filter((r) => r.status === 'pending').length;

    const hitAnyCount = group.filter((r) => r.retrieval_hit_any).length;
    const hitAllCount = group.filter((r) => r.retrieval_hit_all).length;
    const citationCorrectCount = group.filter((r) => r.citation_correct).length;

    const scores = group.map((r) => r.answer_score);
    const recalls = group.map((r) => r.retrieval_recall);
    const tokens = group.map((r) => r.total_tokens);
    const costs = group.map((r) => r.cost_usd);
    const latencies = group.map((r) => r.latency_ms);
    const steps = group.map((r) => r.step_count);
    const dbTimes = group.map((r) => r.db_time_ms);
    const activeLatencies = knownValues(group, 'active_latency_ms');
    const rateLimitWaits = knownValues(group, 'rate_limit_wait_ms');
    const pacingWaits = knownValues(group, 'pacing_wait_ms');
    const llmAttempts = knownValues(group, 'llm_attempts');
    const toolCallFailures = knownValues(group, 'tool_call_failure_count');

    summaries.push({
      system,
      corpus,
      question_type,
      total_runs,
      failures,
      pending,
      recovered_answers: group.reduce((sum, row) => sum + (row.recovered_answer ?? 0), 0),
      hit_any_rate: Number((hitAnyCount / total_runs).toFixed(4)),
      hit_all_rate: Number((hitAllCount / total_runs).toFixed(4)),
      mean_recall: mean(recalls),
      citation_correct_rate: Number((citationCorrectCount / total_runs).toFixed(4)),
      mean_score: mean(scores),
      score_std_dev: stdDev(scores),
      mean_tokens: Math.round(mean(tokens)),
      median_tokens: Math.round(median(tokens)),
      mean_cost: Number(mean(costs).toFixed(6)),
      mean_latency_ms: Math.round(mean(latencies)),
      p95_latency_ms: Math.round(p95(latencies)),
      mean_step_count: Number(mean(steps).toFixed(1)),
      mean_db_time_ms: Math.round(mean(dbTimes)),
      mean_active_latency_ms: activeLatencies.length > 0 ? Math.round(mean(activeLatencies)) : null,
      mean_rate_limit_wait_ms: rateLimitWaits.length > 0 ? Math.round(mean(rateLimitWaits)) : null,
      mean_pacing_wait_ms: pacingWaits.length > 0 ? Math.round(mean(pacingWaits)) : null,
      mean_llm_attempts: llmAttempts.length > 0 ? Number(mean(llmAttempts).toFixed(1)) : null,
      mean_tool_call_failure_count: toolCallFailures.length > 0 ? Number(mean(toolCallFailures).toFixed(1)) : null
    });
  }

  return summaries;
}

export function formatAggregateMarkdownTable(summaries: GroupSummary[]): string {
  const headers = [
    'System', 'Corpus', 'Type', 'N', 'Fail', 'Pending', 'Recovered',
    'HitAny', 'HitAll', 'Recall', 'CiteCorr', 'Score', 'FailedRuns',
    'Tokens(M/Med)', 'Cost', 'Latency(Mean/P95)', 'ActiveMs', 'RateWaitMs', 'PacingWaitMs', 'Steps', 'LLMAttempts', 'ToolFails', 'DbMs'
  ];

  const rows = summaries.map((s) => [
    s.system,
    s.corpus,
    s.question_type,
    String(s.total_runs),
    String(s.failures),
    String(s.pending),
    String(s.recovered_answers),
    `${(s.hit_any_rate * 100).toFixed(0)}%`,
    `${(s.hit_all_rate * 100).toFixed(0)}%`,
    s.mean_recall.toFixed(2),
    `${(s.citation_correct_rate * 100).toFixed(0)}%`,
    s.mean_score.toFixed(2),
    String(s.failures),
    `${s.mean_tokens}/${s.median_tokens}`,
    `$${s.mean_cost.toFixed(4)}`,
    `${s.mean_latency_ms}/${s.p95_latency_ms}`,
    s.mean_active_latency_ms === null ? 'n/a' : String(s.mean_active_latency_ms),
    s.mean_rate_limit_wait_ms === null ? 'n/a' : String(s.mean_rate_limit_wait_ms),
    s.mean_pacing_wait_ms === null ? 'n/a' : String(s.mean_pacing_wait_ms),
    String(s.mean_step_count),
    s.mean_llm_attempts === null ? 'n/a' : String(s.mean_llm_attempts),
    s.mean_tool_call_failure_count === null ? 'n/a' : String(s.mean_tool_call_failure_count),
    s.system === 'rag' ? `${s.mean_db_time_ms}` : '-'
  ]);

  const headerLine = `| ${headers.join(' | ')} |`;
  const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyLines = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');

  return `${headerLine}\n${sepLine}\n${bodyLines}`;
}

export interface HeadToHeadRow {
  question_id: string;
  corpus?: string;
  question_type?: string;
  agentic_run_id?: string;
  rag_run_id?: string;
  agentic_score: number;
  rag_score: number;
  agentic_hit_all: boolean;
  rag_hit_all: boolean;
  agentic_tokens: number;
  rag_tokens: number;
  agentic_cost_usd?: number;
  rag_cost_usd?: number;
  agentic_latency_ms: number;
  rag_latency_ms: number;
  agentic_active_latency_ms?: number | null;
  rag_active_latency_ms?: number | null;
  agentic_rate_limit_wait_ms?: number | null;
  rag_rate_limit_wait_ms?: number | null;
  agentic_step_count?: number | null;
  rag_step_count?: number | null;
  agentic_llm_attempts?: number | null;
  rag_llm_attempts?: number | null;
  agentic_tool_call_failure_count?: number | null;
  rag_tool_call_failure_count?: number | null;
  agentic_status?: string;
  rag_status?: string;
  agentic_failure_reason?: string | null;
  rag_failure_reason?: string | null;
  winner: 'agentic' | 'rag' | 'tie';
}

export function buildHeadToHead(rows: RunDetailRow[]): HeadToHeadRow[] {
  const byQuestion: Record<string, { agentic?: RunDetailRow; rag?: RunDetailRow }> = {};

  for (const r of rows) {
    if (!byQuestion[r.question_id]) {
      byQuestion[r.question_id] = {};
    }
    if (r.system === 'agentic') byQuestion[r.question_id].agentic = r;
    if (r.system === 'rag') byQuestion[r.question_id].rag = r;
  }

  const h2h: HeadToHeadRow[] = [];

  for (const [qid, pair] of Object.entries(byQuestion)) {
    const a = pair.agentic;
    const r = pair.rag;
    if (!a || !r) continue;

    let winner: 'agentic' | 'rag' | 'tie' = 'tie';
    if (a.answer_score > r.answer_score) {
      winner = 'agentic';
    } else if (r.answer_score > a.answer_score) {
      winner = 'rag';
    } else if (a.retrieval_hit_all && !r.retrieval_hit_all) {
      winner = 'agentic';
    } else if (r.retrieval_hit_all && !a.retrieval_hit_all) {
      winner = 'rag';
    }

    h2h.push({
      question_id: qid,
      corpus: a.corpus || r.corpus,
      question_type: a.question_type || r.question_type,
      agentic_run_id: a.run_id,
      rag_run_id: r.run_id,
      agentic_score: a.answer_score,
      rag_score: r.answer_score,
      agentic_hit_all: a.retrieval_hit_all,
      rag_hit_all: r.retrieval_hit_all,
      agentic_tokens: a.total_tokens,
      rag_tokens: r.total_tokens,
      agentic_cost_usd: a.cost_usd,
      rag_cost_usd: r.cost_usd,
      agentic_latency_ms: a.latency_ms,
      rag_latency_ms: r.latency_ms,
      agentic_active_latency_ms: a.active_latency_ms,
      rag_active_latency_ms: r.active_latency_ms,
      agentic_rate_limit_wait_ms: a.rate_limit_wait_ms,
      rag_rate_limit_wait_ms: r.rate_limit_wait_ms,
      agentic_step_count: a.step_count,
      rag_step_count: r.step_count,
      agentic_llm_attempts: a.llm_attempts,
      rag_llm_attempts: r.llm_attempts,
      agentic_tool_call_failure_count: a.tool_call_failure_count,
      rag_tool_call_failure_count: r.tool_call_failure_count,
      agentic_status: a.status,
      rag_status: r.status,
      agentic_failure_reason: a.failure_reason,
      rag_failure_reason: r.failure_reason,
      winner
    });
  }

  return h2h;
}

export function formatHeadToHeadMarkdown(h2h: HeadToHeadRow[]): string {
  const headers = ['Question', 'Agent Score', 'Agent Failed', 'RAG Score', 'RAG Failed', 'Agent HitAll', 'RAG HitAll', 'Agent Tok', 'RAG Tok', 'Agent Lat/Active', 'RAG Lat/Active', 'Agent Wait', 'RAG Wait', 'Agent Steps/LLM/Fail', 'RAG Steps/LLM/Fail', 'Winner'];
  const compactMetrics = (latency: number, active: number | null | undefined): string => {
    const value = (item: number | null | undefined) => item === null || item === undefined ? 'n/a' : String(item);
    return `${latency}/${value(active)}`;
  };
  const rows = h2h.map((h) => [
    h.question_id,
    h.agentic_status === 'failed' ? `FAILED (${h.agentic_failure_reason ?? 'unknown'})` : h.agentic_status === 'pending' ? 'PENDING' : h.agentic_score.toFixed(1),
    h.agentic_status === 'failed' ? '1' : '0',
    h.rag_status === 'failed' ? `FAILED (${h.rag_failure_reason ?? 'unknown'})` : h.rag_status === 'pending' ? 'PENDING' : h.rag_score.toFixed(1),
    h.rag_status === 'failed' ? '1' : '0',
    h.agentic_hit_all ? 'yes' : 'no',
    h.rag_hit_all ? 'yes' : 'no',
    String(h.agentic_tokens),
    String(h.rag_tokens),
    compactMetrics(h.agentic_latency_ms, h.agentic_active_latency_ms),
    compactMetrics(h.rag_latency_ms, h.rag_active_latency_ms),
    h.agentic_rate_limit_wait_ms === null || h.agentic_rate_limit_wait_ms === undefined ? 'n/a' : String(h.agentic_rate_limit_wait_ms),
    h.rag_rate_limit_wait_ms === null || h.rag_rate_limit_wait_ms === undefined ? 'n/a' : String(h.rag_rate_limit_wait_ms),
    `${h.agentic_step_count ?? 'n/a'}/${h.agentic_llm_attempts ?? 'n/a'}/${h.agentic_tool_call_failure_count ?? 'n/a'}`,
    `${h.rag_step_count ?? 'n/a'}/${h.rag_llm_attempts ?? 'n/a'}/${h.rag_tool_call_failure_count ?? 'n/a'}`,
    `**${h.winner.toUpperCase()}**`
  ]);

  const headerLine = `| ${headers.join(' | ')} |`;
  const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyLines = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');

  return `${headerLine}\n${sepLine}\n${bodyLines}`;
}

export async function generateFailuresMarkdown(
  rows: RunDetailRow[],
  rootDir: string
): Promise<string> {
  const failedRuns = rows.filter((r) => r.judge_verdict === 'incorrect' || r.status === 'failed');
  if (failedRuns.length === 0) {
    return '# Benchmark Failures Report\n\nNo failed runs found in this batch.\n';
  }

  const questionsCache: Record<string, Record<string, { question: string; reference_answer: string; ground_truth: unknown[] }>> = {};
  for (const corpus of ['express', 'fastapi']) {
    try {
      const qPath = path.join(rootDir, 'data', 'questions', `${corpus}.json`);
      const raw = await fs.readFile(qPath, 'utf8');
      const list = JSON.parse(raw);
      questionsCache[corpus] = {};
      for (const q of list) {
        questionsCache[corpus][q.id] = q;
      }
    } catch {
      questionsCache[corpus] = {};
    }
  }

  let md = '# Benchmark Failures Review\n\n';

  for (const r of failedRuns) {
    const q = questionsCache[r.corpus]?.[r.question_id];
    const payload = parseRunFinalAnswer(r.final_answer);
    const systemRanges = extractSystemRanges(payload);

    md += `## [${r.system.toUpperCase()}] ${r.question_id} (${r.corpus})\n`;
    md += `**Question**: ${q?.question ?? r.question_id}\n\n`;
    md += `**Reference Answer**: ${q?.reference_answer ?? '(none)'}\n\n`;
    md += `**Ground Truth**:\n`;
    if (q?.ground_truth && Array.isArray(q.ground_truth)) {
      for (const gt of q.ground_truth as Array<{ file: string; start_line: number; end_line: number }>) {
        md += `- \`${gt.file}:${gt.start_line}-${gt.end_line}\`\n`;
      }
    }
    md += `\n**Read/Retrieved by System**:\n`;
    if (systemRanges.length === 0) {
      md += `(none)\n`;
    } else {
      for (const sr of systemRanges) {
        md += `- \`${sr.file}:${sr.start_line}-${sr.end_line}\`\n`;
      }
    }
    md += `\n**System Answer**:\n${payload.answer || r.final_answer}\n\n`;
    md += `**Judge Verdict**: \`${r.judge_verdict}\`\n`;
    if (r.status === 'failed') {
      md += `**Failure Reason**: ${r.failure_reason ?? 'n/a'}\n`;
      md += `**Last Error Class**: ${r.last_error_class ?? 'n/a'}\n`;
    }
    md += `**Judge Reason**: ${r.judge_reason}\n\n`;
    md += `---\n\n`;
  }

  return md;
}

export function exportRunsCsv(rows: RunDetailRow[]): string {
  const headers = [
    'run_id', 'system', 'corpus', 'question_id', 'question_type', 'model', 'status',
    'repetition', 'total_tokens', 'cost_usd', 'latency_ms', 'active_latency_ms', 'rate_limit_wait_ms', 'pacing_wait_ms', 'rate_limit_count', 'recovered_answer', 'llm_attempts', 'tool_call_failure_count', 'step_count', 'db_time_ms',
    'retrieval_hit_any', 'retrieval_hit_all', 'retrieval_recall', 'citation_correct',
    'answer_score', 'failure_reason', 'last_error_class', 'judge_verdict', 'judge_reason', 'judge_tokens', 'judge_cost_usd'
  ];

  const lines = [headers.join(',')];

  for (const r of rows) {
    const line = [
      escapeCsv(r.run_id),
      escapeCsv(r.system),
      escapeCsv(r.corpus),
      escapeCsv(r.question_id),
      escapeCsv(r.question_type),
      escapeCsv(r.model),
      escapeCsv(r.status),
      r.repetition,
      r.total_tokens,
      r.cost_usd,
      r.latency_ms,
      r.active_latency_ms,
      r.rate_limit_wait_ms,
      r.pacing_wait_ms,
      r.rate_limit_count,
      r.recovered_answer,
      r.llm_attempts,
      r.tool_call_failure_count,
      r.step_count,
      r.db_time_ms,
      r.retrieval_hit_any,
      r.retrieval_hit_all,
      r.retrieval_recall,
      r.citation_correct,
      r.answer_score,
      escapeCsv(r.failure_reason),
      escapeCsv(r.last_error_class),
      escapeCsv(r.judge_verdict),
      escapeCsv(r.judge_reason),
      r.judge_tokens,
      r.judge_cost_usd
    ].join(',');
    lines.push(line);
  }

  return lines.join('\n');
}

export function formatAsciiTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length))
  );

  const formatRow = (cells: string[]) =>
    cells.map((c, i) => (c ?? '').padEnd(colWidths[i])).join(' | ');

  const separator = colWidths.map((w) => '-'.repeat(w)).join('-+-');

  return [formatRow(headers), separator, ...rows.map((r) => formatRow(r))].join('\n');
}

export function generateAsciiSummary(summaries: GroupSummary[], h2h: HeadToHeadRow[]): string {
  const aggHeaders = [
    'System', 'Corpus', 'Type', 'N', 'Fail',
    'HitAny', 'HitAll', 'Recall', 'CiteCorr', 'Score',
    'Tokens', 'Cost', 'Latency(ms)', 'Steps', 'DbMs'
    , 'ActiveMs', 'RateWaitMs', 'PacingWaitMs', 'LLMAttempts', 'ToolFails', 'Pending', 'Recovered'
  ];
  const aggRows = summaries.map((s) => [
    s.system,
    s.corpus,
    s.question_type,
    String(s.total_runs),
    String(s.failures),
    `${(s.hit_any_rate * 100).toFixed(0)}%`,
    `${(s.hit_all_rate * 100).toFixed(0)}%`,
    s.mean_recall.toFixed(2),
    `${(s.citation_correct_rate * 100).toFixed(0)}%`,
    s.mean_score.toFixed(2),
    `${s.mean_tokens}`,
    `$${s.mean_cost.toFixed(4)}`,
    `${s.mean_latency_ms}`,
    String(s.mean_step_count),
    s.system === 'rag' ? `${s.mean_db_time_ms}` : '-',
    s.mean_active_latency_ms === null ? 'n/a' : String(s.mean_active_latency_ms),
    s.mean_rate_limit_wait_ms === null ? 'n/a' : String(s.mean_rate_limit_wait_ms),
    s.mean_pacing_wait_ms === null ? 'n/a' : String(s.mean_pacing_wait_ms),
    s.mean_llm_attempts === null ? 'n/a' : String(s.mean_llm_attempts),
    s.mean_tool_call_failure_count === null ? 'n/a' : String(s.mean_tool_call_failure_count),
    String(s.pending),
    String(s.recovered_answers)
  ]);

  const h2hHeaders = ['Question', 'Agent Score', 'Agent Failed', 'RAG Score', 'RAG Failed', 'Agent HitAll', 'RAG HitAll', 'Agent Tok', 'RAG Tok', 'Agent Lat/Active', 'RAG Lat/Active', 'Agent Wait', 'RAG Wait', 'Agent Steps/LLM/Fail', 'RAG Steps/LLM/Fail', 'Winner'];
  const h2hRows = h2h.map((h) => [
    h.question_id,
    h.agentic_status === 'failed' ? 'FAILED' : h.agentic_status === 'pending' ? 'PENDING' : h.agentic_score.toFixed(1),
    h.agentic_status === 'failed' ? '1' : '0',
    h.rag_status === 'failed' ? 'FAILED' : h.rag_status === 'pending' ? 'PENDING' : h.rag_score.toFixed(1),
    h.rag_status === 'failed' ? '1' : '0',
    h.agentic_hit_all ? 'yes' : 'no',
    h.rag_hit_all ? 'yes' : 'no',
    String(h.agentic_tokens),
    String(h.rag_tokens),
    `${h.agentic_latency_ms}/${h.agentic_active_latency_ms ?? 'n/a'}`,
    `${h.rag_latency_ms}/${h.rag_active_latency_ms ?? 'n/a'}`,
    String(h.agentic_rate_limit_wait_ms ?? 'n/a'),
    String(h.rag_rate_limit_wait_ms ?? 'n/a'),
    `${h.agentic_step_count ?? 'n/a'}/${h.agentic_llm_attempts ?? 'n/a'}/${h.agentic_tool_call_failure_count ?? 'n/a'}`,
    `${h.rag_step_count ?? 'n/a'}/${h.rag_llm_attempts ?? 'n/a'}/${h.rag_tool_call_failure_count ?? 'n/a'}`,
    h.winner.toUpperCase()
  ]);

  return [
    '=== AGGREGATE SUMMARY ===',
    formatAsciiTable(aggHeaders, aggRows),
    '',
    '=== HEAD-TO-HEAD COMPARISON ===',
    formatAsciiTable(h2hHeaders, h2hRows)
  ].join('\n');
}

export async function sampleRunsForJudging(
  pool: pg.Pool,
  batchName: string,
  n: number,
  rootDir: string
): Promise<string> {
  const rows = await fetchBatchRunRows(pool, batchName, rootDir);
  const shuffled = [...rows].sort(() => 0.5 - Math.random());
  const sampled = shuffled.slice(0, n);

  const questionsCache: Record<string, Record<string, { question: string; reference_answer: string }>> = {};
  for (const corpus of ['express', 'fastapi']) {
    try {
      const qPath = path.join(rootDir, 'data', 'questions', `${corpus}.json`);
      const raw = await fs.readFile(qPath, 'utf8');
      const list = JSON.parse(raw);
      questionsCache[corpus] = {};
      for (const q of list) {
        questionsCache[corpus][q.id] = q;
      }
    } catch {
      questionsCache[corpus] = {};
    }
  }

  const headers = [
    'run_id', 'corpus', 'question_id', 'question', 'reference_answer',
    'candidate_answer', 'citations', 'judge_verdict', 'judge_reason', 'human_verdict'
  ];

  const lines = [headers.join(',')];
  for (const r of sampled) {
    const q = questionsCache[r.corpus]?.[r.question_id];
    const payload = parseRunFinalAnswer(r.final_answer);
    const citStr = (payload.citations || []).map((c) => `${c.file}:${c.start_line}-${c.end_line}`).join('; ');

    lines.push([
      escapeCsv(r.run_id),
      escapeCsv(r.corpus),
      escapeCsv(r.question_id),
      escapeCsv(q?.question ?? ''),
      escapeCsv(q?.reference_answer ?? ''),
      escapeCsv(payload.answer || r.final_answer),
      escapeCsv(citStr),
      escapeCsv(r.judge_verdict),
      escapeCsv(r.judge_reason),
      ''
    ].join(','));
  }

  return lines.join('\n');
}

export interface AgreementReport {
  total: number;
  agreed: number;
  agreementRate: number;
  confusionMatrix: Record<string, Record<string, number>>;
}

export function computeJudgeAgreement(csvContent: string): AgreementReport {
  const lines = csvContent.trim().split('\n');
  if (lines.length <= 1) {
    return {
      total: 0,
      agreed: 0,
      agreementRate: 0,
      confusionMatrix: {
        correct: { correct: 0, partial: 0, incorrect: 0 },
        partial: { correct: 0, partial: 0, incorrect: 0 },
        incorrect: { correct: 0, partial: 0, incorrect: 0 }
      }
    };
  }

  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur);
    return result;
  };

  const headers = parseCsvLine(lines[0]);
  const judgeIdx = headers.indexOf('judge_verdict');
  const humanIdx = headers.indexOf('human_verdict');

  if (judgeIdx === -1 || humanIdx === -1) {
    throw new Error('CSV must contain judge_verdict and human_verdict columns');
  }

  const matrix: Record<string, Record<string, number>> = {
    correct: { correct: 0, partial: 0, incorrect: 0 },
    partial: { correct: 0, partial: 0, incorrect: 0 },
    incorrect: { correct: 0, partial: 0, incorrect: 0 }
  };

  let total = 0;
  let agreed = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const jv = row[judgeIdx]?.trim().toLowerCase();
    const hv = row[humanIdx]?.trim().toLowerCase();
    if (!jv || !hv || !matrix[jv] || matrix[jv][hv] === undefined) continue;

    total++;
    matrix[jv][hv]++;
    if (jv === hv) {
      agreed++;
    }
  }

  const rate = total > 0 ? Number((agreed / total).toFixed(4)) : 0;
  return {
    total,
    agreed,
    agreementRate: rate,
    confusionMatrix: matrix
  };
}
