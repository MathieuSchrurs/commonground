import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_FETCH_TIMEOUT_MS } from './http';
import type { fetchWithTimeout as FetchWithTimeout } from './http';
import { IsochroneResponse } from '@/types/geo';

// mapbox.ts throws at import time if MAPBOX_SECRET_TOKEN is unset, so the env
// var must be stubbed *before* the module is evaluated. A static top-level
// `import './mapbox'` gets hoisted above any `vi.stubEnv` call in this file,
// so we stub the env first and then dynamically `import()` mapbox.ts (and
// the mocked ./http) inside `beforeAll`, after the stub has taken effect.
//
// The ./http mock passes through to the real fetchWithTimeout by default: the
// caching tests stub the global fetch underneath it, while the timeout test
// overrides the mock's response to assert the call shape.
vi.mock('./http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./http')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(
      async (...args: Parameters<typeof actual.fetchWithTimeout>) =>
        actual.fetchWithTimeout(...args)
    ),
  };
});

let getIsochrone: typeof import('./mapbox').getIsochrone;
let fetchWithTimeout: typeof FetchWithTimeout & ReturnType<typeof vi.fn>;

function isochroneBody(): IsochroneResponse {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[3.7, 51.0], [3.8, 51.0], [3.8, 51.1], [3.7, 51.0]]] },
        properties: {},
      },
    ],
  };
}

beforeAll(async () => {
  // The Mapbox SDK parses the token client-side and rejects anything that
  // isn't `<usage>.<base64 JSON payload>`, so a plain string like
  // 'test-token' throws "Invalid token" at construction time. This is a
  // syntactically valid (but fake, non-secret) token shape only.
  vi.stubEnv('MAPBOX_SECRET_TOKEN', 'pk.eyJ1IjoidGVzdCJ9');
  ({ getIsochrone } = await import('./mapbox'));
  ({ fetchWithTimeout } = (await import('./http')) as unknown as {
    fetchWithTimeout: typeof FetchWithTimeout & ReturnType<typeof vi.fn>;
  });
});

describe('getIsochrone', () => {
  it('fetches through fetchWithTimeout using the API timeout budget', async () => {
    const okResponse = new Response(
      JSON.stringify({ type: 'FeatureCollection', features: [] }),
      { status: 200 }
    );
    // mockImplementationOnce, not mockResolvedValue: the passthrough
    // implementation set in the factory must survive this test, because the
    // caching tests below reset modules but not mock state, and a stale
    // resolved Response here would fail with "Body has already been read".
    fetchWithTimeout.mockImplementationOnce(async () => okResponse);
    // getIsochrone should route through fetchWithTimeout, not the global
    // fetch, so stub the global too — this way, if it still reaches for raw
    // fetch, the test fails on the assertion below (fetchWithTimeout never
    // called) rather than on a real network error, which would depend on
    // the sandbox having outbound network access at all.
    const globalFetch = vi.spyOn(global, 'fetch').mockResolvedValue(okResponse);

    await getIsochrone({ lat: 51.05, lng: 3.72, minutes: 15, mode: 'driving' });

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(fetchWithTimeout.mock.calls[0][2]).toBe(API_FETCH_TIMEOUT_MS);

    globalFetch.mockRestore();
  });
});

describe('getIsochrone caching', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    process.env.MAPBOX_SECRET_TOKEN = 'pk.eyJ1IjoidGVzdCJ9';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => isochroneBody(),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('coalesces identical requests into a single fetch, refetches on a distinct key, and refetches after TTL expiry', async () => {
    const { getIsochrone } = await import('./mapbox');

    const params = { lat: 51.0, lng: 3.7, minutes: 10, mode: 'driving' as const };

    await getIsochrone(params);
    await getIsochrone(params);
    expect(fetch).toHaveBeenCalledTimes(1);

    await getIsochrone({ ...params, mode: 'cycling' });
    expect(fetch).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(11 * 60 * 1000);

    await getIsochrone(params);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
