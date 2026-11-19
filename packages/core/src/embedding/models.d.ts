export interface ModelSpec {
    name: string;
    maxBatchSize: number;
    maxTokens: number;
    supportedDimensions: number[];
}
export declare function getModelSpec(modelName: string): ModelSpec;
export declare function prepareInputTexts(texts: string[], maxTokens: number): {
    prepared: string[];
    truncatedCount: number;
};
//# sourceMappingURL=models.d.ts.map