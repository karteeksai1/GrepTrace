import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  LLM_API_KEY: z.string().min(1, 'LLM_API_KEY is required'),
  LLM_PROVIDER: z.literal('groq', {
    errorMap: () => ({ message: 'LLM_PROVIDER must be "groq"' })
  }),
  LLM_MODEL: z.string().min(1, 'LLM_MODEL is required'),
  JUDGE_MODEL: z.string().default('qwen/qwen3.8-27b'),
  EVAL_CONCURRENCY: z.coerce.number().int().positive().default(1),
  EVAL_REPETITIONS: z.coerce.number().int().positive().default(1),
  EVAL_MIN_REQUEST_INTERVAL_MS: z.coerce.number().int().min(0).default(1500),
  LLM_TPM_LIMIT: z.coerce.number().int().min(0).default(8000),
  EMBEDDING_PROVIDER: z.literal('pinecone', {
    errorMap: () => ({ message: 'EMBEDDING_PROVIDER must be "pinecone"' })
  }),
  EMBEDDING_MODEL: z.string().min(1, 'EMBEDDING_MODEL is required'),
  EMBEDDING_DIMENSION: z.coerce.number().int().positive('EMBEDDING_DIMENSION must be a positive integer'),
  PINECONE_API_KEY: z.string().min(1, 'PINECONE_API_KEY is required'),
  PINECONE_INDEX_NAME: z.string().min(1, 'PINECONE_INDEX_NAME is required'),
  PINECONE_CLOUD: z.string().min(1, 'PINECONE_CLOUD is required'),
  PINECONE_REGION: z.string().min(1, 'PINECONE_REGION is required'),
  PINECONE_METRIC: z.enum(['cosine', 'euclidean', 'dotproduct'], {
    errorMap: () => ({ message: 'PINECONE_METRIC must be cosine, euclidean, or dotproduct' })
  }),
  PINECONE_NAMESPACE_EXPRESS: z.string().min(1, 'PINECONE_NAMESPACE_EXPRESS is required'),
  PINECONE_NAMESPACE_FASTAPI: z.string().min(1, 'PINECONE_NAMESPACE_FASTAPI is required'),
  RAG_TOP_K: z.coerce.number().int().positive().default(8),
  CHUNK_MAX_TOKENS: z.coerce.number().int().positive().default(400),
  CHUNK_OVERLAP_LINES: z.coerce.number().int().min(0).default(5),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_URL_DIRECT: z.string().min(1, 'DATABASE_URL_DIRECT is required')
});

export type EnvConfig = z.infer<typeof envSchema>;

export function getRawEnv(): Record<string, string | undefined> {
  return { ...process.env };
}

export function validateEnv(customEnv?: Record<string, string | undefined>): EnvConfig {
  const source = customEnv ?? getRawEnv();
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${errorDetails}`);
  }

  return result.data;
}
