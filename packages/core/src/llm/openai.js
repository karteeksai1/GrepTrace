import { calculateCost } from './pricing.js';
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class OpenAIClient {
    apiKey;
    baseUrl;
    defaultModel;
    maxRetries;
    constructor(options = {}) {
        this.apiKey = options.apiKey ?? process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.GROQ_API_KEY ?? '';
        this.baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
        this.defaultModel = options.defaultModel ?? process.env.LLM_MODEL ?? 'gpt-4o-mini';
        this.maxRetries = options.maxRetries ?? 3;
    }
    getDefaultModel() {
        return this.defaultModel;
    }
    formatMessage(msg) {
        if (msg.role === 'tool') {
            return {
                role: 'tool',
                tool_call_id: msg.tool_call_id,
                content: msg.content ?? ''
            };
        }
        if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
            return {
                role: 'assistant',
                content: msg.content ?? null,
                tool_calls: msg.tool_calls.map((c) => ({
                    id: c.id,
                    type: 'function',
                    function: {
                        name: c.name,
                        arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments)
                    }
                }))
            };
        }
        return {
            role: msg.role,
            content: msg.content ?? ''
        };
    }
    parseToolCalls(rawCalls) {
        if (!rawCalls || !Array.isArray(rawCalls)) {
            return [];
        }
        return rawCalls.map((rc) => {
            let args = {};
            try {
                args = JSON.parse(rc.function.arguments || '{}');
            }
            catch {
                args = { raw: rc.function.arguments };
            }
            return {
                id: rc.id,
                name: rc.function.name,
                arguments: args
            };
        });
    }
    extractRetryDelayMs(response, errorText) {
        const retryHeader = response.headers.get('retry-after');
        if (retryHeader) {
            const parsedSeconds = parseFloat(retryHeader);
            if (!isNaN(parsedSeconds)) {
                return Math.ceil(parsedSeconds * 1000);
            }
        }
        const match = errorText.match(/try again in ([0-9.]+)s/i);
        if (match && match[1]) {
            const seconds = parseFloat(match[1]);
            if (!isNaN(seconds)) {
                return Math.ceil(seconds * 1000) + 500;
            }
        }
        return 3000;
    }
    async chat(request) {
        const model = request.model || this.defaultModel;
        const body = {
            model,
            messages: request.messages.map((m) => this.formatMessage(m)),
            temperature: request.temperature ?? 0,
            max_tokens: request.maxTokens ?? 2048
        };
        if (request.tools && request.tools.length > 0) {
            body.tools = request.tools.map((t) => ({
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters
                }
            }));
        }
        let attempt = 0;
        while (attempt <= this.maxRetries) {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(body)
            });
            if (response.status === 429 && attempt < this.maxRetries) {
                attempt++;
                const errorText = await response.text();
                const waitMs = this.extractRetryDelayMs(response, errorText);
                await delay(waitMs);
                continue;
            }
            if (!response.ok) {
                const errorText = await response.text();
                try {
                    const errObj = JSON.parse(errorText);
                    const fg = errObj?.error?.failed_generation;
                    if (fg && typeof fg === 'string') {
                        try {
                            const parsedTool = JSON.parse(fg);
                            if (parsedTool?.name) {
                                return {
                                    text: '',
                                    toolCalls: [
                                        {
                                            id: `call_${Date.now()}`,
                                            name: parsedTool.name,
                                            arguments: parsedTool.arguments ?? {}
                                        }
                                    ],
                                    usage: { promptTokens: 300, completionTokens: 50, totalTokens: 350 },
                                    costUsd: calculateCost(model, 300, 50)
                                };
                            }
                        }
                        catch {
                        }
                        return {
                            text: fg,
                            usage: { promptTokens: 300, completionTokens: 50, totalTokens: 350 },
                            costUsd: calculateCost(model, 300, 50)
                        };
                    }
                }
                catch {
                }
                throw new Error(`LLM API error (${response.status}): ${errorText}`);
            }
            const data = await response.json();
            const message = data.choices?.[0]?.message;
            const text = message?.content ?? '';
            const toolCalls = this.parseToolCalls(message?.tool_calls);
            const promptTokens = data.usage?.prompt_tokens ?? 0;
            const completionTokens = data.usage?.completion_tokens ?? 0;
            const totalTokens = data.usage?.total_tokens ?? (promptTokens + completionTokens);
            return {
                text,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                usage: {
                    promptTokens,
                    completionTokens,
                    totalTokens
                },
                costUsd: calculateCost(model, promptTokens, completionTokens)
            };
        }
        throw new Error('LLM request failed after retries.');
    }
}
//# sourceMappingURL=openai.js.map