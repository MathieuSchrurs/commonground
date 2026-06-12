import { PropertyListing } from './types';

export interface ExistingPriceRow {
  id: string;
  source: string;
  external_id: string;
  price: number | null;
  previous_price: number | null;
  price_changed_at: string | null;
}

export interface PriceHistoryEntry {
  /** `source:external_id` — resolved to a DB listing id after the upsert */
  key: string;
  price: number;
}

export interface AnnotatedBatch {
  upserts: PropertyListing[];
  history: PriceHistoryEntry[];
}

/**
 * Compare freshly scraped listings against what's already stored and annotate
 * price changes. Every upsert row carries previous_price/price_changed_at
 * (Supabase bulk upserts need uniform columns): changed rows get the old
 * price stamped, unchanged rows carry their stored values forward, new rows
 * get nulls. History entries are produced for first sightings and changes,
 * giving each listing a complete price series.
 */
export function annotatePriceChanges(
  incoming: PropertyListing[],
  existing: ExistingPriceRow[],
  now: string = new Date().toISOString()
): AnnotatedBatch {
  const byKey = new Map(existing.map(e => [`${e.source}:${e.external_id}`, e]));
  const history: PriceHistoryEntry[] = [];

  const upserts = incoming.map(listing => {
    const key = `${listing.source}:${listing.external_id}`;
    const prev = byKey.get(key);

    if (!prev) {
      // First sighting — baseline history entry if it has a price
      if (listing.price != null) history.push({ key, price: listing.price });
      return { ...listing, previous_price: null, price_changed_at: null };
    }

    const changed = listing.price != null && prev.price != null && listing.price !== prev.price;
    if (changed) {
      history.push({ key, price: listing.price! });
      return { ...listing, previous_price: prev.price, price_changed_at: now };
    }

    // Unchanged (or unpriced) — carry stored values so the upsert doesn't wipe them
    return { ...listing, previous_price: prev.previous_price, price_changed_at: prev.price_changed_at };
  });

  return { upserts, history };
}
