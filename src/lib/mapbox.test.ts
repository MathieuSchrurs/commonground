import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_FETCH_TIMEOUT_MS } from './http';
import type { fetchWithTimeout as FetchWithTimeout } from './http';
import { readIsochroneFromCache, writeIsochroneToCache } from './isochrone-cache';
import { IsochroneResponse } from '@/types/geo';

// The database-backed isochrone cache is faked per-test: the DB-hit test
// resolves a body from it, the Mapbox-path tests let it miss so the fetch
// proceeds, and the persistence test asserts the write.
vi.mock('./isochrone-cache', () => ({
  readIsochroneFromCache: vi.fn(async () => null),
  writeIsochroneToCache: vi.fn(async () => undefined),
}));

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
      JSON.stringify({
        type: 'FeatureCollection',
        // One real feature — an empty FeatureCollection now (correctly)
        // rejects, and this test asserts on the fetch wiring, not on that.
        features: [isochroneBody().features[0]],
      }),
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
    // resetModules does not clear mock call history, and the isochrone-cache
    // mock is file-scoped — start each test with a clean ledger.
    vi.mocked(readIsochroneFromCache).mockClear();
    vi.mocked(writeIsochroneToCache).mockClear();
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

  it('serves a database-cached isochrone without calling Mapbox, then keeps it in memory', async () => {
    const { getIsochrone } = await import('./mapbox');

    const params = { lat: 51.0, lng: 3.7, minutes: 10, mode: 'driving' as const };
    vi.mocked(readIsochroneFromCache).mockResolvedValueOnce(isochroneBody());

    await expect(getIsochrone(params)).resolves.toEqual(isochroneBody());
    expect(fetch).not.toHaveBeenCalled();

    // The second request is served from the in-memory layer, so the database
    // is read exactly once for the same constraint.
    await getIsochrone(params);
    expect(readIsochroneFromCache).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('persists a Mapbox fetch to the database under the rounded constraint key', async () => {
    const { getIsochrone } = await import('./mapbox');

    const body = await getIsochrone({ lat: 51.0, lng: 3.7, minutes: 10, mode: 'driving' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(writeIsochroneToCache).toHaveBeenCalledWith('51:3.7:10:driving', body);
  });

  it('coalesces concurrent cold callers into one database read and one Mapbox fetch', async () => {
    const { getIsochrone } = await import('./mapbox');

    const params = { lat: 51.0, lng: 3.7, minutes: 10, mode: 'driving' as const };

    // Hold the database read open until every caller has arrived: if the
    // in-flight promise were registered only after the read resolved (the
    // regression shape), each caller would read the database — and fetch —
    // for itself.
    let release!: () => void;
    const heldRead = new Promise<null>((resolve) => { release = () => resolve(null); });
    vi.mocked(readIsochroneFromCache).mockImplementationOnce(() => heldRead);

    const first = getIsochrone(params);
    const second = getIsochrone(params);
    const third = getIsochrone(params);
    release();

    await Promise.all([first, second, third]);

    expect(readIsochroneFromCache).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('treats a corrupt database row (no features) as a miss and refetches over it', async () => {
    const { getIsochrone } = await import('./mapbox');

    const params = { lat: 51.0, lng: 3.7, minutes: 10, mode: 'driving' as const };
    vi.mocked(readIsochroneFromCache).mockResolvedValueOnce({
      type: 'FeatureCollection',
      features: [],
    });

    const body = await getIsochrone(params);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body).toEqual(isochroneBody());
    // The refetch overwrites the corrupt row.
    expect(writeIsochroneToCache).toHaveBeenCalledWith('51:3.7:10:driving', body);
  });

  it('rejects and persists nothing when Mapbox returns no features', async () => {
    const { getIsochrone } = await import('./mapbox');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) }))
    );

    await expect(
      getIsochrone({ lat: 51.0, lng: 3.7, minutes: 10, mode: 'driving' })
    ).rejects.toThrow('no features');
    expect(writeIsochroneToCache).not.toHaveBeenCalled();

    // The rejection must not poison the key: a retry goes back to Mapbox.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => isochroneBody() }))
    );
    await expect(
      getIsochrone({ lat: 51.0, lng: 3.7, minutes: 10, mode: 'driving' })
    ).resolves.toEqual(isochroneBody());
  });
});
