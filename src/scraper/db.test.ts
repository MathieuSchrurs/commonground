import { describe, expect, it, vi } from 'vitest';
import { PropertyListing } from './types';

const base: PropertyListing = {
  source: 'realo',
  external_id: '1',
  url: 'https://example.com/1',
};

const mockUpsert = vi.hoisted(() => vi.fn());

// Fakes PostgREST's hard cap of 1000 rows per response: a `.select()` after
// `.upsert()` never returns more than 1000 rows, no matter how many rows were
// written in that call. This is the behaviour that makes an unbounded
// upsert-then-select silently drop ids for rows past the 1000th.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      // Existing-price lookup (source/external_id/price/...) — no rows on
      // file, so every incoming listing is treated as a first sighting.
      select: () => ({
        eq: () => ({
          in: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
      upsert: (rows: PropertyListing[]) => {
        mockUpsert(rows);
        return {
          select: () =>
            Promise.resolve({
              data: rows.slice(0, 1000).map((r) => ({ ...r, id: `${r.source}:${r.external_id}` })),
              error: null,
            }),
        };
      },
    }),
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Imported after the mock and env stubs above (vi.mock is hoisted above this
// import by vitest; getClient() reads the env vars lazily, at call time, not
// at import time, so setting them here is enough).
import { roundIntegerFields, upsertListings } from './db';

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

describe('upsertListings', () => {
  it('returns an id for every listing in a batch larger than the 1000-row PostgREST cap', async () => {
    mockUpsert.mockClear();
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

    // Proves chunking actually happened rather than the fake magically
    // returning enough rows from a single oversized call.
    expect(mockUpsert.mock.calls.length).toBeGreaterThan(1);
  });
});
