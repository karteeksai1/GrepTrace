import fs from 'node:fs/promises';
import path from 'node:path';
import { createEmbeddingClient, createPool, getAppDatabaseUrl, validateEnv, warmUpDatabase } from '@greptrace/core';
import { ingestCorpus } from './ingest/ingest.js';
function parseArgs(args) {
    const result = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--corpus' && args[i + 1]) {
            result.corpus = args[++i];
        }
    }
    return result;
}
export async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.corpus) {
        process.stderr.write('Error: --corpus <express|fastapi> is required.\n');
        process.exit(1);
    }
    const env = validateEnv();
    const rootDir = process.cwd();
    const rawConfig = await fs.readFile(path.join(rootDir, 'config', 'corpora.json'), 'utf8');
    const config = JSON.parse(rawConfig);
    const spec = config.corpora[args.corpus];
    if (!spec) {
        process.stderr.write(`Error: unknown corpus '${args.corpus}'.\n`);
        process.exit(1);
    }
    const corpusRoot = path.resolve(rootDir, spec.path);
    const pool = createPool(getAppDatabaseUrl(), 2);
    try {
        await warmUpDatabase(pool);
        const embeddingClient = createEmbeddingClient();
        await embeddingClient.verifyStartup();
        const namespace = args.corpus === 'express'
            ? env.PINECONE_NAMESPACE_EXPRESS
            : env.PINECONE_NAMESPACE_FASTAPI;
        process.stdout.write(`Starting ingestion for corpus: ${args.corpus}\n`);
        process.stdout.write(`Pinecone Index: ${env.PINECONE_INDEX_NAME}, Namespace: ${namespace}\n\n`);
        const summary = await ingestCorpus({
            corpus: args.corpus,
            corpusRoot,
            pool,
            embeddingClient,
            pineconeApiKey: env.PINECONE_API_KEY,
            pineconeIndexName: env.PINECONE_INDEX_NAME,
            pineconeNamespace: namespace,
            batchSize: 32
        });
        process.stdout.write(`\n=== Ingestion Complete ===\n`);
        process.stdout.write(`Corpus: ${summary.corpus}\n`);
        process.stdout.write(`Total chunks: ${summary.totalChunks}\n`);
        process.stdout.write(`Newly ingested: ${summary.ingestedChunks}\n`);
        process.stdout.write(`Tokens used: ${summary.totalTokens}\n`);
    }
    finally {
        await pool.end();
    }
}
if (process.argv[1]?.endsWith('ingest-cli.ts') || process.argv[1]?.endsWith('ingest-cli.js')) {
    main().catch((err) => {
        process.stderr.write(`Ingestion failed: ${err.message}\n`);
        process.exit(1);
    });
}
//# sourceMappingURL=ingest-cli.js.map