import {
  ChatMessage,
  EmbeddingClient,
  formatRagUserPrompt,
  getRepairPrompt,
  getSystemPrompt,
  GroundTruthLocation,
  LLMClient,
  LLMRequestError,
  parseFinalAnswer,
  TraceLogger
} from '@greptrace/core';
import { CodeChunk } from './chunking/types.js';
import { retrieveChunks } from './retrieval/retriever.js';

export interface RagRunOptions {
  question: string;
  corpus: string;
  questionId?: string;
  model?: string;
  topK?: number;
  pineconeApiKey: string;
  pineconeIndexName: string;
  pineconeNamespace: string;
  embeddingClient: EmbeddingClient;
  llmClient: LLMClient;
  logger: TraceLogger;
  batchId?: string | null;
  repetition?: number | null;
}

export interface RagRunResult {
  runId: string;
  answer: string;
  citations: GroundTruthLocation[];
  retrievedChunks: CodeChunk[];
  dbTimeMs: number;
  totalRetrievalMs: number;
  stepCount: number;
  totalTokens: number;
  totalCostUsd: number;
  status: 'completed' | 'failed';
}

export async function runRagPipeline(options: RagRunOptions): Promise<RagRunResult> {
  const activeModel = options.model ?? options.llmClient.getDefaultModel();
  const logger = options.logger;
  const topK = options.topK ?? 8;

  const runId = await logger.startRun({
    system: 'rag',
    corpus: options.corpus,
    question_id: options.questionId ?? 'ad-hoc',
    model: activeModel,
    batch_id: options.batchId ?? null,
    repetition: options.repetition ?? null
  });

  let step = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;

  try {
    const retrieval = await retrieveChunks(
      options.pineconeApiKey,
      options.pineconeIndexName,
      options.pineconeNamespace,
      options.embeddingClient,
      options.question,
      topK
    );

    const filesTouched = Array.from(new Set(retrieval.chunks.map((c) => c.file)));
    const resultBytes = Buffer.byteLength(
      JSON.stringify(retrieval.chunks.map((c) => c.content)),
      'utf8'
    );

    await logger.logEvent({
      step,
      type: 'retrieval',
      args: {
        question: options.question,
        top_k: topK,
        embedding_ms: retrieval.embeddingTimeMs,
        pinecone_query_ms: retrieval.pineconeQueryTimeMs,
        neon_fetch_ms: retrieval.neonFetchTimeMs
      },
      result_summary: `Retrieved ${retrieval.chunks.length} chunks from namespace '${options.pineconeNamespace}'`,
      result_bytes: resultBytes,
      files_touched: filesTouched,
      elapsed_ms: retrieval.totalRetrievalMs,
      db_time_ms: retrieval.dbTimeMs,
      tokens: retrieval.tokensUsed
    });

    totalTokens += retrieval.tokensUsed;

    const userPrompt = formatRagUserPrompt(options.question, retrieval.chunks);
    const messages: ChatMessage[] = [
      { role: 'system', content: getSystemPrompt(options.corpus) },
      { role: 'user', content: userPrompt }
    ];

    const modelStart = Date.now();
    const response = await options.llmClient.chat({
      model: activeModel,
      messages,
      temperature: 0
    });
    const modelElapsed = response.activeTimeMs ?? Date.now() - modelStart;

    await logger.logLLMAttemptFailures(response.failedAttempts ?? [], step);

    totalTokens += response.usage.totalTokens;
    totalCostUsd += response.costUsd;
    step++;

    await logger.logEvent({
      step,
      type: 'model_turn',
      args: {
        outcome: 'final_answer',
        llm_attempts: response.attempts ?? 1,
        rate_limit_count: response.rateLimitCount ?? 0,
        rate_limit_wait_ms: response.waitTimeMs ?? 0,
        tool_call_failure_count: response.toolCallFailureCount ?? 0
      },
      tokens: response.usage.totalTokens,
      elapsed_ms: modelElapsed
    });

    const parsed = parseFinalAnswer(response.text);
    if (parsed.ok) {
      const payload = {
        answer: parsed.data.answer,
        citations: parsed.data.citations,
        retrieved_chunks: retrieval.chunks.map((c) => ({
          file: c.file,
          start_line: c.start_line,
          end_line: c.end_line
        }))
      };

      await logger.finishRun({
        status: 'completed',
        final_answer: JSON.stringify(payload),
        total_tokens: totalTokens,
        cost_usd: totalCostUsd
      });

      return {
        runId,
        answer: parsed.data.answer,
        citations: parsed.data.citations,
        retrievedChunks: retrieval.chunks,
        dbTimeMs: retrieval.dbTimeMs,
        totalRetrievalMs: retrieval.totalRetrievalMs,
        stepCount: step,
        totalTokens,
        totalCostUsd,
        status: 'completed'
      };
    }

    messages.push({ role: 'assistant', content: response.text });
    messages.push({ role: 'user', content: getRepairPrompt() });

    const repairStart = Date.now();
    const repairRes = await options.llmClient.chat({
      model: activeModel,
      messages,
      temperature: 0
    });
    const repairElapsed = repairRes.activeTimeMs ?? Date.now() - repairStart;

    await logger.logLLMAttemptFailures(repairRes.failedAttempts ?? [], step);

    totalTokens += repairRes.usage.totalTokens;
    totalCostUsd += repairRes.costUsd;
    step++;

    await logger.logEvent({
      step,
      type: 'model_turn',
      args: {
        outcome: 'final_answer',
        llm_attempts: repairRes.attempts ?? 1,
        rate_limit_count: repairRes.rateLimitCount ?? 0,
        rate_limit_wait_ms: repairRes.waitTimeMs ?? 0,
        tool_call_failure_count: repairRes.toolCallFailureCount ?? 0
      },
      tokens: repairRes.usage.totalTokens,
      elapsed_ms: repairElapsed
    });

    const repairedParsed = parseFinalAnswer(repairRes.text);
    if (repairedParsed.ok) {
      const payload = {
        answer: repairedParsed.data.answer,
        citations: repairedParsed.data.citations,
        retrieved_chunks: retrieval.chunks.map((c) => ({
          file: c.file,
          start_line: c.start_line,
          end_line: c.end_line
        }))
      };

      await logger.finishRun({
        status: 'completed',
        final_answer: JSON.stringify(payload),
        total_tokens: totalTokens,
        cost_usd: totalCostUsd
      });

      return {
        runId,
        answer: repairedParsed.data.answer,
        citations: repairedParsed.data.citations,
        retrievedChunks: retrieval.chunks,
        dbTimeMs: retrieval.dbTimeMs,
        totalRetrievalMs: retrieval.totalRetrievalMs,
        stepCount: step,
        totalTokens,
        totalCostUsd,
        status: 'completed'
      };
    }

    await logger.logEvent({
      step,
      type: 'error',
      result_summary: `RAG answer JSON validation failed: ${repairedParsed.error}`
    });

    await logger.finishRun({
      status: 'failed',
      final_answer: response.text,
      total_tokens: totalTokens,
      cost_usd: totalCostUsd
    });

    return {
      runId,
      answer: response.text,
      citations: [],
      retrievedChunks: retrieval.chunks,
      dbTimeMs: retrieval.dbTimeMs,
      totalRetrievalMs: retrieval.totalRetrievalMs,
      stepCount: step,
      totalTokens,
      totalCostUsd,
      status: 'failed'
    };
  } catch (err) {
    if (err instanceof LLMRequestError) {
      await logger.logLLMAttemptFailures(err.failedAttempts, step);
      await logger.logEvent({
        step,
        type: 'llm_call_failed',
        args: {
          llm_attempts: err.attempts,
          rate_limit_count: err.rateLimitCount,
          rate_limit_wait_ms: err.waitTimeMs,
          tool_call_failure_count: err.toolCallFailureCount
          , last_error_class: err.lastErrorClass,
          failure_reason: err.failureReason,
          error_body: err.errorBody
        },
        result_summary: err.message,
        elapsed_ms: err.activeTimeMs
      });
    }
    const errMsg = (err as Error).message;
    await logger.logEvent({
      step,
      type: 'error',
      args: {
        last_error_class: err instanceof LLMRequestError ? err.lastErrorClass : 'other_error',
        failure_reason: err instanceof LLMRequestError ? err.failureReason : 'unclassified_error'
      },
      result_summary: errMsg.slice(0, 500)
    });

    await logger.finishRun({
      status: 'failed',
      final_answer: errMsg,
      total_tokens: totalTokens,
      cost_usd: totalCostUsd
    });

    return {
      runId,
      answer: errMsg,
      citations: [],
      retrievedChunks: [],
      dbTimeMs: 0,
      totalRetrievalMs: 0,
      stepCount: step,
      totalTokens,
      totalCostUsd,
      status: 'failed'
    };
  }
}
