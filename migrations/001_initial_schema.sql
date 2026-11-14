CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY,
  system VARCHAR(64) NOT NULL,
  corpus VARCHAR(64) NOT NULL,
  question_id VARCHAR(128) NOT NULL,
  model VARCHAR(128) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL,
  final_answer TEXT,
  total_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC(10, 6) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  type VARCHAR(64) NOT NULL,
  tool VARCHAR(64),
  args JSONB,
  result_summary TEXT,
  result_bytes INTEGER,
  files_touched TEXT[],
  tokens INTEGER DEFAULT 0,
  elapsed_ms INTEGER DEFAULT 0,
  db_time_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
CREATE INDEX IF NOT EXISTS idx_runs_corpus ON runs(corpus);
CREATE INDEX IF NOT EXISTS idx_runs_system ON runs(system);
