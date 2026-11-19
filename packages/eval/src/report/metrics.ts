export interface EventMetricInput {
  type: string;
  elapsed_ms?: number | null;
  db_time_ms?: number | null;
  args?: Record<string, unknown> | null;
  result_summary?: string | null;
}

export interface RunTimingMetrics {
  latency_ms: number | null;
  active_latency_ms: number | null;
  rate_limit_count: number | null;
  rate_limit_wait_ms: number | null;
  pacing_wait_ms: number | null;
  recovered_answer: number;
  llm_attempts: number | null;
  tool_call_failure_count: number | null;
  step_count: number | null;
  embedding_ms: number | null;
  pinecone_query_ms: number | null;
  neon_fetch_ms: number | null;
  answer_generation_ms: number | null;
  other_latency_ms: number | null;
  failure_reason: string | null;
  last_error_class: string | null;
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sum(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : known.reduce((total, value) => total + value, 0);
}

function timestampMs(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveRunTimingMetrics(
  events: EventMetricInput[],
  startedAt?: Date | string | null,
  finishedAt?: Date | string | null
): RunTimingMetrics {
  const startedMs = timestampMs(startedAt);
  const finishedMs = timestampMs(finishedAt);
  const timestampLatency = startedMs !== null && finishedMs !== null
    ? Math.max(0, finishedMs - startedMs)
    : null;
  const eventLatency = sum(events.map((event) => numeric(event.elapsed_ms) ?? 0)) ?? 0;
  const latencyMs = timestampLatency ?? (events.length > 0 ? eventLatency : null);
  const failedAttempts = events.filter((event) => event.type === 'llm_attempt_failed');
  const modelTurns = events.filter((event) => event.type === 'model_turn');
  const failedCalls = events.filter((event) => event.type === 'llm_call_failed');
  const errorEvent = [...events].reverse().find((event) => event.type === 'error');
  const failureEvent = failedCalls[failedCalls.length - 1];
  const failureReason = typeof failureEvent?.args?.failure_reason === 'string'
    ? failureEvent.args.failure_reason
    : typeof errorEvent?.args?.failure_reason === 'string'
      ? errorEvent.args.failure_reason
      : errorEvent?.result_summary ?? null;
  const lastErrorClass = typeof failureEvent?.args?.last_error_class === 'string'
    ? failureEvent.args.last_error_class
    : typeof errorEvent?.args?.last_error_class === 'string'
      ? errorEvent.args.last_error_class
      : null;
  const hasAttemptMetadata = failedAttempts.length > 0 || failedCalls.length > 0 || modelTurns.some((event) => {
    return event.args && Object.prototype.hasOwnProperty.call(event.args, 'llm_attempts');
  });
  const rateLimitWaitMs = hasAttemptMetadata
    ? (sum(failedAttempts.map((event) => numeric(event.args?.wait_ms) ?? 0)) ?? 0)
    : null;
  const pacingWaitMs = hasAttemptMetadata
    ? (sum(modelTurns.map((event) => numeric(event.args?.pacing_wait_ms) ?? 0)) ?? 0)
    : null;
  const rateLimitCount = hasAttemptMetadata
    ? failedAttempts.filter((event) => event.args?.reason === 'rate_limited' || event.args?.reason === 'daily_quota_exhausted').length
    : null;
  const toolCallFailureCount = hasAttemptMetadata
    ? failedAttempts.filter((event) => event.args?.reason === 'tool_call_failed').length
    : null;
  const llmAttempts = hasAttemptMetadata
    ? modelTurns.reduce((total, event) => total + (numeric(event.args?.llm_attempts) ?? 1), 0) +
      failedCalls.reduce((total, event) => total + (numeric(event.args?.llm_attempts) ?? 0), 0)
    : null;
  const activeLatencyMs = latencyMs !== null && rateLimitWaitMs !== null
    ? Math.max(0, latencyMs - rateLimitWaitMs - (pacingWaitMs ?? 0))
    : null;
  const stepCount = events.length === 0 ? null : modelTurns.length;
  const retrieval = events.find((event) => event.type === 'retrieval');
  const retrievalMs = numeric(retrieval?.elapsed_ms);
  const pineconeQueryMs = numeric(retrieval?.args?.pinecone_query_ms) ?? numeric(retrieval?.db_time_ms);
  const embeddingMs = numeric(retrieval?.args?.embedding_ms) ?? (
    retrievalMs !== null && pineconeQueryMs !== null ? Math.max(0, retrievalMs - pineconeQueryMs) : null
  );
  const neonFetchMs = numeric(retrieval?.args?.neon_fetch_ms) ?? (
    retrieval ? 0 : null
  );
  const answerGenerationMs = retrieval
    ? sum(events.filter((event) => event.type === 'model_turn').map((event) => numeric(event.elapsed_ms) ?? 0))
    : null;
  const knownComponents = [embeddingMs, pineconeQueryMs, neonFetchMs, answerGenerationMs];
  const otherLatencyMs = latencyMs !== null && knownComponents.every((value) => value !== null)
    ? Math.max(0, latencyMs - knownComponents.reduce((total, value) => total + (value ?? 0), 0))
    : null;

  return {
    latency_ms: latencyMs,
    active_latency_ms: activeLatencyMs,
    rate_limit_count: rateLimitCount,
    rate_limit_wait_ms: rateLimitWaitMs,
    pacing_wait_ms: pacingWaitMs,
    recovered_answer: events.filter((event) => event.type === 'final_answer_recovered').length,
    llm_attempts: llmAttempts,
    tool_call_failure_count: toolCallFailureCount,
    step_count: stepCount,
    embedding_ms: embeddingMs,
    pinecone_query_ms: pineconeQueryMs,
    neon_fetch_ms: neonFetchMs,
    answer_generation_ms: answerGenerationMs,
    other_latency_ms: otherLatencyMs,
    failure_reason: failureReason,
    last_error_class: lastErrorClass
  };
}
