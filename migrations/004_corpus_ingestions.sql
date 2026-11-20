CREATE TABLE IF NOT EXISTS corpus_ingestions (
  corpus VARCHAR(64) PRIMARY KEY,
  commit_hash VARCHAR(64) NOT NULL,
  pinecone_namespace VARCHAR(255) NOT NULL,
  embedding_model VARCHAR(255),
  chunk_max_tokens INTEGER,
  chunk_overlap_lines INTEGER,
  chunk_count INTEGER,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
