import { describe, expect, it } from 'vitest';
import { validateEnv } from '@greptrace/core';
describe('Environment Variable Validation', () => {
    const validMockEnv = {
        GROQ_API_KEY: 'gsk_mock_groq_key',
        LLM_PROVIDER: 'groq',
        LLM_MODEL: 'openai/gpt-oss-120b',
        EMBEDDING_PROVIDER: 'pinecone',
        EMBEDDING_MODEL: 'multilingual-e5-large',
        EMBEDDING_DIMENSION: '1024',
        PINECONE_API_KEY: 'pcsk_mock_key',
        PINECONE_INDEX_NAME: 'greptrace',
        PINECONE_CLOUD: 'aws',
        PINECONE_REGION: 'us-east-1',
        PINECONE_METRIC: 'cosine',
        PINECONE_NAMESPACE_EXPRESS: 'express',
        PINECONE_NAMESPACE_FASTAPI: 'fastapi',
        RAG_TOP_K: '8',
        DATABASE_URL: 'postgresql://neondb_owner:pass@ep-pooler.aws.neon.tech/neondb?sslmode=require',
        DATABASE_URL_DIRECT: 'postgresql://neondb_owner:pass@ep-direct.aws.neon.tech/neondb?sslmode=require'
    };
    it('validates a complete and correct environment config', () => {
        const config = validateEnv(validMockEnv);
        expect(config.LLM_PROVIDER).toBe('groq');
        expect(config.EMBEDDING_PROVIDER).toBe('pinecone');
        expect(config.EMBEDDING_DIMENSION).toBe(1024);
        expect(config.RAG_TOP_K).toBe(8);
    });
    it('fails with clear message when required variables are missing', () => {
        const invalidEnv = { ...validMockEnv };
        delete invalidEnv.PINECONE_API_KEY;
        delete invalidEnv.EMBEDDING_MODEL;
        expect(() => validateEnv(invalidEnv)).toThrowError(/PINECONE_API_KEY/);
        expect(() => validateEnv(invalidEnv)).toThrowError(/EMBEDDING_MODEL/);
    });
    it('fails when LLM_PROVIDER is not groq or EMBEDDING_PROVIDER is not pinecone', () => {
        const badProviderEnv = {
            ...validMockEnv,
            LLM_PROVIDER: 'unknown',
            EMBEDDING_PROVIDER: 'openai'
        };
        expect(() => validateEnv(badProviderEnv)).toThrowError(/LLM_PROVIDER must be "groq"/);
        expect(() => validateEnv(badProviderEnv)).toThrowError(/EMBEDDING_PROVIDER must be "pinecone"/);
    });
    it('fails when PINECONE_METRIC is not a supported metric', () => {
        const badMetricEnv = {
            ...validMockEnv,
            PINECONE_METRIC: 'manhattan'
        };
        expect(() => validateEnv(badMetricEnv)).toThrowError(/PINECONE_METRIC must be cosine, euclidean, or dotproduct/);
    });
    it('defaults RAG_TOP_K to 8 when omitted', () => {
        const withoutTopK = { ...validMockEnv };
        delete withoutTopK.RAG_TOP_K;
        const config = validateEnv(withoutTopK);
        expect(config.RAG_TOP_K).toBe(8);
    });
});
//# sourceMappingURL=env-validation.test.js.map