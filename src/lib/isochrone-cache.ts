import { getServiceRoleClient } from './supabase';
import { IsochroneResponse } from '@/types/geo';

// Isochrones are deterministic per (lat, lng, minutes, mode) — the same
// constraint always yields the same polygon — so they are cached
// indefinitely, keyed on the rounded constraint. The table is app-wide
// derived data with no owner: it is read and written only by server code via
// the service-role client, and RLS (enabled with no policies) denies every
// client role outright. See its migration for the full rationale.

/**
 * Look up a cached isochrone by its constraint key. Returns null on a miss —
 * and, deliberately, on any database error: the cache is best-effort and must
 * never be the thing that breaks an isochrone request.
 */
export async function readIsochroneFromCache(key: string): Promise<IsochroneResponse | null> {
  try {
    const db = getServiceRoleClient();
    // The service client is created without generated database types, so the
    // row shape comes back as never — the same cast-as-you-go posture the
    // cron route and the scraper use.
    const { data, error } = (await db
      .from('isochrone_cache')
      .select('isochrone')
      .eq('cache_key', key)
      .maybeSingle()) as {
      data: { isochrone: IsochroneResponse } | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(`isochrone_cache read error: ${error.message}`);
    return data?.isochrone ?? null;
  } catch (error) {
    console.error('[isochrone-cache] read failed (serving from source instead):', error);
    return null;
  }
}

/**
 * Persist an isochrone under its constraint key. Resolves even when the
 * database errors — a failed cache write must not fail the fetch that
 * produced the isochrone; the next request will simply fetch from Mapbox
 * again.
 */
export async function writeIsochroneToCache(
  key: string,
  isochrone: IsochroneResponse
): Promise<void> {
  try {
    const db = getServiceRoleClient();
    const { error } = (await db
      .from('isochrone_cache')
      .upsert(
        { cache_key: key, isochrone } as never,
        { onConflict: 'cache_key' }
      )) as { error: { message: string } | null };
    if (error) throw new Error(`isochrone_cache write error: ${error.message}`);
  } catch (error) {
    console.error('[isochrone-cache] write failed (cache stays cold for this key):', error);
  }
}
