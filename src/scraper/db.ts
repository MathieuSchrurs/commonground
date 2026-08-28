import { createClient } from '@supabase/supabase-js';
import { PropertyListing } from './types';
import { annotatePriceChanges, ExistingPriceRow } from './price-changes';

// The scraper reads and writes the shared listing pool from server-side jobs
// (the daily cron and /api/scrape). It uses the service-role key so RLS can't
// hide rows or block upserts — there is no signed-in user in these contexts.
function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) for scraper DB access');
  }
  return createClient(url, key);
}

// price, bedrooms, surface_area and land_area are BIGINT columns. A source that
// parses a fractional value (e.g. Realo reading "€ 415.580,07" as 415580.07)
// would make Postgres reject the whole upsert batch ("invalid input syntax for
// type bigint"). Round these to integers defensively so one odd listing can't
// sink an entire crawl.
export function roundIntegerFields(l: PropertyListing): PropertyListing {
  const round = (v: number | undefined) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : v;
  return {
    ...l,
    price: round(l.price),
    bedrooms: round(l.bedrooms),
    surface_area: round(l.surface_area),
    land_area: round(l.land_area),
  };
}

// .in() filters go into the request URI; too many ids exceeds the server's
// URI length limit, so large key lookups must be chunked.
const IN_CHUNK_SIZE = 200;

// PostgREST caps a single response at 1000 rows (see fetchListingsInBbox
// below). An upsert's .select() echoes back one row per row written, so an
// unbounded upsert would silently lose ids — and the price_history entries
// keyed on them — for anything past the 1000th row in the batch.
const UPSERT_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Upsert a batch of listings into property_listings, recording price changes
 * along the way (previous_price on the row + an append-only price_history).
 * Conflict on (source, external_id) — updates existing rows.
 * Returns the full upserted rows (including DB-generated IDs).
 */
export async function upsertListings(listings: PropertyListing[]): Promise<PropertyListing[]> {
  if (listings.length === 0) return [];

  // Postgres rejects an upsert batch where two rows share the conflict key,
  // so collapse duplicates on (source, external_id) — last occurrence wins.
  const deduped = Array.from(
    new Map(listings.map((l) => [`${l.source}:${l.external_id}`, roundIntegerFields(l)])).values()
  );

  const supabase = getClient();

  // Fetch current prices for this batch so we can detect changes
  const bySource = new Map<string, string[]>();
  for (const l of deduped) {
    const ids = bySource.get(l.source) ?? [];
    ids.push(l.external_id);
    bySource.set(l.source, ids);
  }
  const existing: ExistingPriceRow[] = [];
  for (const [source, externalIds] of bySource) {
    for (const ids of chunk(externalIds, IN_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from('property_listings')
        .select('id, source, external_id, price, previous_price, price_changed_at')
        .eq('source', source)
        .in('external_id', ids);
      if (error) throw new Error(`Supabase price lookup error: ${error.message}`);
      existing.push(...((data ?? []) as ExistingPriceRow[]));
    }
  }

  const { upserts, history } = annotatePriceChanges(deduped, existing);

  const rows: PropertyListing[] = [];
  for (const batch of chunk(upserts, UPSERT_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('property_listings')
      .upsert(batch, { onConflict: 'source,external_id' })
      .select();

    if (error) throw new Error(`Supabase upsert error: ${error.message}`);
    rows.push(...((data ?? []) as PropertyListing[]));
  }

  // Append the price series — history keys resolve to DB ids via the upsert result
  if (history.length > 0) {
    const idByKey = new Map(rows.map(r => [`${r.source}:${r.external_id}`, r.id]));
    const entries = history
      .map(h => ({ listing_id: idByKey.get(h.key), price: h.price }))
      .filter((e): e is { listing_id: string; price: number } => !!e.listing_id);
    if (entries.length > 0) {
      const { error: histError } = await supabase.from('price_history').insert(entries);
      // Non-fatal: losing a history point must not fail the scrape
      if (histError) console.error(`[db] price_history insert failed: ${histError.message}`);
    }
  }

  return rows;
}

export interface KnownLocation {
  latitude: number;
  longitude: number;
  location_precision: 'exact' | 'approximate' | null;
}

/**
 * Fetch already-stored coordinates for a batch of (source, external_id) keys,
 * so a refresh doesn't re-geocode listings it has located before.
 */
export async function fetchKnownLocations(
  listings: PropertyListing[]
): Promise<Map<string, KnownLocation>> {
  const known = new Map<string, KnownLocation>();
  if (listings.length === 0) return known;

  const supabase = getClient();
  const bySource = new Map<string, string[]>();
  for (const l of listings) {
    const ids = bySource.get(l.source) ?? [];
    ids.push(l.external_id);
    bySource.set(l.source, ids);
  }

  for (const [source, externalIds] of bySource) {
    for (const ids of chunk(externalIds, IN_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from('property_listings')
        .select('source, external_id, latitude, longitude, location_precision')
        .eq('source', source)
        .in('external_id', ids)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      if (error) throw new Error(`Supabase location lookup error: ${error.message}`);
      for (const row of (data ?? []) as Array<{ source: string; external_id: string } & KnownLocation>) {
        known.set(`${row.source}:${row.external_id}`, {
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          location_precision: row.location_precision,
        });
      }
    }
  }

  return known;
}

/**
 * Delete listings for a given source within a bounding box whose scraped_at
 * is older than the given cutoff. The caller chooses the cutoff — refresh.ts
 * passes "one week ago" so listings merely absent from the newest-first pages
 * of a single scrape aren't mistaken for sold ones.
 */
export async function deleteStaleListings(
  source: string,
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
  cutoff: string
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from('property_listings')
    .delete()
    .eq('source', source)
    .gte('longitude', minLng)
    .lte('longitude', maxLng)
    .gte('latitude', minLat)
    .lte('latitude', maxLat)
    .lt('scraped_at', cutoff);

  if (error) throw new Error(`Supabase delete error: ${error.message}`);
}

/**
 * Fetch all listings within a bounding box that have coordinates.
 *
 * Supabase/PostgREST caps a single response at 1000 rows, so a busy zone
 * (we routinely store 1000+ listings per zone) would silently lose the rest.
 * Page through with .range() until a short page signals the end. A stable
 * .order('id') is required — without it, range windows can overlap or skip.
 */
const PAGE_SIZE = 1000;

// Shared by every bbox query below — a listing "is in the bbox" the same way
// no matter which columns the caller wants back.
function inBbox<Q extends { gte: (c: string, v: unknown) => Q; lte: (c: string, v: unknown) => Q }>(
  query: Q,
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number
): Q {
  return query
    .gte('longitude', minLng)
    .lte('longitude', maxLng)
    .gte('latitude', minLat)
    .lte('latitude', maxLat);
}

export async function fetchListingsInBbox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number
): Promise<PropertyListing[]> {
  const supabase = getClient();
  const all: PropertyListing[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await inBbox(
      supabase.from('property_listings').select('*'),
      minLng, minLat, maxLng, maxLat
    )
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Supabase fetch error: ${error.message}`);

    const page = (data ?? []) as PropertyListing[];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return all;
}

/**
 * Answer "is there at least one fresh listing in this bbox?" without paying
 * for a full-row, possibly multi-page fetch — callers that only need a
 * boolean (the cache-freshness check) shouldn't pull every column of every
 * stored listing just to discard them immediately.
 */
export async function hasFreshListingsInBbox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
  cutoff: string
): Promise<boolean> {
  const supabase = getClient();
  const { data, error } = await inBbox(
    supabase.from('property_listings').select('id'),
    minLng, minLat, maxLng, maxLat
  )
    .gte('scraped_at', cutoff)
    .limit(1);

  if (error) throw new Error(`Supabase fetch error: ${error.message}`);

  return (data ?? []).length > 0;
}

/**
 * Fetch just the id/coordinates of listings first seen since a given
 * timestamp — used to count/collect newly-appeared listings without pulling
 * every column of the whole bbox (see fetchListingsInBbox).
 */
export async function fetchNewListingsInBbox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
  since: string
): Promise<{ id: string; latitude: number; longitude: number }[]> {
  const supabase = getClient();
  const all: { id: string; latitude: number; longitude: number }[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await inBbox(
      supabase.from('property_listings').select('id, latitude, longitude'),
      minLng, minLat, maxLng, maxLat
    )
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('first_seen_at', since)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Supabase fetch error: ${error.message}`);

    const page = (data ?? []) as { id: string; latitude: number; longitude: number }[];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return all;
}
