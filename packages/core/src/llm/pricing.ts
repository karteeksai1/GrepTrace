export interface ModelPricing {
  promptCostPerMillion: number;
  completionCostPerMillion: number;
}

const PRICING_TABLE: Record<string, ModelPricing> = {
  'openai/gpt-oss-120b': {
    promptCostPerMillion: 0.15,
    completionCostPerMillion: 0.60
  },
  'openai/gpt-oss-20b': {
    promptCostPerMillion: 0.075,
    completionCostPerMillion: 0.30
  }
};

const DEFAULT_PRICING: ModelPricing = {
  promptCostPerMillion: 0.50,
  completionCostPerMillion: 1.50
};

export function getModelPricing(modelName: string): ModelPricing {
  const match = Object.keys(PRICING_TABLE).find((key) =>
    modelName.toLowerCase().includes(key.toLowerCase())
  );
  return match ? PRICING_TABLE[match] : DEFAULT_PRICING;
}

export function calculateCost(
  modelName: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = getModelPricing(modelName);
  const cost =
    (promptTokens * pricing.promptCostPerMillion +
      completionTokens * pricing.completionCostPerMillion) /
    1_000_000;
  return Number(cost.toFixed(6));
}
