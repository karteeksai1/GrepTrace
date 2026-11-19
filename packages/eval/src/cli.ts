import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createLLMClient,
  createPool,
  getAppDatabaseUrl,
  QuestionType,
  SystemType,
  validateEnv
} from '@greptrace/core';
import {
  BenchOptions,
  runBenchmark
} from './runner/batch-runner.js';
import {
  scoreBatch
} from './scoring/scorer.js';
import {
  aggregateRows,
  buildHeadToHead,
  computeJudgeAgreement,
  exportRunsCsv,
  fetchBatchRunRows,
  formatAggregateMarkdownTable,
  formatAsciiTable,
  formatHeadToHeadMarkdown,
  generateAsciiSummary,
  generateFailuresMarkdown,
  sampleRunsForJudging
} from './report/reporter.js';

interface CliArgs {
  command: string;
  options: Record<string, string | boolean>;
}

function parseCliArgs(args: string[]): CliArgs {
  const command = args[0] || 'help';
  const options: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    }
  }

  return { command, options };
}

async function handleBench(options: Record<string, string | boolean>, rootDir: string): Promise<void> {
  const env = validateEnv();
  const pool = createPool(getAppDatabaseUrl());

  const systemsRaw = (options['systems'] as string) || 'agentic,rag';
  const systems = systemsRaw.split(',').map((s) => s.trim()) as SystemType[];

  const corporaRaw = (options['corpus'] as string) || (options['corpora'] as string) || 'express';
  const corpora = corporaRaw.split(',').map((c) => c.trim());

  const model = (options['model'] as string) || env.LLM_MODEL;
  const limit = options['limit'] ? parseInt(options['limit'] as string, 10) : undefined;

  const typesRaw = options['types'] as string | undefined;
  const types = typesRaw ? (typesRaw.split(',').map((t) => t.trim()) as QuestionType[]) : undefined;

  const repetitions = options['repetitions'] ? parseInt(options['repetitions'] as string, 10) : 1;
  const batchName = options['batch-name'] as string | undefined;
  const topK = options['top-k'] ? parseInt(options['top-k'] as string, 10) : undefined;
  const maxSteps = options['max-steps'] ? parseInt(options['max-steps'] as string, 10) : undefined;
  const dryRun = Boolean(options['dry-run']);

  const benchOpts: BenchOptions = {
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

async function handleScore(options: Record<string, string | boolean>, rootDir: string): Promise<void> {
  const batchName = options['batch'] as string;
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

async function handleJudgeSample(options: Record<string, string | boolean>, rootDir: string): Promise<void> {
  const batchName = options['batch'] as string;
  if (!batchName) {
    throw new Error('Missing required option: --batch <name>');
  }

  const n = options['n'] ? parseInt(options['n'] as string, 10) : 20;
  const pool = createPool(getAppDatabaseUrl());

  const csv = await sampleRunsForJudging(pool, batchName, n, rootDir);
  const outPath = options['output'] as string | undefined;

  if (outPath) {
    await fs.writeFile(path.resolve(rootDir, outPath), csv, 'utf8');
    process.stdout.write(`Wrote ${n} sampled runs to ${outPath}\n`);
  } else {
    process.stdout.write(csv + '\n');
  }
}

async function handleJudgeAgreement(options: Record<string, string | boolean>, rootDir: string): Promise<void> {
  const filePath = options['file'] as string;
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

async function handleReport(options: Record<string, string | boolean>, rootDir: string): Promise<void> {
  const batchName = options['batch'] as string;
  if (!batchName) {
    throw new Error('Missing required option: --batch <name>');
  }

  const pool = createPool(getAppDatabaseUrl());
  let rows = await fetchBatchRunRows(pool, batchName, rootDir);

  const corpusFilter = options['corpus'] as string | undefined;
  if (corpusFilter) {
    rows = rows.filter((r) => r.corpus === corpusFilter);
  }

  const typeFilter = options['type'] as string | undefined;
  if (typeFilter) {
    rows = rows.filter((r) => r.question_type === typeFilter);
  }

  const format = (options['format'] as string) || 'table';
  const outPath = options['output'] as string | undefined;

  const summaries = aggregateRows(rows);
  const h2h = buildHeadToHead(rows);

  const docsDir = path.join(rootDir, 'docs', 'benchmarks');
  await fs.mkdir(docsDir, { recursive: true });
  const failuresMd = await generateFailuresMarkdown(rows, rootDir);
  await fs.writeFile(path.join(docsDir, `${batchName}_failures.md`), failuresMd, 'utf8');

  let outputContent = '';

  if (format === 'table') {
    outputContent = generateAsciiSummary(summaries, h2h);
  } else if (format === 'csv') {
    outputContent = exportRunsCsv(rows);
  } else if (format === 'json') {
    outputContent = JSON.stringify({ summaries, head_to_head: h2h, runs: rows }, null, 2);
  } else if (format === 'md') {
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
  } else {
    process.stdout.write(outputContent + '\n');
  }
}

async function main(): Promise<void> {
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
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

main();
