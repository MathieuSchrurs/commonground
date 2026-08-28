import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchListingsInBbox,
  fetchListingsInPolygon,
  fetchNewListingsInBbox,
  hasFreshListingsInBbox,
  roundIntegerFields,
  upsertListings,
} from './db';
import { PropertyListing } from './types';

const base: PropertyListing = {
  source: 'realo',
  external_id: '1',
  url: 'https://example.com/1',
};

// Records every chained call (method name + args) made against the Supabase
// query builder, so tests can assert on the exact query shape without a real
// database. Every chain method returns the same builder ("this"); the builder
// is also thenable so `await supabase.from(...)...` resolves the same way the
// real PostgREST client does.
//
// A builder that has had .upsert(rows) called on it resolves the way
// PostgREST's `.upsert().select()` echo would: the upserted rows mapped back
// with DB ids — capped at 1000 rows, the PostgREST response cap that makes an
// unbounded upsert-then-select silently drop ids past it (and why
// upsertListings chunks).
interface RecordedCall {
  method: string;
  args: unknown[];
}

let calls: RecordedCall[];
let resolved: { data: unknown[]; error: null };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => {
      calls.push({ method: 'from', args });
      const chainMethods = ['select', 'eq', 'gte', 'lte', 'limit', 'not', 'order', 'range', 'in', 'insert', 'delete'];
      let upserted: Array<{ source: string; external_id: string }> | null = null;
      const builder: Record<string, unknown> = {
        upsert: (rows: Array<{ source: string; external_id: string }>) => {
          calls.push({ method: 'upsert', args: [rows] });
          upserted = rows;
          return builder;
        },
        then: (resolve: (v: unknown) => void) => {
          if (upserted !== null) {
            resolve({
              data: upserted
                .slice(0, 1000)
                .map((r) => ({ ...r, id: `${r.source}:${r.external_id}` })),
              error: null,
            });
          } else {
            resolve(resolved);
          }
        },
      };
      for (const method of chainMethods) {
        builder[method] = (...methodArgs: unknown[]) => {
          calls.push({ method, args: methodArgs });
          return builder;
        };
      }
      return builder;
    },
  }),
}));

beforeEach(() => {
  calls = [];
  resolved = { data: [], error: null };
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
});

describe('roundIntegerFields', () => {
  it('rounds fractional prices to integers (BIGINT-safe)', () => {
    const out = roundIntegerFields({ ...base, price: 415580.07 });
    expect(out.price).toBe(415580);
  });

  it('rounds bedrooms, surface_area and land_area', () => {
    const out = roundIntegerFields({
      ...base,
      bedrooms: 3.0,
      surface_area: 120.4,
      land_area: 250.6,
    });
    expect(out.bedrooms).toBe(3);
    expect(out.surface_area).toBe(120);
    expect(out.land_area).toBe(251);
  });

  it('leaves undefined fields untouched', () => {
    const out = roundIntegerFields({ ...base });
    expect(out.price).toBeUndefined();
    expect(out.bedrooms).toBeUndefined();
  });

  it('does not mutate the original listing', () => {
    const input = { ...base, price: 99.9 };
    roundIntegerFields(input);
    expect(input.price).toBe(99.9);
  });
});

describe('hasFreshListingsInBbox', () => {
  it('asks only for id, capped at one row, filtered by scraped_at >= cutoff', async () => {
    const cutoff = '2026-08-01T00:00:00.000Z';
    await hasFreshListingsInBbox(4.3, 50.8, 4.4, 50.9, cutoff);

    expect(calls).toContainEqual({ method: 'from', args: ['property_listings'] });
    expect(calls).toContainEqual({ method: 'select', args: ['id'] });
    expect(calls).toContainEqual({ method: 'limit', args: [1] });
    expect(calls).toContainEqual({ method: 'gte', args: ['scraped_at', cutoff] });
  });

  it('returns true when a row comes back, false when none does', async () => {
    resolved = { data: [{ id: 'abc' }], error: null };
    await expect(hasFreshListingsInBbox(4.3, 50.8, 4.4, 50.9, '2026-08-01T00:00:00.000Z')).resolves.toBe(true);

    resolved = { data: [], error: null };
    await expect(hasFreshListingsInBbox(4.3, 50.8, 4.4, 50.9, '2026-08-01T00:00:00.000Z')).resolves.toBe(false);
  });
});

describe('fetchNewListingsInBbox', () => {
  it('asks only for id/latitude/longitude, filtered by first_seen_at >= since', async () => {
    const since = '2026-08-01T00:00:00.000Z';
    await fetchNewListingsInBbox(4.3, 50.8, 4.4, 50.9, since);

    expect(calls).toContainEqual({ method: 'from', args: ['property_listings'] });
    expect(calls).toContainEqual({ method: 'select', args: ['id, latitude, longitude'] });
    expect(calls).toContainEqual({ method: 'gte', args: ['first_seen_at', since] });
  });
});

describe('fetchListingsInBbox', () => {
  it('selects only the columns the map displays, never *', async () => {
    await fetchListingsInBbox(4.3, 50.8, 4.4, 50.9);

    const select = calls.find((c) => c.method === 'select');
    expect(select?.args[0]).not.toBe('*');
    // The freshness column is server-only bookkeeping — the map payload
    // should never pay for it.
    expect(select?.args[0]).not.toContain('scraped_at');
    // Everything the client renders or filters on must still be there.
    for (const column of [
      'id', 'source', 'external_id', 'url', 'title', 'address', 'city',
      'postal_code', 'latitude', 'longitude', 'price', 'previous_price',
      'price_changed_at', 'property_type', 'bedrooms', 'surface_area',
      'land_area', 'image_url', 'first_seen_at', 'location_precision',
    ]) {
      expect(select?.args[0]).toContain(column);
    }
  });

  it('pages with range windows ordered by id', async () => {
    await fetchListingsInBbox(4.3, 50.8, 4.4, 50.9);

    expect(calls).toContainEqual({ method: 'order', args: ['id', { ascending: true }] });
    expect(calls).toContainEqual({ method: 'range', args: [0, 999] });
  });
});

describe('fetchListingsInPolygon', () => {
  const square: import('geojson').Feature<import('geojson').Polygon> = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[[4.35, 50.83], [4.38, 50.83], [4.38, 50.86], [4.35, 50.86], [4.35, 50.83]]],
    },
  };

  const inside = (n: number): PropertyListing => ({
    source: 'realo',
    external_id: `in-${n}`,
    url: `https://example.com/in-${n}`,
    latitude: 50.84,
    longitude: 4.36,
  });

  it('keeps only listings inside the polygon and reports dedupe stats', async () => {
    resolved = {
      data: [inside(1), inside(2), { ...inside(3), latitude: 51.0, longitude: 4.9 }],
      error: null,
    };

    const { listings, stats } = await fetchListingsInPolygon(square);

    expect(listings.map((l) => l.external_id)).toEqual(['in-1', 'in-2']);
    expect(stats).toEqual({ bboxListings: 3, insidePolygon: 2, mergedDuplicates: 0 });
  });

  it('drops rows without coordinates before testing the polygon', async () => {
    resolved = {
      data: [inside(1), { source: 'zimmo', external_id: 'no-coords', url: 'https://example.com/x' }],
      error: null,
    };

    const { listings, stats } = await fetchListingsInPolygon(square);

    expect(listings.map((l) => l.external_id)).toEqual(['in-1']);
    expect(stats).toEqual({ bboxListings: 2, insidePolygon: 1, mergedDuplicates: 0 });
  });

  it('collapses exact (source, external_id) duplicates', async () => {
    resolved = { data: [inside(1), inside(1)], error: null };

    const { listings, stats } = await fetchListingsInPolygon(square);

    expect(listings).toHaveLength(1);
    expect(stats).toEqual({ bboxListings: 2, insidePolygon: 1, mergedDuplicates: 0 });
  });
});

describe('upsertListings', () => {
  it('returns an id for every listing in a batch larger than the 1000-row PostgREST cap', async () => {
    const listings: PropertyListing[] = Array.from({ length: 1200 }, (_, i) => ({
      source: 'realo',
      external_id: `ext-${i}`,
      url: `https://example.com/${i}`,
    }));

    const result = await upsertListings(listings);

    const returnedKeys = new Set(result.map((r) => `${r.source}:${r.external_id}`));
    for (const l of listings) {
      expect(returnedKeys.has(`${l.source}:${l.external_id}`)).toBe(true);
    }

    // Proves chunking actually happened rather than one oversized call
    // satisfying every id.
    expect(calls.filter((c) => c.method === 'upsert').length).toBeGreaterThan(1);
  });
});
