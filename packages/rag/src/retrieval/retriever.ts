import { Pinecone } from '@pinecone-database/pinecone';
import { EmbeddingClient } from '@greptrace/core';
import { CodeChunk } from '../chunking/types.js';

export interface RetrievalResult {
  chunks: CodeChunk[];
  embeddingTimeMs: number;
  pineconeQueryTimeMs: number;
  neonFetchTimeMs: number;
  dbTimeMs: number;
  totalRetrievalMs: number;
  tokensUsed: number;
}

export async function retrieveChunks(
  pineconeApiKey: string,
  indexName: string,
  namespace: string,
  embeddingClient: EmbeddingClient,
  question: string,
  topK = 8
): Promise<RetrievalResult> {
  const totalStart = Date.now();
  const embeddingStart = Date.now();
  const embedRes = await embeddingClient.embed([question], 'query');
  const embeddingTimeMs = Date.now() - embeddingStart;
  const queryVector = embedRes.embeddings[0];

  const pc = new Pinecone({ apiKey: pineconeApiKey });
  const index = pc.index(indexName).namespace(namespace);

  const dbStart = Date.now();
  const queryResponse = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true
  });
  const dbTimeMs = Date.now() - dbStart;
  const totalRetrievalMs = Date.now() - totalStart;

  const chunks: CodeChunk[] = [];
  for (const match of queryResponse.matches || []) {
    const meta = match.metadata as Record<string, unknown> | undefined;
    if (meta) {
      chunks.push({
        id: match.id,
        corpus: namespace,
        file: String(meta.file ?? ''),
        start_line: Number(meta.start_line ?? 1),
        end_line: Number(meta.end_line ?? 1),
        content: String(meta.text ?? '')
      });
    }
  }

  return {
    chunks,
    embeddingTimeMs,
    pineconeQueryTimeMs: dbTimeMs,
    neonFetchTimeMs: 0,
    dbTimeMs,
    totalRetrievalMs,
    tokensUsed: embedRes.totalTokens ?? 0
  };
}
