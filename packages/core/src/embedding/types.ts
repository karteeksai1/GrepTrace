export type EmbeddingInputType = 'passage' | 'query';

export interface EmbeddingResult {
  embeddings: number[][];
  totalTokens?: number;
  truncatedCount?: number;
}

export interface EmbeddingClient {
  embed(texts: string[], inputType: EmbeddingInputType): Promise<EmbeddingResult>;
  getDimension(): number;
  getModel(): string;
  verifyStartup(): Promise<void>;
}
