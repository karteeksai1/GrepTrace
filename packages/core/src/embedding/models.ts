export interface ModelSpec {
  name: string;
  maxBatchSize: number;
  maxTokens: number;
  supportedDimensions: number[];
}

const MODEL_SPECS: Record<string, ModelSpec> = {
  'multilingual-e5-large': {
    name: 'multilingual-e5-large',
    maxBatchSize: 96,
    maxTokens: 512,
    supportedDimensions: [1024]
  },
  'llama-text-embed-v2': {
    name: 'llama-text-embed-v2',
    maxBatchSize: 96,
    maxTokens: 2048,
    supportedDimensions: [1024, 2048]
  },
  'text-embedding-3-small': {
    name: 'text-embedding-3-small',
    maxBatchSize: 96,
    maxTokens: 8191,
    supportedDimensions: [512, 1536]
  },
  'text-embedding-3-large': {
    name: 'text-embedding-3-large',
    maxBatchSize: 96,
    maxTokens: 8191,
    supportedDimensions: [1024, 1536, 3072]
  }
};

const DEFAULT_SPEC: ModelSpec = {
  name: 'default',
  maxBatchSize: 96,
  maxTokens: 512,
  supportedDimensions: [1024]
};

export function getModelSpec(modelName: string): ModelSpec {
  const normalized = modelName.toLowerCase();
  for (const [key, spec] of Object.entries(MODEL_SPECS)) {
    if (normalized.includes(key)) {
      return spec;
    }
  }
  return { ...DEFAULT_SPEC, name: modelName };
}

export function prepareInputTexts(
  texts: string[],
  maxTokens: number
): { prepared: string[]; truncatedCount: number } {
  let truncatedCount = 0;

  const prepared = texts.map((text) => {
    if (estimateEmbeddingTokens(text) > maxTokens) {
      truncatedCount++;
      return text.slice(0, maxTokens * 4);
    }
    return text;
  });

  return { prepared, truncatedCount };
}

export function estimateEmbeddingTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
