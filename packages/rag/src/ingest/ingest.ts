import { Pinecone } from '@pinecone-database/pinecone';
import fs from 'node:fs/promises';
import pg from 'pg';
import { EmbeddingClient, estimateEmbeddingTokens, getCorpusIngestion, getModelSpec, prepareInputTexts, recordCorpusIngestion } from '@greptrace/core';
import { CodeChunk } from '../chunking/types.js';
import { scanAndChunkCorpusWithSummary } from './scanner.js';

export interface IngestOptions {
  corpus: string;
  corpusRoot: string;
  commitHash: string;
  embeddingModel: string;
  chunkMaxTokens?: number;
  chunkOverlapLines?: number;
  pool: pg.Pool;
  embeddingClient?: EmbeddingClient;
  vectorStore?: IngestVectorStore;
  pineconeApiKey: string;
  pineconeIndexName: string;
  pineconeNamespace: string;
  batchSize?: number;
  dryRun?: boolean;
  prune?: boolean;
  yes?: boolean;
  confirmPrune?: () => Promise<boolean>;
  verify?: boolean;
}

export interface IngestSummary {
  corpus: string;
  totalChunks: number;
  alreadyPresent: number;
  newChunks: number;
  ingestedChunks: number;
  staleChunks: number;
  estimatedTokens: number;
  totalTokens: number;
  truncatedInputs: number;
  truncatedPercentage: number;
  maxChunkTokens: number;
  medianChunkTokens: number;
  oversizedLineCount: number;
  prunedChunks: number;
  verified?: VerifySummary;
}

export interface VerifySummary {
  corpus: string;
  recordedCommit: string | null;
  currentCommit: string;
  invalidRanges: string[];
  staleIds: string[];
  embeddedRows: number;
  vectorCount: number;
  vectorCountMatches: boolean;
  mismatches: string[];
}

interface StoredChunk {
  id: string;
  file: string;
  start_line: number;
  end_line: number;
  embedded: boolean;
}

function formatChunkForEmbedding(chunk: CodeChunk): string {
  return `File: ${chunk.file} (lines ${chunk.start_line}-${chunk.end_line})\n${chunk.content}`;
}

export interface IngestVectorStore {
  upsert(records: Array<{ id: string; values: number[]; metadata: Record<string, string | number> }>): Promise<void>;
  delete(ids: string[]): Promise<void>;
  count(): Promise<number>;
}

interface IngestPlan {
  chunks: CodeChunk[];
  existingIds: Set<string>;
  currentIds: Set<string>;
  newChunks: CodeChunk[];
  staleIds: string[];
  estimatedTokens: number;
  truncatedInputs: number;
  maxChunkTokens: number;
  medianChunkTokens: number;
}

function createPineconeVectorStore(
  apiKey: string,
  indexName: string,
  namespace: string
): IngestVectorStore {
  const pc = new Pinecone({ apiKey });
  const index = pc.index(indexName).namespace(namespace);
  return {
    upsert: async (records) => index.upsert({ records }),
    delete: async (ids) => index.deleteMany({ ids }),
    count: async () => {
      const stats = await index.describeIndexStats();
      return stats.namespaces?.[namespace]?.recordCount ?? 0;
    }
  };
}

function createIngestPlan(chunks: CodeChunk[], existingIds: Set<string>, embeddingModel: string): IngestPlan {
  const currentIds = new Set(chunks.map((chunk) => chunk.id));
  const modelSpec = getModelSpec(embeddingModel);
  const texts = chunks.map(formatChunkForEmbedding);
  const { truncatedCount } = prepareInputTexts(texts, modelSpec.maxTokens);
  const tokenCounts = texts.map(estimateEmbeddingTokens).sort((a, b) => a - b);
  return {
    chunks,
    existingIds,
    currentIds,
    newChunks: chunks.filter((chunk) => !existingIds.has(chunk.id)),
    staleIds: [...existingIds].filter((id) => !currentIds.has(id)),
    estimatedTokens: texts.reduce((total, text) => total + estimateEmbeddingTokens(text), 0),
    truncatedInputs: truncatedCount,
    maxChunkTokens: tokenCounts[tokenCounts.length - 1] ?? 0,
    medianChunkTokens: tokenCounts.length === 0 ? 0 : tokenCounts[Math.floor((tokenCounts.length - 1) / 2)]
  };
}

function printIngestPlan(corpus: string, plan: IngestPlan): void {
  process.stdout.write(
    `Corpus '${corpus}': chunks ${plan.chunks.length}, over embedding limit ${plan.truncatedInputs}, max tokens ${plan.maxChunkTokens}, median tokens ${plan.medianChunkTokens}, estimated embedding tokens ${plan.estimatedTokens}, stale ${plan.staleIds.length}, to ingest ${plan.newChunks.length}.\n`
  );
}

async function getExistingChunkIds(pool: pg.Pool, corpus: string): Promise<Set<string>> {
  const result = await pool.query('SELECT id FROM chunks WHERE corpus = $1', [corpus]);
  return new Set(result.rows.map((r) => r.id));
}

async function getStoredChunks(pool: pg.Pool, corpus: string): Promise<StoredChunk[]> {
  const result = await pool.query(
    'SELECT id, file, start_line, end_line, embedding IS NOT NULL AS embedded FROM chunks WHERE corpus = $1',
    [corpus]
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    file: String(row.file),
    start_line: Number(row.start_line),
    end_line: Number(row.end_line),
    embedded: Boolean(row.embedded)
  }));
}

async function pruneStaleChunks(options: IngestOptions, plan: IngestPlan, vectorStore: IngestVectorStore): Promise<number> {
  if (plan.staleIds.length === 0) return 0;
  if (!options.yes && !(await (options.confirmPrune?.() ?? Promise.resolve(false)))) {
    throw new Error('Prune cancelled. Re-run with --yes or confirm interactively.');
  }
  const batchSize = Math.max(1, options.batchSize ?? 32);
  for (let i = 0; i < plan.staleIds.length; i += batchSize) {
    await vectorStore.delete(plan.staleIds.slice(i, i + batchSize));
  }
  await options.pool.query('DELETE FROM chunks WHERE corpus = $1 AND id = ANY($2::text[])', [options.corpus, plan.staleIds]);
  return plan.staleIds.length;
}

async function verifyStoredChunks(options: IngestOptions, plan: IngestPlan, vectorStore: IngestVectorStore): Promise<VerifySummary> {
  const rows = await getStoredChunks(options.pool, options.corpus);
  const fileLines = new Map<string, number>();
  const invalidRanges: string[] = [];
  for (const row of rows) {
    if (!fileLines.has(row.file)) {
      try {
        const content = await fs.readFile(`${options.corpusRoot}/${row.file}`, 'utf8');
        fileLines.set(row.file, content.split(/\r?\n/).length);
      } catch {
        fileLines.set(row.file, 0);
      }
    }
    const lineCount = fileLines.get(row.file) ?? 0;
    if (lineCount === 0 || row.start_line < 1 || row.end_line < row.start_line || row.end_line > lineCount) {
      invalidRanges.push(`${row.file}:${row.start_line}-${row.end_line}`);
    }
  }
  const staleIds = rows.map((row) => row.id).filter((id) => !plan.currentIds.has(id));
  const embeddedRows = rows.filter((row) => plan.currentIds.has(row.id) && row.embedded).length;
  const vectorCount = await vectorStore.count();
  const ingestion = await getCorpusIngestion(options.pool, options.corpus);
  const mismatches: string[] = [];
  if (!ingestion) mismatches.push('No corpus_ingestions row exists.');
  else if (ingestion.commit_hash !== options.commitHash) mismatches.push(`Recorded commit ${ingestion.commit_hash} differs from checked-out commit ${options.commitHash}.`);
  if (invalidRanges.length > 0) mismatches.push(`${invalidRanges.length} stored chunk ranges do not exist in the checkout.`);
  if (staleIds.length > 0) mismatches.push(`${staleIds.length} stale chunk rows exist.`);
  if (vectorCount !== embeddedRows) mismatches.push(`Pinecone vectors ${vectorCount} do not match embedded current rows ${embeddedRows}.`);
  return { corpus: options.corpus, recordedCommit: ingestion?.commit_hash ?? null, currentCommit: options.commitHash, invalidRanges, staleIds, embeddedRows, vectorCount, vectorCountMatches: vectorCount === embeddedRows, mismatches };
}

async function recordSuccessfulIngestion(options: IngestOptions, plan: IngestPlan): Promise<void> {
  if (plan.truncatedInputs > 0) return;
  await recordCorpusIngestion(options.pool, {
    corpus: options.corpus,
    commit_hash: options.commitHash,
    pinecone_namespace: options.pineconeNamespace,
    embedding_model: options.embeddingModel,
    chunk_max_tokens: options.chunkMaxTokens ?? 400,
    chunk_overlap_lines: options.chunkOverlapLines ?? 5,
    chunk_count: plan.chunks.length
  });
}

async function insertChunksToPostgres(
  pool: pg.Pool,
  batch: CodeChunk[],
  embeddings: number[][]
): Promise<void> {
  if (batch.length === 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const query = `
      INSERT INTO chunks (id, corpus, file, start_line, end_line, content, tokens, embedding)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING;
    `;

    for (let i = 0; i < batch.length; i++) {
      const c = batch[i];
      const emb = embeddings[i];
      const vectorLiteral = `[${emb.join(',')}]`;
      const values = [c.id, c.corpus, c.file, c.start_line, c.end_line, c.content, c.tokens ?? 0, vectorLiteral];
      await client.query(query, values);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function ingestCorpus(options: IngestOptions): Promise<IngestSummary> {
  const chunkMaxTokens = options.chunkMaxTokens ?? 400;
  const chunkOverlapLines = options.chunkOverlapLines ?? 5;
  const scanned = await scanAndChunkCorpusWithSummary(options.corpus, options.corpusRoot, { maxTokens: chunkMaxTokens, overlapLines: chunkOverlapLines });
  const allChunks = scanned.chunks;
  const existingIds = await getExistingChunkIds(options.pool, options.corpus);
  const plan = createIngestPlan(allChunks, existingIds, options.embeddingModel);
  printIngestPlan(options.corpus, plan);
  const percentage = allChunks.length === 0 ? 0 : (plan.truncatedInputs / allChunks.length) * 100;
  const emptySummary = (prunedChunks = 0): IngestSummary => ({
    corpus: options.corpus,
    totalChunks: allChunks.length,
    alreadyPresent: existingIds.size,
    newChunks: plan.newChunks.length,
    ingestedChunks: 0,
    staleChunks: plan.staleIds.length,
    estimatedTokens: plan.estimatedTokens,
    totalTokens: 0,
    truncatedInputs: plan.truncatedInputs,
    truncatedPercentage: percentage,
    maxChunkTokens: plan.maxChunkTokens,
    medianChunkTokens: plan.medianChunkTokens,
    oversizedLineCount: scanned.oversizedLineCount,
    prunedChunks
  });
  if (options.dryRun) {
    if (options.prune) {
      const ingestion = await getCorpusIngestion(options.pool, options.corpus);
      process.stdout.write(`Recorded ingestion commit: ${ingestion?.commit_hash ?? 'none'}\n`);
    }
    return emptySummary();
  }
  const vectorStore = options.vectorStore ?? createPineconeVectorStore(options.pineconeApiKey, options.pineconeIndexName, options.pineconeNamespace);
  let prunedChunks = 0;
  if (options.prune) {
    const ingestion = await getCorpusIngestion(options.pool, options.corpus);
    process.stdout.write(`Recorded ingestion commit: ${ingestion?.commit_hash ?? 'none'}\n`);
    prunedChunks = await pruneStaleChunks(options, plan, vectorStore);
  }
  if (options.verify) {
    const verified = await verifyStoredChunks(options, plan, vectorStore);
    for (const mismatch of verified.mismatches) process.stdout.write(`Verify mismatch: ${mismatch}\n`);
    if (verified.mismatches.length === 0) process.stdout.write('Verify: no mismatches found.\n');
    return { ...emptySummary(prunedChunks), verified };
  }
  if (plan.newChunks.length === 0) {
    await recordSuccessfulIngestion(options, plan);
    return emptySummary(prunedChunks);
  }
  if (!options.embeddingClient) throw new Error('An embedding client is required for non-dry-run ingestion.');
  await options.embeddingClient.verifyStartup();
  const batchSize = Math.max(1, options.batchSize ?? 32);
  let accumulatedTokens = 0;
  let ingestedCount = 0;

  for (let i = 0; i < plan.newChunks.length; i += batchSize) {
    const batch = plan.newChunks.slice(i, i + batchSize);
    const texts = batch.map(formatChunkForEmbedding);

    const embedRes = await options.embeddingClient.embed(texts, 'passage');
    accumulatedTokens += embedRes.totalTokens ?? 0;

    await insertChunksToPostgres(options.pool, batch, embedRes.embeddings);

    const pineconeRecords = batch.map((c, idx) => ({
      id: c.id,
      values: embedRes.embeddings[idx],
      metadata: {
        file: c.file,
        start_line: c.start_line,
        end_line: c.end_line,
        text: c.content.slice(0, 1000)
      }
    }));

    await vectorStore.upsert(pineconeRecords);
    ingestedCount += batch.length;

    process.stdout.write(`Progress: ${ingestedCount} / ${plan.newChunks.length} chunks ingested...\n`);
  }
  await recordSuccessfulIngestion(options, plan);
  return { ...emptySummary(prunedChunks), ingestedChunks: ingestedCount, totalTokens: accumulatedTokens };
}
