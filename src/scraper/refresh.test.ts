import { describe, expect, it, vi } from 'vitest';
import { purgeStaleListings, resolveLocations } from './refresh';
import { PropertyListing } from './types';
import { KnownLocation } from './db';

function listing(overrides: Partial<PropertyListing> = {}): PropertyListing {
  return {
    source: 'immoweb',
    external_id: 'a',
    url: 'https://example.com',
    ...overrides,
  };
}

describe('resolveLocations', () => {
  it('skips the known-location lookup for listings that already have coordinates', async () => {
    const withCoords = listing({ source: 'immoweb', external_id: 'has-coords', latitude: 50.8, longitude: 4.35 });
    const withoutCoords = listing({ source: 'zimmo', external_id: 'no-coords' });

    const fetchKnown = vi.fn(async (listings: PropertyListing[]) => {
      void listings;
      return new Map<string, KnownLocation>();
    });
    const geocode = vi.fn(async () => null);

    await resolveLocations([withCoords, withoutCoords], { fetchKnown, geocode });

    expect(fetchKnown).toHaveBeenCalledTimes(1);
    const calledWith = fetchKnown.mock.calls[0][0];
    expect(calledWith).toHaveLength(1);
    expect(calledWith).toEqual([withoutCoords]);
  });

  it('memoizes geocoding by query string within a single run', async () => {
    const first = listing({ source: 'immoweb', external_id: 'first', address: 'Rue de la Loi 1' });
    const second = listing({ source: 'zimmo', external_id: 'second', address: 'Rue de la Loi 1' });

    const fetchKnown = vi.fn(async () => new Map<string, KnownLocation>());
    const geocode = vi.fn(async () => ({ latitude: 1, longitude: 2, precision: 'exact' as const }));

    const result = await resolveLocations([first, second], { fetchKnown, geocode });

    expect(geocode).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    for (const l of result) {
      expect(l.latitude).toBe(1);
      expect(l.longitude).toBe(2);
    }
  });
});

describe('purgeStaleListings', () => {
  it('runs the per-source deletes concurrently, not one after another', async () => {
    const windows: { start: number; end: number }[] = [];
    const deleteFn = vi.fn(async () => {
      const start = Date.now();
      await new Promise((r) => setTimeout(r, 20));
      windows.push({ start, end: Date.now() });
    });

    const sources = [
      { name: 'realo', listings: [listing()], blocked: false },
      { name: 'zimmo', listings: [listing()], blocked: false },
    ];

    await purgeStaleListings(
      sources,
      { minLng: 4.3, minLat: 50.8, maxLng: 4.4, maxLat: 50.9 },
      '2026-08-01T00:00:00.000Z',
      deleteFn
    );

    expect(deleteFn).toHaveBeenCalledTimes(2);
    expect(windows).toHaveLength(2);
    const [a, b] = windows;
    const overlap = a.start < b.end && b.start < a.end;
    expect(overlap).toBe(true);
  });

  it('skips sources with no listings or that were blocked', async () => {
    const deleteFn = vi.fn(async () => {});

    const sources = [
      { name: 'realo', listings: [], blocked: false },
      { name: 'zimmo', listings: [listing()], blocked: true },
      { name: 'immoweb', listings: [listing()], blocked: false },
    ];

    await purgeStaleListings(
      sources,
      { minLng: 4.3, minLat: 50.8, maxLng: 4.4, maxLat: 50.9 },
      '2026-08-01T00:00:00.000Z',
      deleteFn
    );

    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(deleteFn).toHaveBeenCalledWith('immoweb', 4.3, 50.8, 4.4, 50.9, '2026-08-01T00:00:00.000Z');
  });
});
