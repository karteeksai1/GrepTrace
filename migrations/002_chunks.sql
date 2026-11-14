CREATE TABLE IF NOT EXISTS chunks (
  id VARCHAR(128) PRIMARY KEY,
  corpus VARCHAR(64) NOT NULL,
  file TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  content TEXT NOT NULL,
  tokens INTEGER DEFAULT 0,
  embedding vector(1024),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_corpus ON chunks(corpus);
CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file);
