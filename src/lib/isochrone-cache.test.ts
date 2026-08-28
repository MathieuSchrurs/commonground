import { beforeEach, describe, expect, it, vi } from 'vitest';

// Records every chained call (method name + args) made against the Supabase
// query builder, so tests can assert on the exact query shape without a real
// database. Every chain method returns the same builder ("this"); the builder
// is also thenable so `await supabase.from(...)...` resolves the same way the
// real PostgREST client does.
interface RecordedCall {
  method: string;
  args: unknown[];
}

let calls: RecordedCall[];
let resolved: { data: unknown; error: { message: string } | null };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => {
      calls.push({ method: 'from', args });
      const chainMethods = ['select', 'eq', 'limit', 'maybeSingle'];
      let upsertPayload: unknown = null;
      const builder: Record<string, unknown> = {
        upsert: (payload: unknown) => {
          calls.push({ method: 'upsert', args: [payload] });
          upsertPayload = payload;
          return builder;
        },
        then: (resolve: (v: unknown) => void) => {
          if (upsertPayload !== null) {
            resolve({ data: upsertPayload, error: resolved.error });
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
  resolved = { data: null, error: null };
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
});

// Imported after the env stubs (getClient() reads them lazily at call time).
import { readIsochroneFromCache, writeIsochroneToCache } from './isochrone-cache';
import { IsochroneResponse } from '@/types/geo';

const BODY: IsochroneResponse = { type: 'FeatureCollection', features: [] };

describe('readIsochroneFromCache', () => {
  it('looks the key up on isochrone_cache and returns the stored payload', async () => {
    resolved = { data: { isochrone: BODY }, error: null };

    const result = await readIsochroneFromCache('51.05:3.72:15:driving');

    expect(result).toEqual(BODY);
    expect(calls).toContainEqual({ method: 'from', args: ['isochrone_cache'] });
    expect(calls).toContainEqual({ method: 'eq', args: ['cache_key', '51.05:3.72:15:driving'] });
  });

  it('returns null on a miss', async () => {
    resolved = { data: null, error: null };

    await expect(readIsochroneFromCache('51.05:3.72:15:driving')).resolves.toBeNull();
  });

  it('returns null (not a throw) when the database errors — the cache is best-effort', async () => {
    resolved = { data: null, error: { message: 'connection refused' } };

    await expect(readIsochroneFromCache('51.05:3.72:15:driving')).resolves.toBeNull();
  });
});

describe('writeIsochroneToCache', () => {
  it('upserts the payload keyed on cache_key', async () => {
    await writeIsochroneToCache('51.05:3.72:15:driving', BODY);

    expect(calls).toContainEqual({ method: 'from', args: ['isochrone_cache'] });
    expect(calls).toContainEqual({
      method: 'upsert',
      args: [{ cache_key: '51.05:3.72:15:driving', isochrone: BODY }],
    });
    expect(calls).toContainEqual({ method: 'upsert', args: [expect.anything()] });
  });

  it('resolves even when the database errors — a failed cache write must not fail the fetch', async () => {
    resolved = { data: null, error: { message: 'connection refused' } };

    await expect(
      writeIsochroneToCache('51.05:3.72:15:driving', BODY)
    ).resolves.toBeUndefined();
  });
});
