import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { IngestVectorStore, ingestCorpus } from '@greptrace/rag';
import { EmbeddingClient } from '@greptrace/core';

function createPool(rows: Array<Record<string, unknown>>) {
  const queries: string[] = [];
  return {
    queries,
    pool: {
      query: vi.fn(async (query: string) => {
        queries.push(query);
        if (query.includes('SELECT id FROM chunks')) return { rows: rows.map((row) => ({ id: row.id })) };
        if (query.includes('SELECT id, file')) return { rows };
        if (query.includes('SELECT * FROM corpus_ingestions')) return { rows: [{ commit_hash: 'old-commit' }] };
        return { rows: [] };
      })
    }
  };
}

async function createCorpus(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'greptrace-ingest-'));
  await fs.writeFile(path.join(root, 'main.py'), 'def hello():\n    return "world"\n');
  return { root, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

function fakeEmbeddingClient(): EmbeddingClient {
  return {
    embed: vi.fn(),
    getDimension: () => 1024,
    getModel: () => 'multilingual-e5-large',
    verifyStartup: vi.fn()
  };
}

function fakeVectorStore(): IngestVectorStore & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    upsert: vi.fn(),
    delete: vi.fn(async (ids: string[]) => deleted.push(...ids)),
    count: vi.fn(async () => 0)
  };
}

describe('RAG ingestion controls', () => {
  it('dry-run does not embed or write', async () => {
    const corpus = await createCorpus();
    try {
      const db = createPool([{ id: 'fastapi_main.py_1_3' }, { id: 'fastapi_old.py_10_20' }]);
      const embeddingClient = fakeEmbeddingClient();
      const vectorStore = fakeVectorStore();
      const summary = await ingestCorpus({
        corpus: 'fastapi',
        corpusRoot: corpus.root,
        commitHash: 'current-commit',
        embeddingModel: 'multilingual-e5-large',
        pool: db.pool as never,
        embeddingClient,
        vectorStore,
        pineconeApiKey: 'unused',
        pineconeIndexName: 'unused',
        pineconeNamespace: 'fastapi',
        dryRun: true
      });

      expect(summary.staleChunks).toBe(1);
      expect(embeddingClient.embed).not.toHaveBeenCalled();
      expect(embeddingClient.verifyStartup).not.toHaveBeenCalled();
      expect(vectorStore.upsert).not.toHaveBeenCalled();
      expect(vectorStore.delete).not.toHaveBeenCalled();
      expect(db.queries.some((query) => /INSERT|UPDATE|DELETE/i.test(query))).toBe(false);
    } finally {
      await corpus.cleanup();
    }
  });

  it('prunes only stale ids and records the completed ingestion', async () => {
    const corpus = await createCorpus();
    try {
      const db = createPool([{ id: 'fastapi_main.py_1_3' }, { id: 'fastapi_old.py_10_20' }]);
      const vectorStore = fakeVectorStore();
      const summary = await ingestCorpus({
        corpus: 'fastapi',
        corpusRoot: corpus.root,
        commitHash: 'current-commit',
        embeddingModel: 'multilingual-e5-large',
        pool: db.pool as never,
        vectorStore,
        pineconeApiKey: 'unused',
        pineconeIndexName: 'unused',
        pineconeNamespace: 'fastapi',
        prune: true,
        yes: true
      });

      expect(summary.prunedChunks).toBe(1);
      expect(vectorStore.deleted).toEqual(['fastapi_old.py_10_20']);
      expect(db.queries.some((query) => query.includes('corpus_ingestions'))).toBe(true);
    } finally {
      await corpus.cleanup();
    }
  });

  it('reports stale rows, invalid ranges, vector mismatches, and commit drift', async () => {
    const corpus = await createCorpus();
    try {
      const db = createPool([
        { id: 'fastapi_main.py_1_3', file: 'main.py', start_line: 1, end_line: 3, embedded: true },
        { id: 'stale', file: 'missing.py', start_line: 1, end_line: 2, embedded: true }
      ]);
      const vectorStore = fakeVectorStore();
      vectorStore.count = vi.fn(async () => 3);
      const summary = await ingestCorpus({
        corpus: 'fastapi',
        corpusRoot: corpus.root,
        commitHash: 'current-commit',
        embeddingModel: 'multilingual-e5-large',
        pool: db.pool as never,
        vectorStore,
        pineconeApiKey: 'unused',
        pineconeIndexName: 'unused',
        pineconeNamespace: 'fastapi',
        verify: true
      });

      expect(summary.verified?.mismatches).toEqual(expect.arrayContaining([
        'Recorded commit old-commit differs from checked-out commit current-commit.',
        '1 stored chunk ranges do not exist in the checkout.',
        '1 stale chunk rows exist.',
        'Pinecone vectors 3 do not match embedded current rows 1.'
      ]));
    } finally {
      await corpus.cleanup();
    }
  });
});
