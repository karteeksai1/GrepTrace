CREATE TABLE IF NOT EXISTS batches (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  config JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_batches_name ON batches(name);

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS repetition INTEGER;

CREATE INDEX IF NOT EXISTS idx_runs_batch_id ON runs(batch_id);

CREATE TABLE IF NOT EXISTS scores (
  id UUID PRIMARY KEY,
  run_id UUID UNIQUE NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  retrieval_hit_any BOOLEAN NOT NULL,
  retrieval_hit_all BOOLEAN NOT NULL,
  retrieval_recall DOUBLE PRECISION NOT NULL,
  citation_correct BOOLEAN NOT NULL,
  answer_score DOUBLE PRECISION NOT NULL,
  judge_verdict TEXT NOT NULL,
  judge_reason TEXT NOT NULL,
  judge_model TEXT NOT NULL,
  judge_tokens INTEGER NOT NULL,
  judge_cost_usd NUMERIC(10, 6),
  scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scores_run_id ON scores(run_id);
