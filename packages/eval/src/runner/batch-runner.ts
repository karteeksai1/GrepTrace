import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import {
  BatchConfig,
  checkDatabaseHealth,
  CorporaConfig,
  createEmbeddingClient,
  createLLMClient,
  EnvConfig,
  Question,
  QuestionType,
  Run,
  ScoreRecord,
  SystemType,
  TraceLogger,
  validateQuestionAgainstCorpus,
  warmUpDatabase
} from '@greptrace/core';
import { runAgentLoop } from '@greptrace/agentic';
import { runRagPipeline } from '@greptrace/rag';
import { scoreRun } from '../scoring/scorer.js';

export interface BenchOptions {
  systems: SystemType[];
  corpora: string[];
  model: string;
  limit?: number;
  types?: QuestionType[];
  repetitions: number;
  batchName?: string;
  topK?: number;
  maxSteps?: number;
  dryRun?: boolean;
}

export interface RunMatrixItem {
  system: SystemType;
  corpus: string;
  question: Question;
  repetition: number;
  model: string;
}

export interface ProgressState {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  runningCost: number;
  startTime: number;
}

export function getGitCommit(dir?: string): string {
  try {
    const cmd = dir ? `git -C ${dir} rev-parse HEAD` : 'git rev-parse HEAD';
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown-commit';
  }
}

export async function loadCorporaConfig(rootDir: string): Promise<CorporaConfig> {
  const configPath = path.join(rootDir, 'config', 'corpora.json');
  const raw = await fs.readFile(configPath, 'utf8');
  return JSON.parse(raw);
}

export async function loadQuestions(
  corpus: string,
  rootDir: string,
  types?: QuestionType[],
  limit?: number
): Promise<Question[]> {
  const qFilePath = path.join(rootDir, 'data', 'questions', `${corpus}.json`);
  const raw = await fs.readFile(qFilePath, 'utf8');
  let questions: Question[] = JSON.parse(raw);

  if (types && types.length > 0) {
    const typeSet = new Set(types);
    questions = questions.filter((q) => typeSet.has(q.type));
  }

  if (limit && limit > 0) {
    questions = questions.slice(0, limit);
  }

  return questions;
}

export function buildRunMatrix(
  questionsByCorpus: Record<string, Question[]>,
  systems: SystemType[],
  model: string,
  repetitions: number
): RunMatrixItem[] {
  const items: RunMatrixItem[] = [];

  for (let rep = 1; rep <= repetitions; rep++) {
    for (const [corpus, questions] of Object.entries(questionsByCorpus)) {
      for (const question of questions) {
        for (const system of systems) {
          items.push({
            system,
            corpus,
            question,
            repetition: rep,
            model
          });
        }
      }
    }
  }

  return items;
}

export async function ensureBatchRecord(
  pool: pg.Pool,
  batchName: string,
  config: BatchConfig
): Promise<string> {
  const existing = await pool.query('SELECT id FROM batches WHERE name = $1', [batchName]);
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const id = crypto.randomUUID();
  const query = `
    INSERT INTO batches (id, name, created_at, config)
    VALUES ($1, $2, NOW(), $3)
    RETURNING id;
  `;
  await pool.query(query, [id, batchName, JSON.stringify(config)]);
  return id;
}

export async function getCompletedRunKeys(pool: pg.Pool, batchId: string): Promise<Set<string>> {
  const query = `
    SELECT r.system, r.corpus, r.question_id, r.model, r.repetition
    FROM runs r
    INNER JOIN scores s ON r.id = s.run_id
    WHERE r.batch_id = $1 AND r.status = 'completed';
  `;
  const result = await pool.query(query, [batchId]);
  const set = new Set<string>();
  for (const row of result.rows) {
    set.add(`${row.system}_${row.corpus}_${row.question_id}_${row.model}_${row.repetition}`);
  }
  return set;
}

export class Pacer {
  private lastRequestTime = 0;
  private intervalMs: number;

  constructor(intervalMs: number) {
    this.intervalMs = intervalMs;
  }

  async waitForSlot(): Promise<void> {
    if (this.intervalMs <= 0) {
      return;
    }
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.intervalMs) {
      const wait = this.intervalMs - elapsed;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.lastRequestTime = Date.now();
  }
}

export async function executeSingleBenchmarkItem(
  item: RunMatrixItem,
  batchId: string,
  pool: pg.Pool,
  env: EnvConfig,
  corporaConfig: CorporaConfig,
  rootDir: string,
  topK: number,
  maxSteps: number,
  pacer: Pacer
): Promise<{ run: Run; score: ScoreRecord }> {
  const logger = new TraceLogger(pool);
  const corpusSpec = corporaConfig.corpora[item.corpus];
  const corpusRoot = path.resolve(rootDir, corpusSpec.path);

  const llmClient = createLLMClient(undefined, item.model, pacer);
  const judgeClient = createLLMClient(undefined, env.JUDGE_MODEL, pacer);

  let finalAnswer: string | null = null;
  let status: 'completed' | 'failed' = 'failed';
  let totalTokens = 0;
  let costUsd = 0;

  if (item.system === 'agentic') {
    const res = await runAgentLoop({
      question: item.question.question,
      corpus: item.corpus,
      corpusRoot,
      questionId: item.question.id,
      model: item.model,
      maxSteps,
      llmClient,
      logger,
      batchId,
      repetition: item.repetition
    });
    status = res.status;
    finalAnswer = JSON.stringify({
      answer: res.answer,
      citations: res.citations,
      read_ranges: res.readRanges
    });
    totalTokens = res.totalTokens;
    costUsd = res.totalCostUsd;
  } else {
    const embeddingClient = createEmbeddingClient();
    const namespace =
      item.corpus === 'express'
        ? env.PINECONE_NAMESPACE_EXPRESS
        : env.PINECONE_NAMESPACE_FASTAPI;

    const res = await runRagPipeline({
      question: item.question.question,
      corpus: item.corpus,
      questionId: item.question.id,
      model: item.model,
      topK,
      pineconeApiKey: env.PINECONE_API_KEY,
      pineconeIndexName: env.PINECONE_INDEX_NAME,
      pineconeNamespace: namespace,
      embeddingClient,
      llmClient,
      logger,
      batchId,
      repetition: item.repetition
    });
    status = res.status;
    finalAnswer = JSON.stringify({
      answer: res.answer,
      citations: res.citations,
      retrieved_chunks: res.retrievedChunks.map((c) => ({
        file: c.file,
        start_line: c.start_line,
        end_line: c.end_line
      }))
    });
    totalTokens = res.totalTokens;
    costUsd = res.totalCostUsd;
  }

  const run: Run = {
    id: logger.getRunId(),
    system: item.system,
    corpus: item.corpus,
    question_id: item.question.id,
    model: item.model,
    started_at: new Date(),
    status,
    final_answer: finalAnswer,
    total_tokens: totalTokens,
    cost_usd: costUsd,
    batch_id: batchId,
    repetition: item.repetition
  };

  const score = await scoreRun(
    pool,
    run,
    item.question,
    judgeClient,
    env.JUDGE_MODEL
  );

  return { run, score };
}

export async function runBenchmark(
  options: BenchOptions,
  pool: pg.Pool,
  env: EnvConfig,
  rootDir: string = process.cwd()
): Promise<void> {
  const corporaConfig = await loadCorporaConfig(rootDir);
  const questionsByCorpus: Record<string, Question[]> = {};

  for (const corpus of options.corpora) {
    const spec = corporaConfig.corpora[corpus];
    if (!spec) {
      throw new Error(`Corpus '${corpus}' not configured in config/corpora.json`);
    }
    const questions = await loadQuestions(corpus, rootDir, options.types, options.limit);
    const corpusRoot = path.resolve(rootDir, spec.path);

    for (const q of questions) {
      const issues = await validateQuestionAgainstCorpus(q, corpusRoot);
      if (issues.length > 0) {
        throw new Error(
          `Validation failed for question '${q.id}' in '${corpus}': ${issues[0].message}`
        );
      }
    }
    questionsByCorpus[corpus] = questions;
  }

  const matrix = buildRunMatrix(
    questionsByCorpus,
    options.systems,
    options.model,
    options.repetitions
  );

  if (options.dryRun) {
    process.stdout.write(`=== Benchmark Dry Run Matrix ===\n`);
    process.stdout.write(`Total runs: ${matrix.length}\n`);
    process.stdout.write(`Systems: ${options.systems.join(', ')}\n`);
    process.stdout.write(`Corpora: ${options.corpora.join(', ')}\n`);
    process.stdout.write(`Repetitions: ${options.repetitions}\n`);
    process.stdout.write(`Estimated LLM calls: ~${matrix.length * 4}\n`);
    for (const item of matrix.slice(0, 5)) {
      process.stdout.write(
        `  - [${item.system.toUpperCase()}] corpus: ${item.corpus}, question: ${item.question.id}, rep: ${item.repetition}\n`
      );
    }
    if (matrix.length > 5) {
      process.stdout.write(`  ... and ${matrix.length - 5} more.\n`);
    }
    return;
  }

  await warmUpDatabase(pool);
  const health = await checkDatabaseHealth();
  if (!health.connected) {
    throw new Error('Database health check failed');
  }

  const embeddingClient = createEmbeddingClient();
  await embeddingClient.verifyStartup();

  const batchName = options.batchName ?? `batch_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const gitCommitBenchmark = getGitCommit(rootDir);
  const gitCommitsCorpora: Record<string, string> = {};
  for (const corpus of options.corpora) {
    gitCommitsCorpora[corpus] = corporaConfig.corpora[corpus]?.commit ?? 'pinned';
  }

  const batchConfig: BatchConfig = {
    systems: options.systems,
    corpora: options.corpora,
    models: [options.model],
    repetitions: options.repetitions,
    top_k: options.topK ?? env.RAG_TOP_K ?? 8,
    max_steps: options.maxSteps ?? 15,
    git_commit_benchmark: gitCommitBenchmark,
    git_commits_corpora: gitCommitsCorpora
  };

  const batchId = await ensureBatchRecord(pool, batchName, batchConfig);
  const completedKeys = await getCompletedRunKeys(pool, batchId);

  const pendingItems = matrix.filter((item) => {
    const key = `${item.system}_${item.corpus}_${item.question.id}_${item.model}_${item.repetition}`;
    return !completedKeys.has(key);
  });

  process.stdout.write(`Batch: ${batchName} (ID: ${batchId})\n`);
  process.stdout.write(
    `Total planned: ${matrix.length}, Already completed: ${completedKeys.size}, Pending: ${pendingItems.length}\n\n`
  );

  const pacer = new Pacer(env.EVAL_MIN_REQUEST_INTERVAL_MS);
  const progress: ProgressState = {
    total: matrix.length,
    completed: completedKeys.size,
    failed: 0,
    skipped: completedKeys.size,
    runningCost: 0,
    startTime: Date.now()
  };

  const concurrency = env.EVAL_CONCURRENCY;

  for (let i = 0; i < pendingItems.length; i += concurrency) {
    const slice = pendingItems.slice(i, i + concurrency);
    const promises = slice.map(async (item) => {
      try {
        const { run, score } = await executeSingleBenchmarkItem(
          item,
          batchId,
          pool,
          env,
          corporaConfig,
          rootDir,
          batchConfig.top_k ?? 8,
          batchConfig.max_steps ?? 15,
          pacer
        );
        if (run.status === 'completed') {
          progress.completed++;
        } else {
          progress.failed++;
        }
        progress.runningCost += run.cost_usd + (score.judge_cost_usd ?? 0);
        const elapsed = (Date.now() - progress.startTime) / 1000;
        const perRunSec = elapsed / Math.max(1, progress.completed + progress.failed);
        const remainingRuns = progress.total - (progress.completed + progress.failed);
        const etaSec = Math.max(0, Math.ceil(remainingRuns * perRunSec));

        process.stdout.write(
          `[Progress] Done: ${progress.completed}/${progress.total} | Failed: ${progress.failed} | Running Cost: $${progress.runningCost.toFixed(5)} | ETA: ${etaSec}s | Last: [${item.system}] ${item.question.id} (Score: ${score.answer_score})\n`
        );
      } catch (err) {
        progress.failed++;
        process.stderr.write(`Run failed for ${item.system} on ${item.question.id}: ${(err as Error).message}\n`);
      }
    });

    await Promise.all(promises);
  }

  process.stdout.write(`\n=== Batch '${batchName}' Finished ===\n`);
  process.stdout.write(`Completed: ${progress.completed}, Failed: ${progress.failed}, Total Cost: $${progress.runningCost.toFixed(5)}\n`);
}
