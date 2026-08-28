import { beforeAll, describe, expect, it, vi } from 'vitest';
import { API_FETCH_TIMEOUT_MS } from './http';
import type { fetchWithTimeout as FetchWithTimeout } from './http';

// mapbox.ts throws at import time if MAPBOX_SECRET_TOKEN is unset, so the env
// var must be stubbed *before* the module is evaluated. A static top-level
// `import './mapbox'` gets hoisted above any `vi.stubEnv` call in this file,
// so we stub the env first and then dynamically `import()` mapbox.ts (and
// the mocked ./http) inside `beforeAll`, after the stub has taken effect.
vi.mock('./http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./http')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

let getIsochrone: typeof import('./mapbox').getIsochrone;
let fetchWithTimeout: typeof FetchWithTimeout & ReturnType<typeof vi.fn>;

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
    fetchWithTimeout.mockResolvedValue(okResponse);
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
