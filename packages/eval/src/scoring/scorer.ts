import crypto from 'node:crypto';
import pg from 'pg';
import { GroundTruthLocation, LLMClient, Question, Run, ScoreRecord } from '@greptrace/core';
import { judgeAnswer } from './judge.js';
import { computeRetrievalMetrics } from './overlap.js';

export interface ParsedFinalPayload {
  answer: string;
  citations: GroundTruthLocation[];
  read_ranges?: GroundTruthLocation[];
  retrieved_chunks?: Array<{ file: string; start_line: number; end_line: number }>;
}

export function parseRunFinalAnswer(raw: string | null | undefined): ParsedFinalPayload {
  if (!raw) {
    return { answer: '', citations: [] };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      answer: parsed.answer ?? '',
      citations: parsed.citations ?? [],
      read_ranges: parsed.read_ranges,
      retrieved_chunks: parsed.retrieved_chunks
    };
  } catch {
    return { answer: raw, citations: [] };
  }
}

export function extractSystemRanges(payload: ParsedFinalPayload): GroundTruthLocation[] {
  if (payload.read_ranges && payload.read_ranges.length > 0) {
    return payload.read_ranges;
  }
  if (payload.retrieved_chunks && payload.retrieved_chunks.length > 0) {
    return payload.retrieved_chunks.map((c) => ({
      file: c.file,
      start_line: c.start_line,
      end_line: c.end_line
    }));
  }
  return [];
}

export async function scoreRun(
  pool: pg.Pool,
  run: Run,
  question: Question,
  judgeClient: LLMClient,
  judgeModel: string,
  rejudge = false
): Promise<ScoreRecord> {
  const existingRes = await pool.query('SELECT * FROM scores WHERE run_id = $1', [run.id]);
  if (existingRes.rows.length > 0 && !rejudge) {
    const row = existingRes.rows[0];
    return {
      id: row.id,
      run_id: row.run_id,
      retrieval_hit_any: row.retrieval_hit_any,
      retrieval_hit_all: row.retrieval_hit_all,
      retrieval_recall: Number(row.retrieval_recall),
      citation_correct: row.citation_correct,
      answer_score: Number(row.answer_score),
      judge_verdict: row.judge_verdict,
      judge_reason: row.judge_reason,
      judge_model: row.judge_model,
      judge_tokens: row.judge_tokens,
      judge_cost_usd: row.judge_cost_usd ? Number(row.judge_cost_usd) : null,
      scored_at: row.scored_at
    };
  }

  const payload = parseRunFinalAnswer(run.final_answer);
  const systemRanges = extractSystemRanges(payload);

  if (run.status === 'failed') {
    const scoreId = crypto.randomUUID();
    const query = `
      INSERT INTO scores (
        id, run_id, retrieval_hit_any, retrieval_hit_all, retrieval_recall,
        citation_correct, answer_score, judge_verdict, judge_reason, judge_model,
        judge_tokens, judge_cost_usd, scored_at
      ) VALUES ($1, $2, false, false, 0, false, 0, 'incorrect', 'Run status failed', $3, 0, 0, NOW())
      ON CONFLICT (run_id) DO UPDATE SET
        retrieval_hit_any = EXCLUDED.retrieval_hit_any,
        retrieval_hit_all = EXCLUDED.retrieval_hit_all,
        retrieval_recall = EXCLUDED.retrieval_recall,
        citation_correct = EXCLUDED.citation_correct,
        answer_score = EXCLUDED.answer_score,
        judge_verdict = EXCLUDED.judge_verdict,
        judge_reason = EXCLUDED.judge_reason,
        judge_model = EXCLUDED.judge_model,
        judge_tokens = EXCLUDED.judge_tokens,
        judge_cost_usd = EXCLUDED.judge_cost_usd,
        scored_at = NOW()
      RETURNING *;
    `;
    const res = await pool.query(query, [scoreId, run.id, judgeModel]);
    const row = res.rows[0];
    return {
      id: row.id,
      run_id: row.run_id,
      retrieval_hit_any: row.retrieval_hit_any,
      retrieval_hit_all: row.retrieval_hit_all,
      retrieval_recall: Number(row.retrieval_recall),
      citation_correct: row.citation_correct,
      answer_score: Number(row.answer_score),
      judge_verdict: row.judge_verdict,
      judge_reason: row.judge_reason,
      judge_model: row.judge_model,
      judge_tokens: row.judge_tokens,
      judge_cost_usd: row.judge_cost_usd ? Number(row.judge_cost_usd) : null,
      scored_at: row.scored_at
    };
  }

  const retrievalMetrics = computeRetrievalMetrics(
    question.ground_truth,
    systemRanges,
    payload.citations
  );

  const judgeResult = await judgeAnswer(
    judgeClient,
    judgeModel,
    question.question,
    question.reference_answer,
    payload.answer,
    payload.citations
  );

  const scoreId = crypto.randomUUID();
  const query = `
    INSERT INTO scores (
      id, run_id, retrieval_hit_any, retrieval_hit_all, retrieval_recall,
      citation_correct, answer_score, judge_verdict, judge_reason, judge_model,
      judge_tokens, judge_cost_usd, scored_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
    ON CONFLICT (run_id) DO UPDATE SET
      retrieval_hit_any = EXCLUDED.retrieval_hit_any,
      retrieval_hit_all = EXCLUDED.retrieval_hit_all,
      retrieval_recall = EXCLUDED.retrieval_recall,
      citation_correct = EXCLUDED.citation_correct,
      answer_score = EXCLUDED.answer_score,
      judge_verdict = EXCLUDED.judge_verdict,
      judge_reason = EXCLUDED.judge_reason,
      judge_model = EXCLUDED.judge_model,
      judge_tokens = EXCLUDED.judge_tokens,
      judge_cost_usd = EXCLUDED.judge_cost_usd,
      scored_at = NOW()
    RETURNING *;
  `;
  const values = [
    scoreId,
    run.id,
    retrievalMetrics.retrieval_hit_any,
    retrievalMetrics.retrieval_hit_all,
    retrievalMetrics.retrieval_recall,
    retrievalMetrics.citation_correct,
    judgeResult.score,
    judgeResult.verdict,
    judgeResult.reason,
    judgeModel,
    judgeResult.tokens,
    judgeResult.costUsd
  ];

  const res = await pool.query(query, values);
  const row = res.rows[0];
  return {
    id: row.id,
    run_id: row.run_id,
    retrieval_hit_any: row.retrieval_hit_any,
    retrieval_hit_all: row.retrieval_hit_all,
    retrieval_recall: Number(row.retrieval_recall),
    citation_correct: row.citation_correct,
    answer_score: Number(row.answer_score),
    judge_verdict: row.judge_verdict,
    judge_reason: row.judge_reason,
    judge_model: row.judge_model,
    judge_tokens: row.judge_tokens,
    judge_cost_usd: row.judge_cost_usd ? Number(row.judge_cost_usd) : null,
    scored_at: row.scored_at
  };
}
