# GrepTrace

## Project summary

GrepTrace benchmarks two repository-question answering systems: an agentic search loop using grep, glob, and read, and vector RAG using Pinecone retrieval. Both use the same answer format, citation requirements, and Groq LLM interface. Runs, tool/retrieval events, scores, timing, and cost are persisted so the visualizer can replay and compare retrieval behavior.

## Stack and decisions

- TypeScript and Node 20 in an npm-workspaces monorepo.
- Express API in `apps/api`; React, Vite, React Router, TanStack Query, Tailwind CSS, Recharts, and plain SVG in `apps/web`.
- PostgreSQL on Neon through `pg`; `DATABASE_URL` is pooled and `DATABASE_URL_DIRECT` is reserved for migrations.
- Pinecone is the vector store, with one namespace per corpus; embeddings use Pinecone hosted inference.
- Groq is the intended LLM provider. The judge is a separate model. Do not add provider adapters without explicit direction.
- ripgrep is sandboxed to a corpus directory for agentic search.
- Corpora and question ground truth are data inputs and must not be changed by UI work.

## Real folder layout

```text
apps/api/src/                 Express app, routes, question loading, errors
apps/web/src/                 React shell, pages, components, API client, replay utilities
packages/core/src/            config, shared types, DB, LLM, embeddings, logging, validation
packages/agentic/src/         agent loop, prompts/parser, sandboxed grep/glob/read tools
packages/rag/src/             chunking, ingestion, retrieval, RAG pipeline and CLIs
packages/eval/src/            benchmark runner, scoring, aggregation, reports, CLI
tests/                        Vitest unit, integration, and UI fixture tests
migrations/                   SQL migrations 001_initial_schema through 003_eval_schema
data/questions/               Express and FastAPI question files
config/                       Corpus configuration
corpora/                      Local corpus checkouts (do not edit)
docs/benchmarks/              Benchmark notes and sample data
scripts/                      Supporting command-line scripts
```

## Commands

- Install: `npm install`
- Tests: `npm test`
- Root TypeScript build/typecheck: `npm run build` (currently also traverses the web source and is not a clean web typecheck)
- Web typecheck/build: `npm --workspace=@greptrace/web run build`
- Lint: no `lint` script is currently defined in the root or package manifests.
- API development server: `npm run api` (port 3001)
- Web development server: `npm run web` (port 3000)
- Database migration: `npm run migrate` using `DATABASE_URL_DIRECT` only
- Database health: `npm run db:health`
- Run agentic: `npm run run-agentic`; run RAG: `npm run run-rag`
- Ingest vectors: `npm run ingest`; benchmark/score/report: `npm run bench`, `npm run score`, `npm run report`

## Data model in plain words

`batches` describes a benchmark configuration. Each `runs` row is one system/corpus/question execution and may belong to a batch. `events` is the ordered trace for a run: model turns, tool calls, retrieval, answers, summaries, touched files, tokens, elapsed time, and database time. `scores` stores retrieval, citation, and blind-judge answer metrics for one run. `chunks` stores corpus chunk text and bookkeeping; vectors are intended for Pinecone and the migration also declares a PostgreSQL vector column. `schema_migrations` records applied SQL migrations. Question JSON files contain IDs, question types, reference answers, and ground-truth file ranges.

The API exposes `/api/health`, batch listing/summary/questions, run detail/events, and bounded corpus-file reads. The web currently has the home question list, compare view, and an in-progress `/runs/:runId` replay route; `/dashboard` is still a placeholder.

## Conventions and rules

- Use small typed functions. Do not add comments in code files.
- Ask before adding a dependency.
- Never insert fake/demo rows into real tables; use test fixtures only and show proper UI empty states.
- Never print, log, or commit secrets. Keep `.env` gitignored.
- Never edit an applied migration. Add a forward migration and show its SQL before applying it to Neon; run migrations only with `DATABASE_URL_DIRECT`.
- Do not modify `corpora/` or question ground truth.
- Do not change runner, scoring, or schema behavior unless a missing field blocks the UI; explain why first.
- Keep the judge blind to system and model names. Both systems use the same model and answer prompt.
- Work one step at a time, stop after each step, show how to run it, and list assumptions.

## Current state and remaining work

Phases 1–4 are present locally. The compare view and much of the replay implementation are present, but replay files are uncommitted in the working tree even though the handoff described replay as not started. The dashboard route still renders a Step 5 placeholder. The next authorized step is to inspect/finish Step 4 replay only; then stop for review before Step 5.

Orientation verification on 2026-11-19: `npm install` completed. `npm test` ran 23 files and 102 tests: 93 passed, 9 skipped, with the API suite failing during setup because the sandbox rejected `listen(127.0.0.1)` with `EPERM`; 22 files passed. `npm run build` failed because the root config does not set JSX for web files and also reported existing type errors in judge/API/replay code. The web build's TypeScript phase passed, but Vite then encountered generated `apps/web/src/App.js` JSX and failed import analysis. No lint script exists.

The read-only Neon row-count check could not connect because the configured database hostname failed DNS resolution. Therefore no claim is made about whether a real pilot batch exists. Re-run the counts when connectivity is restored; do not create data as part of that check.

Known risks: the root build emits JavaScript/declaration artifacts into source locations; the local tree has inherited uncommitted replay work; the README contains only the title; and migration 001 declares the PostgreSQL `vector` extension/column even though the project decision says Pinecone is the vector store. The live LLM adapter is `packages/core/src/llm/groq.ts` and uses Groq's OpenAI-compatible HTTP API.
