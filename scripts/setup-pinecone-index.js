import { Pinecone } from '@pinecone-database/pinecone';
import { validateEnv } from '@greptrace/core';
async function main() {
    const env = validateEnv();
    const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY });
    process.stdout.write(`Checking Pinecone index '${env.PINECONE_INDEX_NAME}'...\n`);
    const list = await pc.listIndexes();
    const existing = list.indexes?.find((i) => i.name === env.PINECONE_INDEX_NAME);
    if (existing) {
        process.stdout.write(`Index '${env.PINECONE_INDEX_NAME}' already exists (dimension: ${existing.dimension}, metric: ${existing.metric}).\n`);
        return;
    }
    process.stdout.write(`Creating serverless index '${env.PINECONE_INDEX_NAME}' in ${env.PINECONE_CLOUD}/${env.PINECONE_REGION} with dimension ${env.EMBEDDING_DIMENSION} (${env.PINECONE_METRIC})...\n`);
    await pc.createIndex({
        name: env.PINECONE_INDEX_NAME,
        dimension: env.EMBEDDING_DIMENSION,
        metric: env.PINECONE_METRIC,
        spec: {
            serverless: {
                cloud: env.PINECONE_CLOUD,
                region: env.PINECONE_REGION
            }
        }
    });
    process.stdout.write(`Index '${env.PINECONE_INDEX_NAME}' created successfully.\n`);
}
main().catch((err) => {
    process.stderr.write(`Failed to setup Pinecone index: ${err.message}\n`);
    process.exit(1);
});
//# sourceMappingURL=setup-pinecone-index.js.map