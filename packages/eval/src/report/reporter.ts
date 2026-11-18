import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { extractSystemRanges, parseRunFinalAnswer } from '../scoring/scorer.js';

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
    WHERE b.name = $1
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
      'SELECT step, elapsed_ms, db_time_ms, type FROM events WHERE run_id = $1 ORDER BY step ASC',
      [r.run_id]
    );

    const stepCount = eventsRes.rows.length;
    const latencyMs = eventsRes.rows.reduce((sum, e) => sum + (e.elapsed_ms || 0), 0);
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

    summaries.push({
      system,
      corpus,
      question_type,
      total_runs,
      failures,
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
      mean_db_time_ms: Math.round(mean(dbTimes))
    });
  }

  return summaries;
}

export function formatAggregateMarkdownTable(summaries: GroupSummary[]): string {
  const headers = [
    'System', 'Corpus', 'Type', 'N', 'Fail',
    'HitAny', 'HitAll', 'Recall', 'CiteCorr', 'Score',
    'Tokens(M/Med)', 'Cost', 'Latency(Mean/P95)', 'Steps', 'DbMs'
  ];

  const rows = summaries.map((s) => [
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
    `${s.mean_tokens}/${s.median_tokens}`,
    `$${s.mean_cost.toFixed(4)}`,
    `${s.mean_latency_ms}/${s.p95_latency_ms}`,
    String(s.mean_step_count),
    s.system === 'rag' ? `${s.mean_db_time_ms}` : '-'
  ]);

  const headerLine = `| ${headers.join(' | ')} |`;
  const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyLines = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');

  return `${headerLine}\n${sepLine}\n${bodyLines}`;
}

export interface HeadToHeadRow {
  question_id: string;
  agentic_score: number;
  rag_score: number;
  agentic_hit_all: boolean;
  rag_hit_all: boolean;
  agentic_tokens: number;
  rag_tokens: number;
  agentic_latency_ms: number;
  rag_latency_ms: number;
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
      agentic_score: a.answer_score,
      rag_score: r.answer_score,
      agentic_hit_all: a.retrieval_hit_all,
      rag_hit_all: r.retrieval_hit_all,
      agentic_tokens: a.total_tokens,
      rag_tokens: r.total_tokens,
      agentic_latency_ms: a.latency_ms,
      rag_latency_ms: r.latency_ms,
      winner
    });
  }

  return h2h;
}

export function formatHeadToHeadMarkdown(h2h: HeadToHeadRow[]): string {
  const headers = ['Question', 'Agent Score', 'RAG Score', 'Agent HitAll', 'RAG HitAll', 'Agent Tok', 'RAG Tok', 'Agent Lat(ms)', 'RAG Lat(ms)', 'Winner'];
  const rows = h2h.map((h) => [
    h.question_id,
    h.agentic_score.toFixed(1),
    h.rag_score.toFixed(1),
    h.agentic_hit_all ? 'yes' : 'no',
    h.rag_hit_all ? 'yes' : 'no',
    String(h.agentic_tokens),
    String(h.rag_tokens),
    String(h.agentic_latency_ms),
    String(h.rag_latency_ms),
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
    md += `**Judge Reason**: ${r.judge_reason}\n\n`;
    md += `---\n\n`;
  }

  return md;
}

export function exportRunsCsv(rows: RunDetailRow[]): string {
  const headers = [
    'run_id', 'system', 'corpus', 'question_id', 'question_type', 'model', 'status',
    'repetition', 'total_tokens', 'cost_usd', 'latency_ms', 'step_count', 'db_time_ms',
    'retrieval_hit_any', 'retrieval_hit_all', 'retrieval_recall', 'citation_correct',
    'answer_score', 'judge_verdict', 'judge_reason', 'judge_tokens', 'judge_cost_usd'
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
      r.step_count,
      r.db_time_ms,
      r.retrieval_hit_any,
      r.retrieval_hit_all,
      r.retrieval_recall,
      r.citation_correct,
      r.answer_score,
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
    s.system === 'rag' ? `${s.mean_db_time_ms}` : '-'
  ]);

  const h2hHeaders = ['Question', 'Agent Score', 'RAG Score', 'Agent HitAll', 'RAG HitAll', 'Agent Tok', 'RAG Tok', 'Agent Lat(ms)', 'RAG Lat(ms)', 'Winner'];
  const h2hRows = h2h.map((h) => [
    h.question_id,
    h.agentic_score.toFixed(1),
    h.rag_score.toFixed(1),
    h.agentic_hit_all ? 'yes' : 'no',
    h.rag_hit_all ? 'yes' : 'no',
    String(h.agentic_tokens),
    String(h.rag_tokens),
    String(h.agentic_latency_ms),
    String(h.rag_latency_ms),
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
