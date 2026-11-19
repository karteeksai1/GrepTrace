import { Pinecone } from '@pinecone-database/pinecone';
import { getModelSpec, prepareInputTexts } from './models.js';
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class PineconeEmbeddingClient {
    pc;
    model;
    dimension;
    indexName;
    batchSize;
    pacingDelayMs;
    maxRetries;
    constructor(config) {
        this.pc = new Pinecone({ apiKey: config.apiKey });
        this.model = config.model;
        this.dimension = config.dimension;
        this.indexName = config.indexName;
        const spec = getModelSpec(config.model);
        this.batchSize = config.batchSize ?? spec.maxBatchSize;
        this.pacingDelayMs = config.pacingDelayMs ?? 100;
        this.maxRetries = config.maxRetries ?? 5;
    }
    getDimension() {
        return this.dimension;
    }
    getModel() {
        return this.model;
    }
    async verifyStartup() {
        const testResult = await this.embed(['verification test'], 'query');
        const returnedLength = testResult.embeddings[0]?.length;
        if (!returnedLength || returnedLength !== this.dimension) {
            throw new Error(`Embedding model '${this.model}' returned vector dimension ${returnedLength}, but EMBEDDING_DIMENSION is configured as ${this.dimension}.`);
        }
        try {
            const indexInfo = await this.pc.describeIndex(this.indexName);
            if (indexInfo.dimension !== this.dimension) {
                throw new Error(`Pinecone index '${this.indexName}' dimension is ${indexInfo.dimension}, which does not match EMBEDDING_DIMENSION (${this.dimension}).`);
            }
        }
        catch (err) {
            const msg = err.message;
            if (!msg.toLowerCase().includes('not found') && !msg.toLowerCase().includes('404')) {
                throw err;
            }
        }
    }
    async embedBatchWithRetry(batch, inputType) {
        let attempt = 0;
        let waitMs = 500;
        while (attempt < this.maxRetries) {
            try {
                const response = await this.pc.inference.embed({
                    model: this.model,
                    inputs: batch,
                    parameters: { inputType }
                });
                const vectors = [];
                for (const item of response.data) {
                    if (item.vectorType === 'dense' && 'values' in item && Array.isArray(item.values)) {
                        vectors.push(item.values);
                    }
                }
                const tokens = response.usage?.totalTokens ?? 0;
                return { vectors, tokens };
            }
            catch (err) {
                attempt++;
                if (attempt >= this.maxRetries) {
                    throw err;
                }
                await delay(waitMs);
                waitMs *= 2;
            }
        }
        throw new Error(`Failed to embed batch after ${this.maxRetries} attempts.`);
    }
    async embed(texts, inputType) {
        if (texts.length === 0) {
            return { embeddings: [], totalTokens: 0 };
        }
        const spec = getModelSpec(this.model);
        const { prepared, truncatedCount } = prepareInputTexts(texts, spec.maxTokens);
        if (truncatedCount > 0) {
            process.stdout.write(`[Embedding] Truncated ${truncatedCount} input(s) exceeding maximum token limit (${spec.maxTokens}) for model '${this.model}'.\n`);
        }
        const allVectors = [];
        let accumulatedTokens = 0;
        for (let i = 0; i < prepared.length; i += this.batchSize) {
            const chunk = prepared.slice(i, i + this.batchSize);
            const { vectors, tokens } = await this.embedBatchWithRetry(chunk, inputType);
            allVectors.push(...vectors);
            accumulatedTokens += tokens;
            if (i + this.batchSize < prepared.length && this.pacingDelayMs > 0) {
                await delay(this.pacingDelayMs);
            }
        }
        return {
            embeddings: allVectors,
            totalTokens: accumulatedTokens
        };
    }
}
//# sourceMappingURL=pinecone.js.map