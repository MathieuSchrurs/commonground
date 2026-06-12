import { Feature, Polygon, MultiPolygon } from 'geojson';
import * as turf from '@turf/turf';
import { scrapeRealo } from './realo';
import { scrapeImmoweb } from './immoweb';
import { scrapeZimmo } from './zimmo';
import { scrapeImmovlan } from './immovlan';
import { geocodeAddress } from './geocode';
import { upsertListings, deleteStaleListings } from './db';
import { PropertyListing } from './types';

type ScrapeResult = { listings: PropertyListing[]; blocked: boolean };

export interface RefreshSummary {
  bySource: Record<string, { count: number; blocked: boolean }>;
  upserted: number;
  geocodedWithCoords: number;
  geocodedWithoutCoords: number;
}

/**
 * Scrape all sources for the polygon's bbox, geocode listings that came back
 * without coordinates, upsert everything into Supabase, and purge listings
 * that disappeared from a source (sold/delisted). Shared by the on-demand
 * /api/scrape route and the daily cron.
 */
export async function refreshListingsForPolygon(
  polygon: Feature<Polygon | MultiPolygon>
): Promise<RefreshSummary> {
  const [minLng, minLat, maxLng, maxLat] = turf.bbox(polygon);
  const bbox: [number, number, number, number] = [minLng, minLat, maxLng, maxLat];
  const scrapeStartedAt = new Date().toISOString();

  const handleFailure = (name: string) => (err: unknown): ScrapeResult => {
    console.error(`[refresh] ${name} threw:`, err);
    return { listings: [], blocked: false };
  };

  // Fan out to all sources in parallel. Each scraper may have a different
  // rate-limit ceiling, so isolating failures via .catch keeps one source's
  // 503 from killing the others.
  const [realoResult, immowebResult, zimmoResult, immovlanResult] = await Promise.all([
    scrapeRealo(polygon, 2).catch(handleFailure('Realo')),
    scrapeImmoweb(bbox, 2).catch(handleFailure('Immoweb')),
    scrapeZimmo(bbox, 2).catch(handleFailure('Zimmo')),
    scrapeImmovlan(bbox, 3).catch(handleFailure('Immovlan')),
  ]);

  const sources = [
    { name: 'realo' as const, ...realoResult },
    { name: 'immoweb' as const, ...immowebResult },
    { name: 'zimmo' as const, ...zimmoResult },
    { name: 'immovlan' as const, ...immovlanResult },
  ];

  const bySource: RefreshSummary['bySource'] = {};
  sources.forEach(s => {
    bySource[s.name] = { count: s.listings.length, blocked: s.blocked };
    console.log(`[refresh] ${s.name}: ${s.listings.length} listings${s.blocked ? ' (BLOCKED)' : ''}`);
  });

  // Geocode listings missing coordinates (realo + immoweb mostly; zimmo
  // already returns lat/lng from its JSON-LD payload).
  const combined = sources.flatMap(s => s.listings);
  const withCoords = await Promise.allSettled(
    combined.map(async listing => {
      if (listing.latitude && listing.longitude) return listing;
      const query = listing.address
        ? `${listing.address}, Belgium`
        : [listing.postal_code, listing.city, 'Belgium'].filter(Boolean).join(', ');
      if (!query.trim()) return listing;
      const coords = await geocodeAddress(query).catch(() => null);
      return coords ? { ...listing, ...coords } : listing;
    })
  );

  const geocoded = withCoords
    .filter((r): r is PromiseFulfilledResult<PropertyListing> => r.status === 'fulfilled')
    .map(r => r.value)
    // Stamp scraped_at so per-source stale detection can purge old rows
    .map(l => ({ ...l, scraped_at: scrapeStartedAt }));

  const geocodedWithCoords = geocoded.filter(l => l.latitude && l.longitude).length;
  console.log(`[refresh] Geocoded: ${geocodedWithCoords} with coords, ${geocoded.length - geocodedWithCoords} without`);

  if (geocoded.length > 0) {
    await upsertListings(geocoded);

    // Only purge stale for sources that returned a non-empty, non-blocked
    // result — otherwise a temporary block would wipe perfectly good cached
    // data for that source in this bbox.
    for (const src of sources) {
      if (src.listings.length > 0 && !src.blocked) {
        await deleteStaleListings(src.name, minLng, minLat, maxLng, maxLat, scrapeStartedAt);
      }
    }
    console.log('[refresh] Stale listings purged for successful sources');
  }

  return {
    bySource,
    upserted: geocoded.length,
    geocodedWithCoords,
    geocodedWithoutCoords: geocoded.length - geocodedWithCoords,
  };
}
