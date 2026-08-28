import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchNewListingsInBbox, hasFreshListingsInBbox, roundIntegerFields } from './db';
import { PropertyListing } from './types';

const base: PropertyListing = {
  source: 'realo',
  external_id: '1',
  url: 'https://example.com/1',
};

// Records every chained call (method name + args) made against the Supabase
// query builder, so tests can assert on the exact query shape without a real
// database. Every chain method returns the same builder ("this"); the
// builder is also thenable so `await supabase.from(...)...` resolves the
// same way the real PostgREST client does.
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
      const chainMethods = ['select', 'eq', 'gte', 'lte', 'limit', 'not', 'order', 'range', 'in'];
      const builder: Record<string, unknown> = {
        then: (resolve: (v: unknown) => void) => resolve(resolved),
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
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321');
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
