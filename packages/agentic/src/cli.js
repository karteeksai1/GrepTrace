import fs from 'node:fs/promises';
import path from 'node:path';
import { createLLMClient, createPool, getAppDatabaseUrl, TraceLogger, warmUpDatabase } from '@greptrace/core';
import { runAgentLoop } from './agent/index.js';
function parseArgs(args) {
    const result = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--corpus' && args[i + 1]) {
            result.corpus = args[++i];
        }
        else if (arg === '--question-id' && args[i + 1]) {
            result.questionId = args[++i];
        }
        else if (arg === '--question' && args[i + 1]) {
            result.questionText = args[++i];
        }
        else if (arg === '--model' && args[i + 1]) {
            result.model = args[++i];
        }
        else if (arg === '--max-steps' && args[i + 1]) {
            result.maxSteps = parseInt(args[++i], 10);
        }
    }
    return result;
}
async function loadQuestion(corpus, questionId, rootDir) {
    const qFilePath = path.join(rootDir, 'data', 'questions', `${corpus}.json`);
    const raw = await fs.readFile(qFilePath, 'utf8');
    const questions = JSON.parse(raw);
    const matched = questions.find((q) => q.id === questionId);
    if (!matched) {
        throw new Error(`Question ID '${questionId}' not found in ${qFilePath}`);
    }
    return matched;
}
export async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.corpus) {
        process.stderr.write('Error: --corpus <express|fastapi> is required.\n');
        process.exit(1);
    }
    if (!args.questionId && !args.questionText) {
        process.stderr.write('Error: either --question-id <id> or --question "text" is required.\n');
        process.exit(1);
    }
    const rootDir = process.cwd();
    const configPath = path.join(rootDir, 'config', 'corpora.json');
    const rawConfig = await fs.readFile(configPath, 'utf8');
    const corporaConfig = JSON.parse(rawConfig);
    const corpusSpec = corporaConfig.corpora[args.corpus];
    if (!corpusSpec) {
        process.stderr.write(`Error: corpus '${args.corpus}' not found in config/corpora.json.\n`);
        process.exit(1);
    }
    const corpusRoot = path.resolve(rootDir, corpusSpec.path);
    let questionText = args.questionText ?? '';
    let questionId = args.questionId;
    if (args.questionId) {
        const q = await loadQuestion(args.corpus, args.questionId, rootDir);
        questionText = q.question;
    }
    const pool = createPool(getAppDatabaseUrl(), 2);
    try {
        await warmUpDatabase(pool);
        const logger = new TraceLogger(pool);
        const llmClient = createLLMClient(undefined, args.model);
        process.stdout.write(`Starting GrepTrace agentic run for corpus: ${args.corpus}\n`);
        process.stdout.write(`Model: ${args.model ?? llmClient.getDefaultModel()}\n`);
        process.stdout.write(`Question: ${questionText}\n\n`);
        const result = await runAgentLoop({
            question: questionText,
            corpus: args.corpus,
            corpusRoot,
            questionId,
            model: args.model,
            maxSteps: args.maxSteps ?? 15,
            llmClient,
            logger
        });
        process.stdout.write(`\n=== Run Result ===\n`);
        process.stdout.write(`Run ID: ${result.runId}\n`);
        process.stdout.write(`Status: ${result.status}\n`);
        process.stdout.write(`Step count: ${result.stepCount}\n`);
        process.stdout.write(`Total tokens: ${result.totalTokens}\n`);
        process.stdout.write(`Total cost: $${result.totalCostUsd}\n`);
        process.stdout.write(`\nAnswer:\n${result.answer}\n\n`);
        process.stdout.write(`Citations:\n`);
        if (result.citations.length === 0) {
            process.stdout.write(`  (none)\n`);
        }
        else {
            for (const c of result.citations) {
                process.stdout.write(`  - ${c.file}:${c.start_line}-${c.end_line}\n`);
            }
        }
        process.stdout.write(`\nFiles and lines read by agent:\n`);
        if (result.readRanges.length === 0) {
            process.stdout.write(`  (none)\n`);
        }
        else {
            for (const r of result.readRanges) {
                process.stdout.write(`  - ${r.file}:${r.start_line}-${r.end_line}\n`);
            }
        }
    }
    finally {
        await pool.end();
    }
}
if (process.argv[1]?.endsWith('cli.ts') || process.argv[1]?.endsWith('cli.js')) {
    main().catch((err) => {
        process.stderr.write(`Agentic run failed: ${err.message}\n`);
        process.exit(1);
    });
}
//# sourceMappingURL=cli.js.map