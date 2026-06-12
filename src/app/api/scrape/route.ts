import { NextRequest, NextResponse } from 'next/server';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import * as turf from '@turf/turf';
import { refreshListingsForPolygon } from '@/scraper/refresh';
import { dedupeAcrossSources } from '@/scraper/dedupe';
import { fetchListingsInBbox } from '@/scraper/db';
import { PropertyListing } from '@/scraper/types';

// Three scrapers in parallel + geocoding pushes past the old 60s ceiling
export const maxDuration = 120;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const debug: Record<string, unknown> = {};

  try {
    const body = await req.json();
    const polygon: Feature<Polygon | MultiPolygon> = body.polygon;
    const force: boolean = body.force === true;
    // cacheOnly: read whatever is stored, never scrape. Used on session load
    // so pins appear instantly; the daily cron keeps the data fresh.
    const cacheOnly: boolean = body.cacheOnly === true;

    if (!polygon) {
      return NextResponse.json({ error: 'Missing polygon in request body' }, { status: 400 });
    }

    const [minLng, minLat, maxLng, maxLat] = turf.bbox(polygon);
    debug.bbox = [minLng, minLat, maxLng, maxLat];

    // Return cached data if any listing in the bbox is fresh (< 6h old), unless
    // the caller explicitly asks for a refresh.
    const existing = await fetchListingsInBbox(minLng, minLat, maxLng, maxLat);
    const freshCutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    const hasRecentData = existing.some(l => l.scraped_at && l.scraped_at > freshCutoff);
    debug.cachedListings = existing.length;
    debug.hasRecentData = hasRecentData;
    debug.force = force;
    debug.cacheOnly = cacheOnly;
    console.log(`[/api/scrape] Cache: ${existing.length} existing, fresh=${hasRecentData}, force=${force}, cacheOnly=${cacheOnly}`);

    let allListings: PropertyListing[] = existing;

    if (!cacheOnly && (force || !hasRecentData)) {
      debug.refresh = await refreshListingsForPolygon(polygon);
      allListings = await fetchListingsInBbox(minLng, minLat, maxLng, maxLat);
    }

    // Polygon filter (bbox is a superset of the polygon)
    const inside = allListings.filter(listing => {
      if (!listing.latitude || !listing.longitude) return false;
      const point = turf.point([listing.longitude, listing.latitude]);
      return turf.booleanPointInPolygon(point, polygon);
    });

    // Drop exact duplicates by (source, external_id) — should already be
    // unique after upsert, but cheap belt-and-braces.
    const seenKey = new Set<string>();
    const uniquePerSource = inside.filter(l => {
      const k = `${l.source}:${l.external_id}`;
      if (seenKey.has(k)) return false;
      seenKey.add(k);
      return true;
    });

    const { listings: canonical, merged } = dedupeAcrossSources(uniquePerSource);

    debug.insidePolygon = uniquePerSource.length;
    debug.afterDedup = canonical.length;
    debug.mergedDuplicates = merged;
    debug.bySource = canonical.reduce<Record<string, number>>((acc, l) => {
      acc[l.source] = (acc[l.source] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `[/api/scrape] Final: ${canonical.length} unique listings (merged ${merged} duplicates from ${uniquePerSource.length} pre-dedup)`,
      debug.bySource
    );

    return NextResponse.json({ listings: canonical, count: canonical.length, debug });
  } catch (err) {
    console.error('[/api/scrape] Fatal error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scrape failed', debug },
      { status: 500 }
    );
  }
}
