export interface ModelPricing {
    promptCostPerMillion: number;
    completionCostPerMillion: number;
}
export declare function getModelPricing(modelName: string): ModelPricing;
export declare function calculateCost(modelName: string, promptTokens: number, completionTokens: number): number;
//# sourceMappingURL=pricing.d.ts.map