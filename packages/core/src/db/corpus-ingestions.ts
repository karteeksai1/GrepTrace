import pg from 'pg';

export interface CorpusIngestionRecord {
  corpus: string;
  commit_hash: string;
  pinecone_namespace: string;
  embedding_model: string | null;
  chunk_max_tokens: number | null;
  chunk_overlap_lines: number | null;
  chunk_count: number | null;
  ingested_at: Date;
}

export async function getCorpusIngestion(
  pool: pg.Pool,
  corpus: string
): Promise<CorpusIngestionRecord | null> {
  const result = await pool.query('SELECT * FROM corpus_ingestions WHERE corpus = $1', [corpus]);
  return result.rows[0] ?? null;
}

export async function recordCorpusIngestion(
  pool: pg.Pool,
  record: Omit<CorpusIngestionRecord, 'ingested_at'>
): Promise<void> {
  await pool.query(
    `
      INSERT INTO corpus_ingestions (
        corpus, commit_hash, pinecone_namespace, embedding_model,
        chunk_max_tokens, chunk_overlap_lines, chunk_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (corpus) DO UPDATE SET
        commit_hash = EXCLUDED.commit_hash,
        pinecone_namespace = EXCLUDED.pinecone_namespace,
        embedding_model = EXCLUDED.embedding_model,
        chunk_max_tokens = EXCLUDED.chunk_max_tokens,
        chunk_overlap_lines = EXCLUDED.chunk_overlap_lines,
        chunk_count = EXCLUDED.chunk_count,
        ingested_at = NOW()
    `,
    [
      record.corpus,
      record.commit_hash,
      record.pinecone_namespace,
      record.embedding_model,
      record.chunk_max_tokens,
      record.chunk_overlap_lines,
      record.chunk_count
    ]
  );
}
