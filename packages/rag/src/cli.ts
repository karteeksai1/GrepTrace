import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createEmbeddingClient,
  createLLMClient,
  createPool,
  getAppDatabaseUrl,
  Question,
  TraceLogger,
  validateEnv,
  warmUpDatabase
} from '@greptrace/core';
import { runRagPipeline } from './pipeline.js';

interface CliArgs {
  corpus?: string;
  questionId?: string;
  questionText?: string;
  model?: string;
  topK?: number;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--corpus' && args[i + 1]) {
      result.corpus = args[++i];
    } else if (arg === '--question-id' && args[i + 1]) {
      result.questionId = args[++i];
    } else if (arg === '--question' && args[i + 1]) {
      result.questionText = args[++i];
    } else if (arg === '--model' && args[i + 1]) {
      result.model = args[++i];
    } else if (arg === '--top-k' && args[i + 1]) {
      result.topK = parseInt(args[++i], 10);
    }
  }
  return result;
}

async function loadQuestion(corpus: string, questionId: string, rootDir: string): Promise<Question> {
  const qFilePath = path.join(rootDir, 'data', 'questions', `${corpus}.json`);
  const raw = await fs.readFile(qFilePath, 'utf8');
  const questions: Question[] = JSON.parse(raw);
  const matched = questions.find((q) => q.id === questionId);
  if (!matched) {
    throw new Error(`Question ID '${questionId}' not found in ${qFilePath}`);
  }
  return matched;
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.corpus) {
    process.stderr.write('Error: --corpus <express|fastapi> is required.\n');
    process.exit(1);
  }

  if (!args.questionId && !args.questionText) {
    process.stderr.write('Error: either --question-id <id> or --question "text" is required.\n');
    process.exit(1);
  }

  const env = validateEnv();
  const rootDir = process.cwd();

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
    const embeddingClient = createEmbeddingClient();
    const llmClient = createLLMClient(undefined, args.model);

    const namespace =
      args.corpus === 'express'
        ? env.PINECONE_NAMESPACE_EXPRESS
        : env.PINECONE_NAMESPACE_FASTAPI;

    const topK = args.topK ?? env.RAG_TOP_K ?? 8;

    process.stdout.write(`Starting GrepTrace RAG run for corpus: ${args.corpus}\n`);
    process.stdout.write(`Model: ${args.model ?? llmClient.getDefaultModel()}\n`);
    process.stdout.write(`Pinecone Namespace: ${namespace}, Top-K: ${topK}\n`);
    process.stdout.write(`Question: ${questionText}\n\n`);

    const result = await runRagPipeline({
      question: questionText,
      corpus: args.corpus,
      questionId,
      model: args.model,
      topK,
      pineconeApiKey: env.PINECONE_API_KEY,
      pineconeIndexName: env.PINECONE_INDEX_NAME,
      pineconeNamespace: namespace,
      embeddingClient,
      llmClient,
      logger
    });

    process.stdout.write(`\n=== Run Result ===\n`);
    process.stdout.write(`Run ID: ${result.runId}\n`);
    process.stdout.write(`Status: ${result.status}\n`);
    process.stdout.write(`Step count: ${result.stepCount}\n`);
    process.stdout.write(`DB retrieval time (db_time_ms): ${result.dbTimeMs}ms\n`);
    process.stdout.write(`Total retrieval time: ${result.totalRetrievalMs}ms\n`);
    process.stdout.write(`Total tokens: ${result.totalTokens}\n`);
    process.stdout.write(`Total cost: $${result.totalCostUsd}\n`);
    process.stdout.write(`\nAnswer:\n${result.answer}\n\n`);

    process.stdout.write(`Citations:\n`);
    if (result.citations.length === 0) {
      process.stdout.write(`  (none)\n`);
    } else {
      for (const c of result.citations) {
        process.stdout.write(`  - ${c.file}:${c.start_line}-${c.end_line}\n`);
      }
    }

    process.stdout.write(`\nRetrieved Chunks (${result.retrievedChunks.length}):\n`);
    for (const chunk of result.retrievedChunks) {
      process.stdout.write(`  - ${chunk.file}:${chunk.start_line}-${chunk.end_line} [${chunk.id}]\n`);
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('cli.ts') || process.argv[1]?.endsWith('cli.js')) {
  main().catch((err) => {
    process.stderr.write(`RAG run failed: ${err.message}\n`);
    process.exit(1);
  });
}
