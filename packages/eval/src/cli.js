import fs from 'node:fs/promises';
import path from 'node:path';
import { createLLMClient, createPool, getAppDatabaseUrl, validateEnv } from '@greptrace/core';
import { runBenchmark } from './runner/batch-runner.js';
import { scoreBatch } from './scoring/scorer.js';
import { aggregateRows, buildHeadToHead, computeJudgeAgreement, exportRunsCsv, fetchBatchRunRows, formatAggregateMarkdownTable, formatAsciiTable, formatHeadToHeadMarkdown, generateAsciiSummary, generateFailuresMarkdown, sampleRunsForJudging } from './report/reporter.js';
function parseCliArgs(args) {
    const command = args[0] || 'help';
    const options = {};
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const next = args[i + 1];
            if (next && !next.startsWith('--')) {
                options[key] = next;
                i++;
            }
            else {
                options[key] = true;
            }
        }
    }
    return { command, options };
}
async function handleBench(options, rootDir) {
    const env = validateEnv();
    const pool = createPool(getAppDatabaseUrl());
    const systemsRaw = options['systems'] || 'agentic,rag';
    const systems = systemsRaw.split(',').map((s) => s.trim());
    const corporaRaw = options['corpus'] || options['corpora'] || 'express';
    const corpora = corporaRaw.split(',').map((c) => c.trim());
    const model = options['model'] || env.LLM_MODEL;
    const limit = options['limit'] ? parseInt(options['limit'], 10) : undefined;
    const typesRaw = options['types'];
    const types = typesRaw ? typesRaw.split(',').map((t) => t.trim()) : undefined;
    const repetitions = options['repetitions'] ? parseInt(options['repetitions'], 10) : 1;
    const batchName = options['batch-name'];
    const topK = options['top-k'] ? parseInt(options['top-k'], 10) : undefined;
    const maxSteps = options['max-steps'] ? parseInt(options['max-steps'], 10) : undefined;
    const dryRun = Boolean(options['dry-run']);
    const benchOpts = {
        systems,
        corpora,
        model,
        limit,
        types,
        repetitions,
        batchName,
        topK,
        maxSteps,
        dryRun
    };
    await runBenchmark(benchOpts, pool, env, rootDir);
}
async function handleScore(options, rootDir) {
    const batchName = options['batch'];
    if (!batchName) {
        throw new Error('Missing required option: --batch <name>');
    }
    const env = validateEnv();
    const pool = createPool(getAppDatabaseUrl());
    const rejudge = Boolean(options['rejudge']);
    const judgeClient = createLLMClient(undefined, env.JUDGE_MODEL);
    process.stdout.write(`Scoring batch '${batchName}' (rejudge: ${rejudge})...\n`);
    const res = await scoreBatch(pool, batchName, rejudge, judgeClient, env.JUDGE_MODEL, rootDir);
    process.stdout.write(`Finished scoring: ${res.scored} runs scored.\n`);
}
async function handleJudgeSample(options, rootDir) {
    const batchName = options['batch'];
    if (!batchName) {
        throw new Error('Missing required option: --batch <name>');
    }
    const n = options['n'] ? parseInt(options['n'], 10) : 20;
    const pool = createPool(getAppDatabaseUrl());
    const csv = await sampleRunsForJudging(pool, batchName, n, rootDir);
    const outPath = options['output'];
    if (outPath) {
        await fs.writeFile(path.resolve(rootDir, outPath), csv, 'utf8');
        process.stdout.write(`Wrote ${n} sampled runs to ${outPath}\n`);
    }
    else {
        process.stdout.write(csv + '\n');
    }
}
async function handleJudgeAgreement(options, rootDir) {
    const filePath = options['file'];
    if (!filePath) {
        throw new Error('Missing required option: --file <path>');
    }
    const raw = await fs.readFile(path.resolve(rootDir, filePath), 'utf8');
    const report = computeJudgeAgreement(raw);
    process.stdout.write(`=== Judge Agreement Report ===\n`);
    process.stdout.write(`Total evaluated: ${report.total}\n`);
    process.stdout.write(`Agreed: ${report.agreed}\n`);
    process.stdout.write(`Agreement Rate: ${(report.agreementRate * 100).toFixed(2)}%\n\n`);
    process.stdout.write(`Confusion Matrix (Rows: Judge, Cols: Human):\n`);
    const headers = ['Judge\\Human', 'correct', 'partial', 'incorrect'];
    const rows = ['correct', 'partial', 'incorrect'].map((j) => [
        j,
        String(report.confusionMatrix[j].correct),
        String(report.confusionMatrix[j].partial),
        String(report.confusionMatrix[j].incorrect)
    ]);
    process.stdout.write(formatAsciiTable(headers, rows) + '\n');
}
async function handleReport(options, rootDir) {
    const batchName = options['batch'];
    if (!batchName) {
        throw new Error('Missing required option: --batch <name>');
    }
    const pool = createPool(getAppDatabaseUrl());
    let rows = await fetchBatchRunRows(pool, batchName, rootDir);
    const corpusFilter = options['corpus'];
    if (corpusFilter) {
        rows = rows.filter((r) => r.corpus === corpusFilter);
    }
    const typeFilter = options['type'];
    if (typeFilter) {
        rows = rows.filter((r) => r.question_type === typeFilter);
    }
    const format = options['format'] || 'table';
    const outPath = options['output'];
    const summaries = aggregateRows(rows);
    const h2h = buildHeadToHead(rows);
    const docsDir = path.join(rootDir, 'docs', 'benchmarks');
    await fs.mkdir(docsDir, { recursive: true });
    const failuresMd = await generateFailuresMarkdown(rows, rootDir);
    await fs.writeFile(path.join(docsDir, `${batchName}_failures.md`), failuresMd, 'utf8');
    let outputContent = '';
    if (format === 'table') {
        outputContent = generateAsciiSummary(summaries, h2h);
    }
    else if (format === 'csv') {
        outputContent = exportRunsCsv(rows);
    }
    else if (format === 'json') {
        outputContent = JSON.stringify({ summaries, head_to_head: h2h, runs: rows }, null, 2);
    }
    else if (format === 'md') {
        outputContent = [
            `# GrepTrace Benchmark Report: ${batchName}`,
            '',
            '## Aggregate Performance',
            formatAggregateMarkdownTable(summaries),
            '',
            '## Head-to-Head Comparison',
            formatHeadToHeadMarkdown(h2h)
        ].join('\n');
    }
    if (outPath) {
        await fs.writeFile(path.resolve(rootDir, outPath), outputContent, 'utf8');
        process.stdout.write(`Wrote report to ${outPath}\n`);
    }
    else {
        process.stdout.write(outputContent + '\n');
    }
}
async function main() {
    const args = process.argv.slice(2);
    const { command, options } = parseCliArgs(args);
    const rootDir = process.cwd();
    try {
        switch (command) {
            case 'bench':
                await handleBench(options, rootDir);
                break;
            case 'score':
                await handleScore(options, rootDir);
                break;
            case 'judge-sample':
                await handleJudgeSample(options, rootDir);
                break;
            case 'judge-agreement':
                await handleJudgeAgreement(options, rootDir);
                break;
            case 'report':
                await handleReport(options, rootDir);
                break;
            default:
                process.stdout.write(`Unknown command: ${command}\nAvailable commands: bench, score, judge-sample, judge-agreement, report\n`);
                process.exit(1);
        }
    }
    catch (err) {
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=cli.js.map