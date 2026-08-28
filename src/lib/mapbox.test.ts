import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IsochroneResponse } from '@/types/geo';

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
