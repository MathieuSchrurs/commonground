import { Feature, Polygon, MultiPolygon } from 'geojson';
import * as turf from '@turf/turf';
import { scrapeRealo } from './realo';
import { scrapeImmoweb } from './immoweb';
import { scrapeZimmo } from './zimmo';
import { scrapeImmovlan } from './immovlan';
import { scrapeImmoscoop } from './immoscoop';
import { geocodeAddress, GeocodedPoint } from './geocode';
import { discoverAreas, Area } from './areas';
import { upsertListings, deleteStaleListings, fetchKnownLocations, KnownLocation } from './db';
import { PropertyListing } from './types';

type ScrapeResult = { listings: PropertyListing[]; blocked: boolean };

export type SourceName = 'realo' | 'immoweb' | 'zimmo' | 'immovlan' | 'immoscoop';

const ALL_SOURCES: SourceName[] = ['realo', 'immoweb', 'zimmo', 'immovlan', 'immoscoop'];

// Shallow page caps — the Vercel cron path used these to stay inside 300s.
// The unbounded GitHub Actions crawler overrides them via RefreshOptions.pages.
const SHALLOW_PAGES: Record<SourceName, number> = {
  realo: 2,
  immoweb: 3,
  zimmo: 2,
  immovlan: 2,
  immoscoop: 3,
};

export interface RefreshOptions {
  /** Which sources to scrape. Defaults to all five. */
  sources?: SourceName[];
  /** Per-source page caps; falls back to the shallow default per source. */
  pages?: Partial<Record<SourceName, number>>;
  /**
   * Breadth cap for the town/city-filtered sources (Immovlan, ImmoScoop).
   * Omitted = each scraper's own default (8 towns / 6 cities).
   */
  maxAreas?: number;
  /**
   * Pre-discovered postal areas. When set, refresh skips its own grid-sampling
   * of the polygon — the crawler discovers areas per session zone (each compact
   * and reliably sampled) and passes the deduped union here, since sampling one
   * sprawling multi-zone polygon misses the gaps. The polygon is still used for
   * the stale-purge bounding box.
   */
  areas?: Area[];
}

// A listing not seen by any scrape for this long is presumed sold/delisted.
// Purging per-scrape would be wrong: scrapers paginate newest-first, so an
// older listing missing from page 1-3 is usually still for sale.
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export interface RefreshSummary {
  areas: number;
  bySource: Record<string, { count: number; blocked: boolean }>;
  upserted: number;
  geocodedWithCoords: number;
  geocodedWithoutCoords: number;
}

/**
 * Resolve coordinates for a batch of scraped listings, cheapest path first:
 *  1. coordinates straight from the source (Immoweb payload, Zimmo JSON-LD)
 *     never need a known-location lookup or a geocode call.
 *  2. coordinates stored on a previous refresh (no Mapbox call at all).
 *  3. fresh geocode — rate-limited in batches of 10 with a pause between
 *     batches, because Mapbox allows 600 req/min and a naive parallel burst
 *     of hundreds gets 429s that silently strand listings without
 *     coordinates. Identical query strings within one call are geocoded once
 *     and shared, since duplicate listings across sources routinely produce
 *     the same address.
 */
export async function resolveLocations(
  combined: PropertyListing[],
  deps: {
    fetchKnown: (listings: PropertyListing[]) => Promise<Map<string, KnownLocation>>;
    geocode: (query: string) => Promise<GeocodedPoint | null>;
  }
): Promise<PropertyListing[]> {
  const located: PropertyListing[] = [];
  const needKnownLookup: PropertyListing[] = [];
  for (const listing of combined) {
    if (listing.latitude && listing.longitude) {
      located.push({ ...listing, location_precision: 'exact' });
      continue;
    }
    needKnownLookup.push(listing);
  }

  const known = await deps.fetchKnown(needKnownLookup);

  const needGeocode: PropertyListing[] = [];
  for (const listing of needKnownLookup) {
    const prior = known.get(`${listing.source}:${listing.external_id}`);
    if (prior) {
      located.push({
        ...listing,
        latitude: prior.latitude,
        longitude: prior.longitude,
        location_precision: prior.location_precision ?? undefined,
      });
      continue;
    }
    needGeocode.push(listing);
  }

  console.log(`[refresh] Locations: ${located.length} known, ${needGeocode.length} to geocode`);

  // Memoized per call — addresses can genuinely change between refreshes, so
  // this must not survive past this one resolveLocations invocation.
  const geocodeCache = new Map<string, Promise<GeocodedPoint | null>>();
  const geocodeMemoized = (query: string): Promise<GeocodedPoint | null> => {
    const cached = geocodeCache.get(query);
    if (cached) return cached;
    const promise = deps.geocode(query).catch(() => null);
    geocodeCache.set(query, promise);
    return promise;
  };

  // Batches of 10 with a 1.1s pause ≈ max 540 req/min, under Mapbox's 600
  const GEOCODE_BATCH = 10;
  for (let i = 0; i < needGeocode.length; i += GEOCODE_BATCH) {
    const batch = needGeocode.slice(i, i + GEOCODE_BATCH);
    const results = await Promise.all(
      batch.map(async (listing): Promise<PropertyListing> => {
        const query = listing.address
          ? `${listing.address}, Belgium`
          : [listing.postal_code, listing.city, 'Belgium'].filter(Boolean).join(', ');
        if (!query.trim()) return listing;
        const geo = await geocodeMemoized(query);
        if (!geo) return listing;
        return {
          ...listing,
          latitude: geo.latitude,
          longitude: geo.longitude,
          location_precision: geo.precision,
        };
      })
    );
    located.push(...results);
    if (i + GEOCODE_BATCH < needGeocode.length) await new Promise(r => setTimeout(r, 1100));
  }

  return located;
}

/**
 * Delete stale listings for every eligible source concurrently. A source is
 * eligible when this run actually returned listings for it and it wasn't
 * blocked — a temporary block or an empty result must not be read as "nothing
 * left, purge it all". Each source's delete is independent (different
 * `source` filter, same bbox/cutoff), so there is nothing to sequence.
 */
export async function purgeStaleListings(
  sources: { name: string; listings: PropertyListing[]; blocked: boolean }[],
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  cutoff: string,
  deleteFn: (
    source: string,
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number,
    cutoff: string
  ) => Promise<void> = deleteStaleListings
): Promise<void> {
  const eligible = sources.filter(s => s.listings.length > 0 && !s.blocked);
  await Promise.all(
    eligible.map(s => deleteFn(s.name, bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat, cutoff))
  );
}

/**
 * Refresh listings for a polygon: discover the postal areas inside it, scrape
 * every source filtered to those areas, geocode listings that came back
 * without coordinates (tracking precision), upsert into Supabase, and purge
 * listings unseen for a week. Shared by /api/scrape and the daily cron.
 */
export async function refreshListingsForPolygon(
  polygon: Feature<Polygon | MultiPolygon>,
  options: RefreshOptions = {}
): Promise<RefreshSummary> {
  const mapboxToken = process.env.MAPBOX_SECRET_TOKEN;
  if (!mapboxToken) throw new Error('MAPBOX_SECRET_TOKEN is not set');

  const [minLng, minLat, maxLng, maxLat] = turf.bbox(polygon);
  const scrapeStartedAt = new Date().toISOString();

  const areas = options.areas ?? await discoverAreas(polygon, mapboxToken);

  const handleFailure = (name: string) => (err: unknown): ScrapeResult => {
    console.error(`[refresh] ${name} threw:`, err);
    return { listings: [], blocked: false };
  };

  // Resolve options: which sources to run, how deep, and how many towns/cities.
  const selected = new Set(options.sources ?? ALL_SOURCES);
  const pagesFor = (s: SourceName) => options.pages?.[s] ?? SHALLOW_PAGES[s];
  const empty = async (): Promise<ScrapeResult> => ({ listings: [], blocked: false });
  const run = (s: SourceName, scrape: () => Promise<ScrapeResult>) =>
    selected.has(s) ? scrape().catch(handleFailure(s)) : empty();

  // Fan out to the selected sources in parallel. Each scraper may have a
  // different rate-limit ceiling, so isolating failures via .catch keeps one
  // source's 503 from killing the others.
  const [realoResult, immowebResult, zimmoResult, immovlanResult, immoscoopResult] = await Promise.all([
    run('realo', () => scrapeRealo(areas, pagesFor('realo'))),
    run('immoweb', () => scrapeImmoweb(areas.map(a => a.postalCode), pagesFor('immoweb'))),
    run('zimmo', () => scrapeZimmo(areas, pagesFor('zimmo'))),
    run('immovlan', () => scrapeImmovlan(areas, pagesFor('immovlan'), options.maxAreas)),
    run('immoscoop', () => scrapeImmoscoop(areas, pagesFor('immoscoop'), options.maxAreas)),
  ]);

  const sources = [
    { name: 'realo' as const, ...realoResult },
    { name: 'immoweb' as const, ...immowebResult },
    { name: 'zimmo' as const, ...zimmoResult },
    { name: 'immovlan' as const, ...immovlanResult },
    { name: 'immoscoop' as const, ...immoscoopResult },
  ];

  const bySource: RefreshSummary['bySource'] = {};
  sources.forEach(s => {
    bySource[s.name] = { count: s.listings.length, blocked: s.blocked };
    console.log(`[refresh] ${s.name}: ${s.listings.length} listings${s.blocked ? ' (BLOCKED)' : ''}`);
  });

  const combined = sources.flatMap(s => s.listings);
  const located = await resolveLocations(combined, { fetchKnown: fetchKnownLocations, geocode: geocodeAddress });

  // Stamp scraped_at so stale detection can purge long-unseen rows
  const geocoded = located.map(l => ({ ...l, scraped_at: scrapeStartedAt }));

  const geocodedWithCoords = geocoded.filter(l => l.latitude && l.longitude).length;
  console.log(`[refresh] Geocoded: ${geocodedWithCoords} with coords, ${geocoded.length - geocodedWithCoords} without`);

  if (geocoded.length > 0) {
    await upsertListings(geocoded);

    // Purge listings unseen for a week — and only for sources that returned a
    // non-empty, non-blocked result, so a temporary block can't wipe data.
    const staleCutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
    await purgeStaleListings(sources, { minLng, minLat, maxLng, maxLat }, staleCutoff);
    console.log('[refresh] Stale (1w+ unseen) listings purged for successful sources');
  }

  return {
    areas: areas.length,
    bySource,
    upserted: geocoded.length,
    geocodedWithCoords,
    geocodedWithoutCoords: geocoded.length - geocodedWithCoords,
  };
}
