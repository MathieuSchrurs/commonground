import { createClient } from '@supabase/supabase-js';
import { PropertyListing } from './types';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env variables');
  return createClient(url, key);
}

/**
 * Upsert a batch of listings into property_listings.
 * Conflict on (source, external_id) — updates existing rows.
 * Returns the full upserted rows (including DB-generated IDs).
 */
export async function upsertListings(listings: PropertyListing[]): Promise<PropertyListing[]> {
  if (listings.length === 0) return [];

  // Postgres rejects an upsert batch where two rows share the conflict key,
  // so collapse duplicates on (source, external_id) — last occurrence wins.
  const deduped = Array.from(
    new Map(listings.map((l) => [`${l.source}:${l.external_id}`, l])).values()
  );

  const supabase = getClient();
  const { data, error } = await supabase
    .from('property_listings')
    .upsert(deduped, { onConflict: 'source,external_id' })
    .select();

  if (error) throw new Error(`Supabase upsert error: ${error.message}`);

  return (data ?? []) as PropertyListing[];
}

/**
 * Delete listings for a given source within a bounding box that were not
 * refreshed during the current scrape (scraped_at older than scrapeStartedAt).
 * This removes sold/delisted properties automatically.
 */
export async function deleteStaleListings(
  source: string,
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
  scrapeStartedAt: string
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
    .lt('scraped_at', scrapeStartedAt);

  if (error) throw new Error(`Supabase delete error: ${error.message}`);
}

/**
 * Fetch all listings within a bounding box that have coordinates.
 */
export async function fetchListingsInBbox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number
): Promise<PropertyListing[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('property_listings')
    .select('*')
    .gte('longitude', minLng)
    .lte('longitude', maxLng)
    .gte('latitude', minLat)
    .lte('latitude', maxLat)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (error) throw new Error(`Supabase fetch error: ${error.message}`);
  return (data ?? []) as PropertyListing[];
}
