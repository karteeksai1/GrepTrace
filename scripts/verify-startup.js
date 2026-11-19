import { createEmbeddingClient } from '@greptrace/core';
async function main() {
    const client = createEmbeddingClient();
    process.stdout.write(`Running startup verification...\n`);
    await client.verifyStartup();
    process.stdout.write(`Startup verification passed: returned vector length equals EMBEDDING_DIMENSION (1024) and matches Pinecone index 'greptrace' (Ready, 1024, cosine).\n`);
}
main().catch((err) => {
    process.stderr.write(`Startup verification failed: ${err.message}\n`);
    process.exit(1);
});
//# sourceMappingURL=verify-startup.js.map