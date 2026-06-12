import { Feature, Polygon, MultiPolygon } from 'geojson';
import * as turf from '@turf/turf';
import { scrapeRealo } from './realo';
import { scrapeImmoweb } from './immoweb';
import { scrapeZimmo } from './zimmo';
import { scrapeImmovlan } from './immovlan';
import { scrapeImmoscoop } from './immoscoop';
import { geocodeAddress } from './geocode';
import { discoverAreas } from './areas';
import { upsertListings, deleteStaleListings } from './db';
import { PropertyListing } from './types';

type ScrapeResult = { listings: PropertyListing[]; blocked: boolean };

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
 * Refresh listings for a polygon: discover the postal areas inside it, scrape
 * every source filtered to those areas, geocode listings that came back
 * without coordinates (tracking precision), upsert into Supabase, and purge
 * listings unseen for a week. Shared by /api/scrape and the daily cron.
 */
export async function refreshListingsForPolygon(
  polygon: Feature<Polygon | MultiPolygon>
): Promise<RefreshSummary> {
  const mapboxToken = process.env.MAPBOX_SECRET_TOKEN;
  if (!mapboxToken) throw new Error('MAPBOX_SECRET_TOKEN is not set');

  const [minLng, minLat, maxLng, maxLat] = turf.bbox(polygon);
  const bbox: [number, number, number, number] = [minLng, minLat, maxLng, maxLat];
  const scrapeStartedAt = new Date().toISOString();

  const areas = await discoverAreas(polygon, mapboxToken);

  const handleFailure = (name: string) => (err: unknown): ScrapeResult => {
    console.error(`[refresh] ${name} threw:`, err);
    return { listings: [], blocked: false };
  };

  // Fan out to all sources in parallel. Each scraper may have a different
  // rate-limit ceiling, so isolating failures via .catch keeps one source's
  // 503 from killing the others.
  const [realoResult, immowebResult, zimmoResult, immovlanResult, immoscoopResult] = await Promise.all([
    scrapeRealo(areas, 2).catch(handleFailure('Realo')),
    scrapeImmoweb(areas.map(a => a.postalCode), 3).catch(handleFailure('Immoweb')),
    scrapeZimmo(bbox, 2).catch(handleFailure('Zimmo')),
    scrapeImmovlan(areas, 2).catch(handleFailure('Immovlan')),
    scrapeImmoscoop(areas, 3).catch(handleFailure('ImmoScoop')),
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

  // Geocode listings missing coordinates, tracking precision: a street-level
  // match is 'exact'; a postcode-centroid fallback is 'approximate' and gets
  // rendered differently so it can't masquerade as a real location.
  const combined = sources.flatMap(s => s.listings);
  const withCoords = await Promise.allSettled(
    combined.map(async (listing): Promise<PropertyListing> => {
      if (listing.latitude && listing.longitude) {
        return { ...listing, location_precision: 'exact' };
      }
      const query = listing.address
        ? `${listing.address}, Belgium`
        : [listing.postal_code, listing.city, 'Belgium'].filter(Boolean).join(', ');
      if (!query.trim()) return listing;
      const geo = await geocodeAddress(query).catch(() => null);
      if (!geo) return listing;
      return {
        ...listing,
        latitude: geo.latitude,
        longitude: geo.longitude,
        location_precision: geo.precision,
      };
    })
  );

  const geocoded = withCoords
    .filter((r): r is PromiseFulfilledResult<PropertyListing> => r.status === 'fulfilled')
    .map(r => r.value)
    // Stamp scraped_at so stale detection can purge long-unseen rows
    .map(l => ({ ...l, scraped_at: scrapeStartedAt }));

  const geocodedWithCoords = geocoded.filter(l => l.latitude && l.longitude).length;
  console.log(`[refresh] Geocoded: ${geocodedWithCoords} with coords, ${geocoded.length - geocodedWithCoords} without`);

  if (geocoded.length > 0) {
    await upsertListings(geocoded);

    // Purge listings unseen for a week — and only for sources that returned a
    // non-empty, non-blocked result, so a temporary block can't wipe data.
    const staleCutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
    for (const src of sources) {
      if (src.listings.length > 0 && !src.blocked) {
        await deleteStaleListings(src.name, minLng, minLat, maxLng, maxLat, staleCutoff);
      }
    }
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
