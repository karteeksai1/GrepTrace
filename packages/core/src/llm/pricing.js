const PRICING_TABLE = {
    'openai/gpt-oss-120b': {
        promptCostPerMillion: 0.15,
        completionCostPerMillion: 0.60
    },
    'openai/gpt-oss-20b': {
        promptCostPerMillion: 0.075,
        completionCostPerMillion: 0.30
    },
    'gpt-4o': {
        promptCostPerMillion: 2.50,
        completionCostPerMillion: 10.00
    },
    'gpt-4o-mini': {
        promptCostPerMillion: 0.15,
        completionCostPerMillion: 0.60
    },
    'claude-3-5-sonnet-20241022': {
        promptCostPerMillion: 3.00,
        completionCostPerMillion: 15.00
    },
    'claude-3-5-haiku-20241022': {
        promptCostPerMillion: 0.80,
        completionCostPerMillion: 4.00
    }
};
const DEFAULT_PRICING = {
    promptCostPerMillion: 0.50,
    completionCostPerMillion: 1.50
};
export function getModelPricing(modelName) {
    const match = Object.keys(PRICING_TABLE).find((key) => modelName.toLowerCase().includes(key.toLowerCase()));
    return match ? PRICING_TABLE[match] : DEFAULT_PRICING;
}
export function calculateCost(modelName, promptTokens, completionTokens) {
    const pricing = getModelPricing(modelName);
    const cost = (promptTokens * pricing.promptCostPerMillion +
        completionTokens * pricing.completionCostPerMillion) /
        1_000_000;
    return Number(cost.toFixed(6));
}
//# sourceMappingURL=pricing.js.map