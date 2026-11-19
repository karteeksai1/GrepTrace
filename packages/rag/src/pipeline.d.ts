import { EmbeddingClient, GroundTruthLocation, LLMClient, TraceLogger } from '@greptrace/core';
import { CodeChunk } from './chunking/types.js';
export interface RagRunOptions {
    question: string;
    corpus: string;
    questionId?: string;
    model?: string;
    topK?: number;
    pineconeApiKey: string;
    pineconeIndexName: string;
    pineconeNamespace: string;
    embeddingClient: EmbeddingClient;
    llmClient: LLMClient;
    logger: TraceLogger;
    batchId?: string | null;
    repetition?: number | null;
}
export interface RagRunResult {
    runId: string;
    answer: string;
    citations: GroundTruthLocation[];
    retrievedChunks: CodeChunk[];
    dbTimeMs: number;
    totalRetrievalMs: number;
    stepCount: number;
    totalTokens: number;
    totalCostUsd: number;
    status: 'completed' | 'failed';
}
export declare function runRagPipeline(options: RagRunOptions): Promise<RagRunResult>;
//# sourceMappingURL=pipeline.d.ts.map