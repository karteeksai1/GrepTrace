import { RunEvent, RunRecord } from '../types.js';

export interface RunTimingMetrics {
  latencyMs: number | null;
  activeLatencyMs: number | null;
  rateLimitWaitMs: number | null;
  llmAttempts: number | null;
  toolCallFailureCount: number | null;
  stepCount: number | null;
  embeddingMs: number | null;
  pineconeQueryMs: number | null;
  neonFetchMs: number | null;
  answerGenerationMs: number | null;
  otherLatencyMs: number | null;
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function deriveRunTimingMetrics(events: RunEvent[], run?: RunRecord): RunTimingMetrics {
  const started = run?.started_at ? Date.parse(run.started_at) : NaN;
  const finished = run?.finished_at ? Date.parse(run.finished_at) : NaN;
  const latencyMs = Number.isFinite(started) && Number.isFinite(finished)
    ? Math.max(0, finished - started)
    : events.length > 0
      ? events.reduce((total, event) => total + (event.elapsed_ms ?? 0), 0)
      : null;
  const failures = events.filter((event) => event.type === 'llm_attempt_failed');
  const modelTurns = events.filter((event) => event.type === 'model_turn');
  const hasAttemptMetadata = failures.length > 0 || modelTurns.some((event) => event.args && 'llm_attempts' in event.args);
  const rateLimitWaitMs = hasAttemptMetadata
    ? failures.reduce((total, event) => total + (numeric(event.args?.wait_ms) ?? 0), 0) +
      modelTurns.reduce((total, event) => total + (numeric(event.args?.rate_limit_wait_ms) ?? 0), 0)
    : null;
  const llmAttempts = hasAttemptMetadata
    ? modelTurns.reduce((total, event) => total + (numeric(event.args?.llm_attempts) ?? 1), 0) +
      (modelTurns.length === 0 ? failures.length : 0)
    : null;
  const toolCallFailureCount = hasAttemptMetadata
    ? failures.filter((event) => event.args?.reason === 'tool_call_failed').length
    : null;
  const activeLatencyMs = latencyMs !== null && rateLimitWaitMs !== null
    ? Math.max(0, latencyMs - rateLimitWaitMs)
    : null;
  const retrieval = events.find((event) => event.type === 'retrieval');
  const retrievalMs = numeric(retrieval?.elapsed_ms);
  const pineconeQueryMs = numeric(retrieval?.args?.pinecone_query_ms) ?? numeric(retrieval?.db_time_ms);
  const embeddingMs = numeric(retrieval?.args?.embedding_ms) ?? (
    retrievalMs !== null && pineconeQueryMs !== null ? Math.max(0, retrievalMs - pineconeQueryMs) : null
  );
  const neonFetchMs = numeric(retrieval?.args?.neon_fetch_ms) ?? (retrieval ? 0 : null);
  const answerGenerationMs = retrieval
    ? modelTurns.reduce((total, event) => total + (event.elapsed_ms ?? 0), 0)
    : null;
  const components = [embeddingMs, pineconeQueryMs, neonFetchMs, answerGenerationMs];
  const otherLatencyMs = latencyMs !== null && components.every((value) => value !== null)
    ? Math.max(0, latencyMs - components.reduce((total, value) => total + (value ?? 0), 0))
    : null;

  return {
    latencyMs,
    activeLatencyMs,
    rateLimitWaitMs,
    llmAttempts,
    toolCallFailureCount,
    stepCount: events.length > 0 ? modelTurns.length : null,
    embeddingMs,
    pineconeQueryMs,
    neonFetchMs,
    answerGenerationMs,
    otherLatencyMs
  };
}
