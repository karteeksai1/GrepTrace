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

  it('classifies transient server and non-retryable errors', async () => {
    const transientFetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"error":{"message":"busy"}}', { status: 503 }))
      .mockResolvedValueOnce(successResponse());
    const transientClient = new OpenAIClient({ baseUrl: 'https://groq.test', maxRetries: 1 });
    const transientResponse = await transientClient.chat({ messages: [{ role: 'user', content: 'hello' }] });
    expect(transientFetch).toHaveBeenCalledTimes(2);
    expect(transientResponse.failedAttempts?.[0]?.reason).toBe('transient_server');
    transientFetch.mockRestore();

    const otherFetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"error":{"message":"unauthorized"}}', { status: 401 }));
    const otherClient = new OpenAIClient({ baseUrl: 'https://groq.test', maxRetries: 3 });
    const error = await otherClient.chat({ messages: [{ role: 'user', content: 'hello' }] }).catch((value) => value as LLMRequestError);
    expect(otherFetch).toHaveBeenCalledTimes(1);
    expect(error.failedAttempts[0].reason).toBe('other_error');
    otherFetch.mockRestore();
  });

  it('keeps retrying rate limits beyond the tool retry budget', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('limited', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response('limited', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response('limited', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(successResponse());
    const client = new OpenAIClient({ baseUrl: 'https://groq.test', maxRetries: 0 });
    const response = await client.chat({ messages: [{ role: 'user', content: 'hello' }] });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(response.rateLimitCount).toBe(3);
    fetchMock.mockRestore();
  });

  it('stops at the rate limit wait cap with a clear reason', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('limited', { status: 429, headers: { 'retry-after': '1' } }));
    const client = new OpenAIClient({ baseUrl: 'https://groq.test', rateLimitMaxWaitMs: 10 });
    const error = await client.chat({ messages: [{ role: 'user', content: 'hello' }] }).catch((value) => value as LLMRequestError);
    expect(error.message).toContain('rate_limit_wait_cap_exceeded');
    expect(error.waitTimeMs).toBe(10);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });

  it('honors retry-after and calls the shared pacer for every request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('limited', { status: 429, headers: { 'retry-after': '0.001' } }))
      .mockResolvedValueOnce(successResponse());
    const waitForSlot = vi.fn().mockResolvedValue(undefined);
    const client = new OpenAIClient({ baseUrl: 'https://groq.test', requestPacer: { waitForSlot } });
    const response = await client.chat({ messages: [{ role: 'user', content: 'hello' }] });
    expect(response.waitTimeMs).toBe(1);
    expect(waitForSlot).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });

  it('recovers a final answer from failed_generation without retrying', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      error: {
        code: 'tool_use_failed',
        failed_generation: 'json({"answer":"Recovered","citations":[]})'
      }
    }), { status: 400 }));
    const client = new OpenAIClient({ baseUrl: 'https://groq.test', maxRetries: 3 });

    const response = await client.chat({ messages: [{ role: 'user', content: 'hello' }], tools: [{ name: 'grep', description: 'search', parameters: { type: 'object', properties: {} } }] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.recoveredAnswer).toEqual({ answer: 'Recovered', citations: [] });
    fetchMock.mockRestore();
  });

  it('does not retry a daily token quota error', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('tokens per day (TPD) limit reached', { status: 429 }));
    const client = new OpenAIClient({ baseUrl: 'https://groq.test', maxRetries: 3 });

    const error = await client.chat({ messages: [{ role: 'user', content: 'hello' }] }).catch((value) => value as LLMRequestError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error.lastErrorClass).toBe('daily_quota_exhausted');
    expect(error.failureReason).toBe('daily_quota_exhausted');
    fetchMock.mockRestore();
  });
});
