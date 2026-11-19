import { validateEnv } from '../config/env.js';
import { PineconeEmbeddingClient } from './pinecone.js';
export * from './types.js';
export * from './models.js';
export * from './pinecone.js';
export function createEmbeddingClient() {
    const env = validateEnv();
    return new PineconeEmbeddingClient({
        apiKey: env.PINECONE_API_KEY,
        model: env.EMBEDDING_MODEL,
        dimension: env.EMBEDDING_DIMENSION,
        indexName: env.PINECONE_INDEX_NAME
    });
}
//# sourceMappingURL=index.js.map