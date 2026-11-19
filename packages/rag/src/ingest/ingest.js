import { Pinecone } from '@pinecone-database/pinecone';
import { scanAndChunkCorpus } from './scanner.js';
function formatChunkForEmbedding(chunk) {
    return `File: ${chunk.file} (lines ${chunk.start_line}-${chunk.end_line})\n${chunk.content}`;
}
async function getExistingChunkIds(pool, corpus) {
    const result = await pool.query('SELECT id FROM chunks WHERE corpus = $1', [corpus]);
    return new Set(result.rows.map((r) => r.id));
}
async function insertChunksToPostgres(pool, batch, embeddings) {
    if (batch.length === 0) {
        return;
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const query = `
      INSERT INTO chunks (id, corpus, file, start_line, end_line, content, tokens, embedding)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING;
    `;
        for (let i = 0; i < batch.length; i++) {
            const c = batch[i];
            const emb = embeddings[i];
            const vectorLiteral = `[${emb.join(',')}]`;
            const values = [c.id, c.corpus, c.file, c.start_line, c.end_line, c.content, c.tokens ?? 0, vectorLiteral];
            await client.query(query, values);
        }
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
export async function ingestCorpus(options) {
    const allChunks = await scanAndChunkCorpus(options.corpus, options.corpusRoot);
    const existingIds = await getExistingChunkIds(options.pool, options.corpus);
    const newChunks = allChunks.filter((c) => !existingIds.has(c.id));
    process.stdout.write(`Corpus '${options.corpus}': ${allChunks.length} total chunks, ${existingIds.size} already in database, ${newChunks.length} to ingest.\n`);
    if (newChunks.length === 0) {
        return {
            corpus: options.corpus,
            totalChunks: allChunks.length,
            newChunks: 0,
            ingestedChunks: 0,
            totalTokens: 0
        };
    }
    const pc = new Pinecone({ apiKey: options.pineconeApiKey });
    const index = pc.index(options.pineconeIndexName).namespace(options.pineconeNamespace);
    const batchSize = Math.max(1, options.batchSize ?? 32);
    let accumulatedTokens = 0;
    let ingestedCount = 0;
    for (let i = 0; i < newChunks.length; i += batchSize) {
        const batch = newChunks.slice(i, i + batchSize);
        const texts = batch.map(formatChunkForEmbedding);
        const embedRes = await options.embeddingClient.embed(texts, 'passage');
        accumulatedTokens += embedRes.totalTokens ?? 0;
        await insertChunksToPostgres(options.pool, batch, embedRes.embeddings);
        const pineconeRecords = batch.map((c, idx) => ({
            id: c.id,
            values: embedRes.embeddings[idx],
            metadata: {
                file: c.file,
                start_line: c.start_line,
                end_line: c.end_line,
                text: c.content.slice(0, 1000)
            }
        }));
        await index.upsert({ records: pineconeRecords });
        ingestedCount += batch.length;
        process.stdout.write(`Progress: ${ingestedCount} / ${newChunks.length} chunks ingested...\n`);
    }
    return {
        corpus: options.corpus,
        totalChunks: allChunks.length,
        newChunks: newChunks.length,
        ingestedChunks: ingestedCount,
        totalTokens: accumulatedTokens
    };
}
//# sourceMappingURL=ingest.js.map