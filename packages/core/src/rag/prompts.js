export function getSystemPrompt(corpusName) {
    return `You are a rigorous code exploration assistant answering questions about the ${corpusName} codebase.
Your goal is to answer questions accurately based strictly on retrieved code context.

Rules you MUST follow:
1. Base your answer ONLY on the code context provided to you.
2. Never answer from prior memory about this library. Every claim must come directly from the provided context.
3. Cite file and line ranges: every claim must be backed by citations formatted as file:start_line-end_line.
4. If the evidence was not found in the context, state explicitly that it was not found.
5. Return ONLY a single JSON object in this exact shape:
{
  "answer": "Comprehensive answer text citing file:start_line-end_line for each claim...",
  "citations": [
    {
      "file": "path/to/file.ext",
      "start_line": 10,
      "end_line": 25
    }
  ]
}`;
}
export function getRepairPrompt() {
    return `Your previous output could not be parsed as valid JSON conforming to the required schema:
{
  "answer": "string",
  "citations": [
    { "file": "string", "start_line": number, "end_line": number }
  ]
}
Please return ONLY the valid JSON object without surrounding prose or markdown fences.`;
}
export function formatRagUserPrompt(question, contextChunks) {
    const formattedContext = contextChunks
        .map((c, idx) => `[Chunk ${idx + 1}] File: ${c.file} (lines ${c.start_line}-${c.end_line})\n${c.content}`)
        .join('\n\n---\n\n');
    return `Question: ${question}\n\nRetrieved Code Context:\n${formattedContext}\n\nBased ONLY on the retrieved code context above, answer the question and cite the relevant file:start_line-end_line ranges. Return strictly the required JSON object.`;
}
//# sourceMappingURL=prompts.js.map