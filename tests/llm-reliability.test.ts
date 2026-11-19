import { describe, expect, it, vi } from 'vitest';
import { LLMRequestError, OpenAIClient } from '@greptrace/core';

function successResponse() {
  return new Response(JSON.stringify({
    choices: [{ message: { content: '{"answer":"ok","citations":[]}' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('LLM attempt measurement', () => {
  it('retries rate limits and reports wait metadata', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"error":{"message":"rate limited"}}', {
        status: 429,
        headers: { 'retry-after': '0' }
      }))
      .mockResolvedValueOnce(successResponse());

    const client = new OpenAIClient({ baseUrl: 'https://groq.test', maxRetries: 1 });
    const response = await client.chat({ messages: [{ role: 'user', content: 'hello' }] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.attempts).toBe(2);
    expect(response.rateLimitCount).toBe(1);
    expect(response.waitTimeMs).toBe(0);
    expect(response.failedAttempts?.[0]?.reason).toBe('rate_limited');
    fetchMock.mockRestore();
  });

  it('retries malformed tool calls with the identical request and never fabricates a tool call', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"error":{"code":"tool_use_failed"}}', { status: 400 }))
      .mockResolvedValueOnce(new Response('{"error":{"code":"tool_use_failed"}}', { status: 400 }))
      .mockResolvedValueOnce(successResponse());

    const client = new OpenAIClient({ baseUrl: 'https://groq.test', maxRetries: 2 });
    const request = {
      messages: [{ role: 'user' as const, content: 'hello' }],
      tools: [{ name: 'grep', description: 'search', parameters: { type: 'object' as const, properties: {} } }]
    };
    const response = await client.chat(request);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(response.toolCalls).toBeUndefined();
    expect(response.toolCallFailureCount).toBe(2);
    expect(response.failedAttempts?.map((failure) => failure.reason)).toEqual(['tool_call_failed', 'tool_call_failed']);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(secondBody).toEqual(firstBody);
    fetchMock.mockRestore();
  });

  it('stops after the configured retry limit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('{"error":{"code":"tool_use_failed"}}', { status: 400 }));
    const client = new OpenAIClient({ baseUrl: 'https://groq.test', maxRetries: 2 });

    await expect(client.chat({ messages: [{ role: 'user', content: 'hello' }] }))
      .rejects.toBeInstanceOf(LLMRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mockRestore();
  });
});
