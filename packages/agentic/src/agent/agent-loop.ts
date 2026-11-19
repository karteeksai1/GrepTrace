import { ChatMessage, GroundTruthLocation, LLMClient, LLMRequestError, TraceLogger } from '@greptrace/core';
import { AGENT_TOOLS, CorpusSandbox, executeToolCall } from '../tools/index.js';
import { parseFinalAnswer } from './parser.js';
import { getAgentSystemPrompt, getLimitReachedPrompt, getRepairPrompt } from './prompts.js';

export interface AgentRunOptions {
  question: string;
  corpus: string;
  corpusRoot: string;
  questionId?: string;
  model?: string;
  maxSteps?: number;
  llmClient: LLMClient;
  logger: TraceLogger;
  maxOutputBytes?: number;
  batchId?: string | null;
  repetition?: number | null;
}

export interface AgentRunResult {
  runId: string;
  answer: string;
  citations: GroundTruthLocation[];
  readRanges: GroundTruthLocation[];
  stepCount: number;
  totalTokens: number;
  totalCostUsd: number;
  status: 'completed' | 'pending' | 'failed';
}

export async function runAgentLoop(options: AgentRunOptions): Promise<AgentRunResult> {
  const maxSteps = options.maxSteps ?? 15;
  const activeModel = options.model ?? options.llmClient.getDefaultModel();
  const sandbox = new CorpusSandbox(options.corpusRoot, options.maxOutputBytes ?? 12000);
  const logger = options.logger;

  const runId = await logger.startRun({
    system: 'agentic',
    corpus: options.corpus,
    question_id: options.questionId ?? 'ad-hoc',
    model: activeModel,
    batch_id: options.batchId ?? null,
    repetition: options.repetition ?? null
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: getAgentSystemPrompt(options.corpus) },
    { role: 'user', content: options.question }
  ];

  const readRanges: GroundTruthLocation[] = [];
  let step = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let repairOnly = false;

  try {
    for (let iteration = 0; iteration < maxSteps; iteration++) {
      const turnStart = Date.now();
      const response = await options.llmClient.chat({
        model: activeModel,
        messages,
        tools: repairOnly ? undefined : AGENT_TOOLS,
        temperature: 0
      });
      const turnElapsed = response.activeTimeMs ?? Date.now() - turnStart;

      await logger.logLLMAttemptFailures(response.failedAttempts ?? [], step);

      totalTokens += response.usage.totalTokens;
      totalCostUsd += response.costUsd;
      step++;

      await logger.logEvent({
        step,
        type: 'model_turn',
        args: {
          outcome: response.toolCalls && response.toolCalls.length > 0 ? 'tool_call' : 'final_answer',
          llm_attempts: response.attempts ?? 1,
          rate_limit_count: response.rateLimitCount ?? 0,
          rate_limit_wait_ms: response.waitTimeMs ?? 0,
          tool_call_failure_count: response.toolCallFailureCount ?? 0,
          pacing_wait_ms: response.pacingWaitMs ?? 0
        },
        tokens: response.usage.totalTokens,
        elapsed_ms: turnElapsed
      });

      if (response.recoveredAnswer) {
        const recovered = parseFinalAnswer(JSON.stringify(response.recoveredAnswer));
        if (recovered.ok) {
          await logger.logEvent({
            step,
            type: 'final_answer_recovered',
            args: { recovered_answer: true }
          });
          const payload = { answer: recovered.data.answer, citations: recovered.data.citations, read_ranges: readRanges };
          await logger.finishRun({ status: 'completed', final_answer: JSON.stringify(payload), total_tokens: totalTokens, cost_usd: totalCostUsd });
          return { runId, answer: recovered.data.answer, citations: recovered.data.citations, readRanges, stepCount: step, totalTokens, totalCostUsd, status: 'completed' };
        }
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: response.text || null,
          tool_calls: response.toolCalls
        });

        for (const tc of response.toolCalls) {
          if (tc.name === 'submit_answer') {
            const parsed = parseFinalAnswer(JSON.stringify(tc.arguments));
            await logger.logEvent({
              step,
              type: 'tool_call',
              tool: tc.name,
              args: tc.arguments,
              result_summary: parsed.ok ? 'Final answer accepted' : `Final answer rejected: ${parsed.error}`
            });
            if (parsed.ok) {
              const payload = { answer: parsed.data.answer, citations: parsed.data.citations, read_ranges: readRanges };
              await logger.finishRun({ status: 'completed', final_answer: JSON.stringify(payload), total_tokens: totalTokens, cost_usd: totalCostUsd });
              return { runId, answer: parsed.data.answer, citations: parsed.data.citations, readRanges, stepCount: step, totalTokens, totalCostUsd, status: 'completed' };
            }
            messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.name, content: `Invalid submit_answer: ${parsed.error}` });
            messages.push({ role: 'user', content: getRepairPrompt() });
            repairOnly = true;
            continue;
          }
          const toolStart = Date.now();
          const toolResult = await executeToolCall(sandbox, tc.name, tc.arguments);
          const toolElapsed = Date.now() - toolStart;

          if (toolResult.readRange) {
            readRanges.push(toolResult.readRange);
          }

          await logger.logEvent({
            step,
            type: 'tool_call',
            tool: tc.name,
            args: tc.arguments,
            result_summary: toolResult.output.slice(0, 200),
            result_bytes: toolResult.bytes,
            files_touched: toolResult.filesTouched,
            elapsed_ms: toolElapsed
          });

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.name,
            content: toolResult.output
          });
        }
      } else {
        const parsed = parseFinalAnswer(response.text);
        if (parsed.ok) {
          const payload = {
            answer: parsed.data.answer,
            citations: parsed.data.citations,
            read_ranges: readRanges
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
            readRanges,
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
          tool_call_failure_count: repairRes.toolCallFailureCount ?? 0,
          pacing_wait_ms: repairRes.pacingWaitMs ?? 0
          },
          tokens: repairRes.usage.totalTokens,
          elapsed_ms: repairElapsed
        });

        const repairedParsed = parseFinalAnswer(repairRes.text);
        if (repairedParsed.ok) {
          const payload = {
            answer: repairedParsed.data.answer,
            citations: repairedParsed.data.citations,
            read_ranges: readRanges
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
            readRanges,
            stepCount: step,
            totalTokens,
            totalCostUsd,
            status: 'completed'
          };
        }

        await logger.logEvent({
          step,
          type: 'error',
          result_summary: `Final answer JSON validation failed: ${repairedParsed.error}`
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
          readRanges,
          stepCount: step,
          totalTokens,
          totalCostUsd,
          status: 'failed'
        };
      }
    }

    messages.push({ role: 'user', content: getLimitReachedPrompt() });
    const limitStart = Date.now();
    const limitRes = await options.llmClient.chat({
      model: activeModel,
      messages,
      temperature: 0
    });
    const limitElapsed = limitRes.activeTimeMs ?? Date.now() - limitStart;
    const finalParsed = parseFinalAnswer(limitRes.text);

    await logger.logLLMAttemptFailures(limitRes.failedAttempts ?? [], step);

    totalTokens += limitRes.usage.totalTokens;
    totalCostUsd += limitRes.costUsd;
    step++;

    await logger.logEvent({
      step,
      type: 'model_turn',
      args: {
        outcome: finalParsed.ok ? 'final_answer' : 'repair',
        llm_attempts: limitRes.attempts ?? 1,
        rate_limit_count: limitRes.rateLimitCount ?? 0,
        rate_limit_wait_ms: limitRes.waitTimeMs ?? 0,
        tool_call_failure_count: limitRes.toolCallFailureCount ?? 0,
        pacing_wait_ms: limitRes.pacingWaitMs ?? 0
      },
      tokens: limitRes.usage.totalTokens,
      elapsed_ms: limitElapsed
    });

    if (finalParsed.ok) {
      const payload = {
        answer: finalParsed.data.answer,
        citations: finalParsed.data.citations,
        read_ranges: readRanges
      };
      await logger.finishRun({
        status: 'completed',
        final_answer: JSON.stringify(payload),
        total_tokens: totalTokens,
        cost_usd: totalCostUsd
      });
      return {
        runId,
        answer: finalParsed.data.answer,
        citations: finalParsed.data.citations,
        readRanges,
        stepCount: step,
        totalTokens,
        totalCostUsd,
        status: 'completed'
      };
    }

    messages.push({ role: 'assistant', content: limitRes.text });
    messages.push({ role: 'user', content: getRepairPrompt() });

    const limitRepairRes = await options.llmClient.chat({
      model: activeModel,
      messages,
      temperature: 0
    });
    await logger.logLLMAttemptFailures(limitRepairRes.failedAttempts ?? [], step);
    totalTokens += limitRepairRes.usage.totalTokens;
    totalCostUsd += limitRepairRes.costUsd;
    step++;
    await logger.logEvent({
      step,
      type: 'model_turn',
      args: {
        outcome: 'final_answer',
        llm_attempts: limitRepairRes.attempts ?? 1,
        rate_limit_count: limitRepairRes.rateLimitCount ?? 0,
        rate_limit_wait_ms: limitRepairRes.waitTimeMs ?? 0,
        tool_call_failure_count: limitRepairRes.toolCallFailureCount ?? 0,
        pacing_wait_ms: limitRepairRes.pacingWaitMs ?? 0
      },
      tokens: limitRepairRes.usage.totalTokens,
      elapsed_ms: limitRepairRes.activeTimeMs ?? 0
    });

    const limitRepairedParsed = parseFinalAnswer(limitRepairRes.text);
    if (limitRepairedParsed.ok) {
      const payload = {
        answer: limitRepairedParsed.data.answer,
        citations: limitRepairedParsed.data.citations,
        read_ranges: readRanges
      };
      await logger.finishRun({
        status: 'completed',
        final_answer: JSON.stringify(payload),
        total_tokens: totalTokens,
        cost_usd: totalCostUsd
      });
      return {
        runId,
        answer: limitRepairedParsed.data.answer,
        citations: limitRepairedParsed.data.citations,
        readRanges,
        stepCount: step,
        totalTokens,
        totalCostUsd,
        status: 'completed'
      };
    }

    await logger.logEvent({
      step,
      type: 'error',
      result_summary: `Step limit reached and answer parsing failed: ${limitRepairedParsed.error}`
    });

    await logger.finishRun({
      status: 'failed',
      final_answer: limitRes.text,
      total_tokens: totalTokens,
      cost_usd: totalCostUsd
    });

    return {
      runId,
      answer: limitRes.text,
      citations: [],
      readRanges,
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
      if (err.lastErrorClass === 'daily_quota_exhausted') {
        await logger.finishRun({ status: 'pending', total_tokens: totalTokens, cost_usd: totalCostUsd });
        return { runId, answer: err.message, citations: [], readRanges, stepCount: step, totalTokens, totalCostUsd, status: 'pending' };
      }
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
      readRanges,
      stepCount: step,
      totalTokens,
      totalCostUsd,
      status: 'failed'
    };
  }
}
