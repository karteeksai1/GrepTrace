# GrepTrace

GrepTrace compares two code-question answering systems on the same repository questions:

- **Agentic search** uses sandboxed `grep`, `glob`, and `read` tools.
- **Vector RAG** retrieves code chunks from Pinecone before generating an answer.

Both systems use the same answer schema, citation requirements, Groq-compatible LLM interface, and evaluation pipeline. Runs, events, retrieval details, timing, token usage, cost, failures, pending states, recovered answers, and judge scores are persisted for replay and comparison.

## Requirements

- Node.js 20 or newer
- npm
- PostgreSQL/Neon for application data
- Groq API access
- Pinecone access for RAG ingestion and retrieval

Install dependencies:

```bash
npm install
```

## Configuration

Copy the example environment file and set credentials locally:

```bash
cp .env.example .env
```

Never commit `.env` or print its contents.

### LLM and evaluation

- `LLM_API_KEY`: Groq API key.
- `LLM_PROVIDER`: provider selector; use `groq`.
- `LLM_MODEL`: answering model, for example `openai/gpt-oss-120b`.
- `GROQ_BASE_URL`: optional OpenAI-compatible Groq base URL.
- `JUDGE_MODEL`: blind evaluation model.
- `LLM_TPM_LIMIT`: preemptive tokens-per-minute limit; set to `0` to disable pacing.
- `LLM_MAX_RETRIES`: maximum retry count for recoverable tool-call failures.
- `LLM_RATE_LIMIT_MAX_WAIT_MS`: maximum cumulative wait for retryable rate limits.
- `EVAL_CONCURRENCY`: benchmark concurrency.
- `EVAL_REPETITIONS`: repetitions for each system/corpus/question combination.
- `EVAL_MIN_REQUEST_INTERVAL_MS`: minimum interval between LLM requests.

Daily token quota errors are not retried. The affected run remains pending, the batch stops cleanly, and rerunning the same batch name resumes pending work. Retry waits and proactive pacing waits are recorded separately.

### Embeddings and RAG

- `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, and `EMBEDDING_DIMENSION`: embedding configuration.
- `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `PINECONE_CLOUD`, `PINECONE_REGION`, and `PINECONE_METRIC`: Pinecone configuration.
- `PINECONE_NAMESPACE_EXPRESS` and `PINECONE_NAMESPACE_FASTAPI`: corpus namespaces.
- `RAG_TOP_K`: number of retrieved chunks.
- `CHUNK_MAX_TOKENS`: maximum estimated embedding input size. The default is `400`, below multilingual-e5-large's `512` token input limit.
- `CHUNK_OVERLAP_LINES`: line overlap between adjacent split chunks. The default is `5`.

Chunk token estimates include the file-path prefix exactly as embedded. Chunk IDs include the corpus, file, line range, and content hash, so changed chunk settings or source content produce stale IDs that can be removed with `--prune`.

### Database and API

- `DATABASE_URL`: pooled application database URL.
- `DATABASE_URL_DIRECT`: direct database URL reserved for migrations.
- `PORT`: API port.
- `CORS_ORIGIN`: API CORS origin.

## Database setup

Run migrations only with `DATABASE_URL_DIRECT`:

```bash
npm run migrate
```

The database stores batches, runs, events, scores, chunks, and corpus-ingestion metadata. The RAG benchmark refuses to start when a corpus has no recorded ingestion or when its recorded commit/settings do not match the checked-out corpus and current configuration.

## Ingesting a corpus

Dry-run is read-only: it chunks the checkout, reads existing chunk IDs, and reports chunks to ingest, stale chunks, estimated embedding tokens, token distribution, and over-limit inputs.

```bash
npm run ingest -- --corpus express --dry-run
```

Run a real ingestion only after reviewing the dry-run:

```bash
npm run ingest -- --corpus express
```

Remove stale database rows and Pinecone vectors explicitly:

```bash
npm run ingest -- --corpus express --prune --yes
```

Verify source ranges, current chunk IDs, vector counts, corpus commit, embedding model, and chunk settings:

```bash
npm run ingest -- --corpus express --verify
```

Repeat the commands with `--corpus fastapi` for the FastAPI checkout. Do not edit files under `corpora/` or `data/questions/`.

## Running individual systems

Agentic search:

```bash
npm run run-agentic -- --corpus express --question-id exp-001 --model openai/gpt-oss-120b
```

Vector RAG:

```bash
npm run run-rag -- --corpus express --question-id exp-001 --model openai/gpt-oss-120b
```

The agent is instructed to finish with `submit_answer`. Invalid submissions use the existing repair path, while recoverable failed generations are recorded as recovered answers rather than retried blindly.

## Running a benchmark

Run both systems with one answering model and one blind judge model:

```bash
JUDGE_MODEL=qwen/qwen3.8-27b npm run bench -- \
  --systems agentic,rag \
  --corpus express \
  --model openai/gpt-oss-120b \
  --repetitions 1 \
  --batch-name express_full_v1
```

If a batch stops because of a daily quota, rerun the same command with the same batch name. Completed runs are retained and pending runs resume.

Generate the report:

```bash
npm run report -- --batch express_full_v1 --format table
```

The report includes successful, failed, and pending runs separately, along with failure reasons, recovered-answer counts, retry waits, pacing waits, token usage, cost, latency, active latency, retrieval metrics, and scores. Report generation also writes a failures file to `docs/benchmarks/`.

## Web application

Start the API and web application in separate terminals:

```bash
npm run api
npm run web
```

The web application includes the question list, batch comparison, run replay, and dashboard routes. Open the dashboard with a batch query:

```text
/dashboard?batch=express_full_v1
```

The replay view exposes the run timeline, tool or retrieval activity, answer citations, failure details, pacing and rate-limit waits, and accumulated usage.

## Development checks

```bash
npm run build
npm test
```

The root build runs the TypeScript check. The test suite uses Vitest with fake LLM, embedding, database, Pinecone, and clock implementations where external services are not required. Local API tests may require permission to bind a loopback port.

## Scope and limitations

Results are measurements on the checked-in corpora and question sets under the selected model, embedding configuration, retrieval configuration, and judge configuration. They do not establish that either approach is generally better. The judge is itself an LLM, so judge outputs should be interpreted together with the traces, citations, retrieval evidence, and failure report.

Known project work includes completing the dashboard experience and applying the forward database migration that removes the legacy PostgreSQL vector storage after its SQL has been reviewed and approved. Existing migrations are not edited.
