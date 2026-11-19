import { formatRagUserPrompt, getRepairPrompt, getSystemPrompt, parseFinalAnswer } from '@greptrace/core';
import { retrieveChunks } from './retrieval/retriever.js';
export async function runRagPipeline(options) {
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
        const retrieval = await retrieveChunks(options.pineconeApiKey, options.pineconeIndexName, options.pineconeNamespace, options.embeddingClient, options.question, topK);
        step++;
        const filesTouched = Array.from(new Set(retrieval.chunks.map((c) => c.file)));
        const resultBytes = Buffer.byteLength(JSON.stringify(retrieval.chunks.map((c) => c.content)), 'utf8');
        await logger.logEvent({
            step,
            type: 'retrieval',
            args: { question: options.question, top_k: topK },
            result_summary: `Retrieved ${retrieval.chunks.length} chunks from namespace '${options.pineconeNamespace}'`,
            result_bytes: resultBytes,
            files_touched: filesTouched,
            elapsed_ms: retrieval.totalRetrievalMs,
            db_time_ms: retrieval.dbTimeMs,
            tokens: retrieval.tokensUsed
        });
        totalTokens += retrieval.tokensUsed;
        const userPrompt = formatRagUserPrompt(options.question, retrieval.chunks);
        const messages = [
            { role: 'system', content: getSystemPrompt(options.corpus) },
            { role: 'user', content: userPrompt }
        ];
        const modelStart = Date.now();
        const response = await options.llmClient.chat({
            model: activeModel,
            messages,
            temperature: 0
        });
        const modelElapsed = Date.now() - modelStart;
        totalTokens += response.usage.totalTokens;
        totalCostUsd += response.costUsd;
        step++;
        await logger.logEvent({
            step,
            type: 'model_turn',
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
        step++;
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
//# sourceMappingURL=pipeline.js.map