import { Pinecone } from '@pinecone-database/pinecone';
export async function retrieveChunks(pineconeApiKey, indexName, namespace, embeddingClient, question, topK = 8) {
    const totalStart = Date.now();
    const embedRes = await embeddingClient.embed([question], 'query');
    const queryVector = embedRes.embeddings[0];
    const pc = new Pinecone({ apiKey: pineconeApiKey });
    const index = pc.index(indexName).namespace(namespace);
    const dbStart = Date.now();
    const queryResponse = await index.query({
        vector: queryVector,
        topK,
        includeMetadata: true
    });
    const dbTimeMs = Date.now() - dbStart;
    const totalRetrievalMs = Date.now() - totalStart;
    const chunks = [];
    for (const match of queryResponse.matches || []) {
        const meta = match.metadata;
        if (meta) {
            chunks.push({
                id: match.id,
                corpus: namespace,
                file: String(meta.file ?? ''),
                start_line: Number(meta.start_line ?? 1),
                end_line: Number(meta.end_line ?? 1),
                content: String(meta.text ?? '')
            });
        }
    }
    return {
        chunks,
        dbTimeMs,
        totalRetrievalMs,
        tokensUsed: embedRes.totalTokens ?? 0
    };
}
//# sourceMappingURL=retriever.js.map