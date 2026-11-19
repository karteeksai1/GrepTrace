import { AGENT_TOOLS, CorpusSandbox, executeToolCall } from '../tools/index.js';
import { parseFinalAnswer } from './parser.js';
import { getAgentSystemPrompt, getLimitReachedPrompt, getRepairPrompt } from './prompts.js';
export async function runAgentLoop(options) {
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
    const messages = [
        { role: 'system', content: getAgentSystemPrompt(options.corpus) },
        { role: 'user', content: options.question }
    ];
    const readRanges = [];
    let step = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;
    try {
        for (let iteration = 0; iteration < maxSteps; iteration++) {
            const turnStart = Date.now();
            const response = await options.llmClient.chat({
                model: activeModel,
                messages,
                tools: AGENT_TOOLS,
                temperature: 0
            });
            const turnElapsed = Date.now() - turnStart;
            totalTokens += response.usage.totalTokens;
            totalCostUsd += response.costUsd;
            step++;
            await logger.logEvent({
                step,
                type: 'model_turn',
                tokens: response.usage.totalTokens,
                elapsed_ms: turnElapsed
            });
            if (response.toolCalls && response.toolCalls.length > 0) {
                messages.push({
                    role: 'assistant',
                    content: response.text || null,
                    tool_calls: response.toolCalls
                });
                for (const tc of response.toolCalls) {
                    const toolStart = Date.now();
                    const toolResult = await executeToolCall(sandbox, tc.name, tc.arguments);
                    const toolElapsed = Date.now() - toolStart;
                    if (toolResult.readRange) {
                        readRanges.push(toolResult.readRange);
                    }
                    step++;
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
            }
            else {
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
                const repairElapsed = Date.now() - repairStart;
                totalTokens += repairRes.usage.totalTokens;
                totalCostUsd += repairRes.costUsd;
                step++;
                await logger.logEvent({
                    step,
                    type: 'model_turn',
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
                step++;
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
        const limitElapsed = Date.now() - limitStart;
        totalTokens += limitRes.usage.totalTokens;
        totalCostUsd += limitRes.costUsd;
        step++;
        await logger.logEvent({
            step,
            type: 'model_turn',
            tokens: limitRes.usage.totalTokens,
            elapsed_ms: limitElapsed
        });
        const finalParsed = parseFinalAnswer(limitRes.text);
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
        totalTokens += limitRepairRes.usage.totalTokens;
        totalCostUsd += limitRepairRes.costUsd;
        step++;
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
        step++;
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
    }
    catch (err) {
        step++;
        const errMsg = err.message;
        await logger.logEvent({
            step,
            type: 'error',
            result_summary: errMsg
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
//# sourceMappingURL=agent-loop.js.map