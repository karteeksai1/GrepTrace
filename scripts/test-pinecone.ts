import { Pinecone } from '@pinecone-database/pinecone';
import { createEmbeddingClient, validateEnv } from '@greptrace/core';

async function main(): Promise<void> {
  const env = validateEnv();
  const client = createEmbeddingClient();

  process.stdout.write(`Testing Pinecone hosted inference embedding with model '${env.EMBEDDING_MODEL}'...\n`);
  const res = await client.embed(['Express application initialization test'], 'query');
  process.stdout.write(`- Returned vectors: ${res.embeddings.length}\n`);
  process.stdout.write(`- Vector dimension: ${res.embeddings[0].length}\n`);
  process.stdout.write(`- Tokens reported: ${res.totalTokens}\n`);

  process.stdout.write(`\nChecking Pinecone index '${env.PINECONE_INDEX_NAME}'...\n`);
  const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY });
  const indexList = await pc.listIndexes();
  const indexNames = indexList.indexes?.map((i) => i.name) ?? [];
  process.stdout.write(`- Found indexes in account: ${indexNames.join(', ') || 'none'}\n`);

  const exists = indexNames.includes(env.PINECONE_INDEX_NAME);
  if (exists) {
    const desc = await pc.describeIndex(env.PINECONE_INDEX_NAME);
    process.stdout.write(`- Index '${env.PINECONE_INDEX_NAME}' exists. Dimension: ${desc.dimension}, Metric: ${desc.metric}, Status: ${desc.status.state}\n`);
  } else {
    process.stdout.write(`- Index '${env.PINECONE_INDEX_NAME}' does not exist yet.\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`Pinecone test failed: ${err.message}\n`);
  process.exit(1);
});
