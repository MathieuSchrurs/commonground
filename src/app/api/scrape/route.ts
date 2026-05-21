import { NextRequest, NextResponse } from 'next/server';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import * as turf from '@turf/turf';
import { scrapeRealo } from '@/scraper/realo';
import { geocodeAddress } from '@/scraper/geocode';
import { upsertListings, fetchListingsInBbox, deleteStaleListings } from '@/scraper/db';
import { PropertyListing } from '@/scraper/types';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const debug: Record<string, unknown> = {};

  try {
    const body = await req.json();
    const polygon: Feature<Polygon | MultiPolygon> = body.polygon;

    if (!polygon) {
      return NextResponse.json({ error: 'Missing polygon in request body' }, { status: 400 });
    }

    const [minLng, minLat, maxLng, maxLat] = turf.bbox(polygon);
    debug.bbox = [minLng, minLat, maxLng, maxLat];
    console.log('[/api/scrape] bbox:', debug.bbox);

    // Return cached data if fresh (< 6 hours old)
    const existing = await fetchListingsInBbox(minLng, minLat, maxLng, maxLat);
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const hasRecentData = existing.some(l => l.scraped_at && l.scraped_at > sixHoursAgo);
    debug.cachedListings = existing.length;
    debug.hasRecentData = hasRecentData;
    console.log(`[/api/scrape] Cache: ${existing.length} existing, fresh=${hasRecentData}`);

    let allListings: PropertyListing[] = existing;

    if (!hasRecentData) {
      const scrapeStartedAt = new Date().toISOString();

      const realoResult = await scrapeRealo(polygon, 2).catch(err => {
        console.error('[/api/scrape] Realo threw:', err);
        return { listings: [] as PropertyListing[], blocked: false };
      });

      debug.realo = { count: realoResult.listings.length, blocked: realoResult.blocked };
      console.log('[/api/scrape] Realo scraped:', debug.realo);

      // Geocode listings that are missing coordinates
      const withCoords = await Promise.allSettled(
        realoResult.listings.map(async listing => {
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
        // Stamp scraped_at so stale detection works on re-scrape
        .map(l => ({ ...l, scraped_at: scrapeStartedAt }));

      debug.geocodedWithCoords = geocoded.filter(l => l.latitude && l.longitude).length;
      debug.geocodedWithoutCoords = geocoded.length - (debug.geocodedWithCoords as number);
      console.log(`[/api/scrape] Geocoded: ${debug.geocodedWithCoords} with coords, ${debug.geocodedWithoutCoords} without`);

      if (geocoded.length > 0) {
        await upsertListings(geocoded);

        // Remove listings that Realo no longer returns — they've been sold or delisted
        await deleteStaleListings('realo', minLng, minLat, maxLng, maxLat, scrapeStartedAt);
        console.log('[/api/scrape] Stale listings purged');
      }

      allListings = await fetchListingsInBbox(minLng, minLat, maxLng, maxLat);
    }

    // Filter to polygon
    const inside = allListings.filter(listing => {
      if (!listing.latitude || !listing.longitude) return false;
      const point = turf.point([listing.longitude, listing.latitude]);
      return turf.booleanPointInPolygon(point, polygon);
    });

    // Deduplicate
    const seen = new Set<string>();
    const unique = inside.filter(l => {
      const key = `${l.source}:${l.external_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    debug.insidePolygon = unique.length;
    console.log(`[/api/scrape] Final: ${unique.length} listings inside polygon`);

    return NextResponse.json({ listings: unique, count: unique.length, debug });
  } catch (err) {
    console.error('[/api/scrape] Fatal error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scrape failed', debug },
      { status: 500 }
    );
  }
}
