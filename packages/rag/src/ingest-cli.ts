import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import readline from 'node:readline/promises';
import {
  CorporaConfig,
  createEmbeddingClient,
  createPool,
  getAppDatabaseUrl,
  validateEnv,
  warmUpDatabase
} from '@greptrace/core';
import { ingestCorpus } from './ingest/ingest.js';

interface CliArgs {
  corpus?: string;
  dryRun?: boolean;
  prune?: boolean;
  verify?: boolean;
  yes?: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--corpus' && args[i + 1]) {
      result.corpus = args[++i];
    } else if (args[i] === '--dry-run') {
      result.dryRun = true;
    } else if (args[i] === '--prune') {
      result.prune = true;
    } else if (args[i] === '--verify') {
      result.verify = true;
    } else if (args[i] === '--yes') {
      result.yes = true;
    }
  }
  return result;
}

function getCorpusCommit(corpusRoot: string): string {
  return execFileSync('git', ['-C', corpusRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

async function confirmPrune(): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await input.question('Delete stale chunk ids from Pinecone and PostgreSQL? Type yes to continue: ');
    return answer.trim().toLowerCase() === 'yes';
  } finally {
    input.close();
  }
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.corpus) {
    process.stderr.write('Error: --corpus <express|fastapi> is required.\n');
    process.exit(1);
  }

  const env = validateEnv();
  const rootDir = process.cwd();
  const rawConfig = await fs.readFile(path.join(rootDir, 'config', 'corpora.json'), 'utf8');
  const config: CorporaConfig = JSON.parse(rawConfig);

  const spec = config.corpora[args.corpus];
  if (!spec) {
    process.stderr.write(`Error: unknown corpus '${args.corpus}'.\n`);
    process.exit(1);
  }

  const corpusRoot = path.resolve(rootDir, spec.path);
  const commitHash = getCorpusCommit(corpusRoot);
  const pool = createPool(getAppDatabaseUrl(), 2);

  try {
    await warmUpDatabase(pool);
    const embeddingClient = args.dryRun || args.verify ? undefined : createEmbeddingClient();

    const namespace =
      args.corpus === 'express'
        ? env.PINECONE_NAMESPACE_EXPRESS
        : env.PINECONE_NAMESPACE_FASTAPI;

    process.stdout.write(`Starting ingestion for corpus: ${args.corpus}\n`);
    process.stdout.write(`Pinecone Index: ${env.PINECONE_INDEX_NAME}, Namespace: ${namespace}\n\n`);

    const summary = await ingestCorpus({
      corpus: args.corpus,
      corpusRoot,
      commitHash,
      embeddingModel: env.EMBEDDING_MODEL,
      chunkMaxTokens: env.CHUNK_MAX_TOKENS,
      chunkOverlapLines: env.CHUNK_OVERLAP_LINES,
      pool,
      embeddingClient,
      pineconeApiKey: env.PINECONE_API_KEY,
      pineconeIndexName: env.PINECONE_INDEX_NAME,
      pineconeNamespace: namespace,
      batchSize: 32,
      dryRun: args.dryRun,
      prune: args.prune,
      verify: args.verify,
      yes: args.yes,
      confirmPrune
    });

    process.stdout.write(`\n=== Ingestion Complete ===\n`);
    process.stdout.write(`Corpus: ${summary.corpus}\n`);
    process.stdout.write(`Total chunks: ${summary.totalChunks}\n`);
    process.stdout.write(`Already present: ${summary.alreadyPresent}\n`);
    process.stdout.write(`To ingest: ${summary.newChunks}\n`);
    process.stdout.write(`Stale: ${summary.staleChunks}\n`);
    process.stdout.write(`Estimated tokens: ${summary.estimatedTokens}\n`);
    process.stdout.write(`Max chunk tokens: ${summary.maxChunkTokens}\n`);
    process.stdout.write(`Median chunk tokens: ${summary.medianChunkTokens}\n`);
    process.stdout.write(`Over embedding limit: ${summary.truncatedInputs}\n`);
    process.stdout.write(`Oversized single lines split: ${summary.oversizedLineCount}\n`);
    process.stdout.write(`Newly ingested: ${summary.ingestedChunks}\n`);
    process.stdout.write(`Tokens used: ${summary.totalTokens}\n`);
    process.stdout.write(`Billed/estimated token ratio: ${summary.billedTokenRatio.toFixed(3)}\n`);
    process.stdout.write(`Truncated inputs: ${summary.truncatedInputs} (${summary.truncatedPercentage.toFixed(2)}%)\n`);
    process.stdout.write(`Pruned chunks: ${summary.prunedChunks}\n`);
    if (summary.verified) {
      process.stdout.write(`Verify mismatches: ${summary.verified.mismatches.length}\n`);
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('ingest-cli.ts') || process.argv[1]?.endsWith('ingest-cli.js')) {
  main().catch((err) => {
    process.stderr.write(`Ingestion failed: ${err.message}\n`);
    process.exit(1);
  });
}
