import { NextRequest, NextResponse } from 'next/server';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import * as turf from '@turf/turf';
import { refreshListingsForPolygon } from '@/scraper/refresh';
import { fetchListingsInPolygon, hasFreshListingsInBbox } from '@/scraper/db';

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
    const freshCutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    const hasRecentData = await hasFreshListingsInBbox(minLng, minLat, maxLng, maxLat, freshCutoff);
    debug.hasRecentData = hasRecentData;
    debug.force = force;
    debug.cacheOnly = cacheOnly;
    console.log(`[/api/scrape] Cache: fresh=${hasRecentData}, force=${force}, cacheOnly=${cacheOnly}`);

    if (!cacheOnly && (force || !hasRecentData)) {
      debug.refresh = await refreshListingsForPolygon(polygon);
    }
    // One shared path for "stored listings in this search area": bbox
    // prefilter, point-in-polygon, cross-source dedupe. The bootstrap route
    // runs the identical query, so both callers always agree.
    const { listings: canonical, stats } = await fetchListingsInPolygon(polygon);

    debug.cachedListings = stats.bboxListings;
    debug.insidePolygon = stats.insidePolygon;
    debug.afterDedup = canonical.length;
    debug.mergedDuplicates = stats.mergedDuplicates;
    debug.bySource = canonical.reduce<Record<string, number>>((acc, l) => {
      acc[l.source] = (acc[l.source] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `[/api/scrape] Final: ${canonical.length} unique listings (merged ${stats.mergedDuplicates} duplicates from ${stats.insidePolygon} pre-dedup)`,
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
