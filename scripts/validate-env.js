import { validateEnv } from '@greptrace/core';
try {
    const env = validateEnv();
    process.stdout.write(`Environment validation passed successfully.\n`);
    process.stdout.write(`- LLM Provider: ${env.LLM_PROVIDER} (${env.LLM_MODEL})\n`);
    process.stdout.write(`- Embedding Provider: ${env.EMBEDDING_PROVIDER} (${env.EMBEDDING_MODEL}, dim: ${env.EMBEDDING_DIMENSION})\n`);
    process.stdout.write(`- Pinecone Index: ${env.PINECONE_INDEX_NAME} (${env.PINECONE_CLOUD}/${env.PINECONE_REGION}, metric: ${env.PINECONE_METRIC})\n`);
    process.stdout.write(`- Pinecone Namespaces: ${env.PINECONE_NAMESPACE_EXPRESS}, ${env.PINECONE_NAMESPACE_FASTAPI}\n`);
    process.stdout.write(`- RAG Top K: ${env.RAG_TOP_K}\n`);
}
catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
}
//# sourceMappingURL=validate-env.js.map