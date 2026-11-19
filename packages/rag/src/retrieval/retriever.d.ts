import { EmbeddingClient } from '@greptrace/core';
import { CodeChunk } from '../chunking/types.js';
export interface RetrievalResult {
    chunks: CodeChunk[];
    dbTimeMs: number;
    totalRetrievalMs: number;
    tokensUsed: number;
}
export declare function retrieveChunks(pineconeApiKey: string, indexName: string, namespace: string, embeddingClient: EmbeddingClient, question: string, topK?: number): Promise<RetrievalResult>;
//# sourceMappingURL=retriever.d.ts.map