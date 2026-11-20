# GrepTrace

## Environment

Copy `.env.example` to `.env` and set the credentials and endpoints for the local run.

- `LLM_API_KEY`: Groq API key.
- `LLM_PROVIDER`: must be `groq`.
- `LLM_MODEL`: Groq model ID, such as `openai/gpt-oss-120b`.
- `GROQ_BASE_URL`: optional Groq OpenAI-compatible API base URL.
- `LLM_TPM_LIMIT`: preemptive tokens-per-minute pacing limit; set to `0` to disable it.
- `LLM_MAX_RETRIES`: maximum tool-call-failure retries.
- `LLM_RATE_LIMIT_MAX_WAIT_MS`: maximum cumulative wait for retryable rate limits.
- `JUDGE_MODEL`: blind judge model ID.
- `EVAL_CONCURRENCY`: benchmark concurrency.
- `EVAL_REPETITIONS`: benchmark repetitions.
- `EVAL_MIN_REQUEST_INTERVAL_MS`: minimum interval between LLM requests.
- `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, and `EMBEDDING_DIMENSION`: embedding configuration.
- `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `PINECONE_CLOUD`, `PINECONE_REGION`, and `PINECONE_METRIC`: Pinecone connection and index configuration.
- `PINECONE_NAMESPACE_EXPRESS` and `PINECONE_NAMESPACE_FASTAPI`: corpus namespaces.
- `RAG_TOP_K`: number of retrieved chunks.
- `CHUNK_MAX_TOKENS`: maximum estimated embedding input size; the default 400 leaves room under multilingual-e5-large's 512-token limit.
- `CHUNK_OVERLAP_LINES`: lines shared between adjacent split chunks; the default is 5.
- `DATABASE_URL`: pooled application database URL.
- `DATABASE_URL_DIRECT`: direct migration database URL.
- `PORT`: API server port.
- `CORS_ORIGIN`: API CORS origin.

Benchmark LLM requests are paced globally across both systems and judging calls. Set `EVAL_MIN_REQUEST_INTERVAL_MS` to the minimum interval between requests; the default is `1500` ms.
