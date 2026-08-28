import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout } from './http';

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('aborts the request once the timeout elapses', async () => {
    const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchWithTimeout('https://example.com', {}, 5000);
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });

    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it('resolves with the response when fetch completes before the timeout', async () => {
    const response = new Response('ok', { status: 200 });
    const fetchMock = vi.fn(() => Promise.resolve(response));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWithTimeout('https://example.com', {}, 5000);

    expect(result).toBe(response);
    expect(vi.getTimerCount()).toBe(0);
  });
});
