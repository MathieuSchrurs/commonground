import { describe, expect, it, vi } from 'vitest';
import { resolveLocations } from './refresh';
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
