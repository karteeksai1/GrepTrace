import { EmbeddingClient, EmbeddingInputType, EmbeddingResult } from './types.js';
export interface PineconeEmbeddingConfig {
    apiKey: string;
    model: string;
    dimension: number;
    indexName: string;
    batchSize?: number;
    pacingDelayMs?: number;
    maxRetries?: number;
}
export declare class PineconeEmbeddingClient implements EmbeddingClient {
    private pc;
    private model;
    private dimension;
    private indexName;
    private batchSize;
    private pacingDelayMs;
    private maxRetries;
    constructor(config: PineconeEmbeddingConfig);
    getDimension(): number;
    getModel(): string;
    verifyStartup(): Promise<void>;
    private embedBatchWithRetry;
    embed(texts: string[], inputType: EmbeddingInputType): Promise<EmbeddingResult>;
}
//# sourceMappingURL=pinecone.d.ts.map