import pg from 'pg';
import { EmbeddingClient } from '@greptrace/core';
export interface IngestOptions {
    corpus: string;
    corpusRoot: string;
    pool: pg.Pool;
    embeddingClient: EmbeddingClient;
    pineconeApiKey: string;
    pineconeIndexName: string;
    pineconeNamespace: string;
    batchSize?: number;
}
export interface IngestSummary {
    corpus: string;
    totalChunks: number;
    newChunks: number;
    ingestedChunks: number;
    totalTokens: number;
}
export declare function ingestCorpus(options: IngestOptions): Promise<IngestSummary>;
//# sourceMappingURL=ingest.d.ts.map