import { createLLMClient } from '@greptrace/core';
async function main() {
    const client = createLLMClient();
    process.stdout.write(`Active LLM Model: ${client.getDefaultModel()}\n`);
    const response = await client.chat({
        messages: [
            { role: 'system', content: 'You are a concise code assistant.' },
            { role: 'user', content: 'Reply with the word GrepTrace.' }
        ],
        maxTokens: 50
    });
    process.stdout.write(`Response text: ${response.text.trim()}\n`);
    process.stdout.write(`Total tokens: ${response.usage.totalTokens}\n`);
    process.stdout.write(`Cost USD: $${response.costUsd}\n`);
}
main().catch((err) => {
    process.stderr.write(`LLM test failed: ${err.message}\n`);
    process.exit(1);
});
//# sourceMappingURL=test-llm.js.map