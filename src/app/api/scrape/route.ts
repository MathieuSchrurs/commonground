import { NextRequest, NextResponse } from 'next/server';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import * as turf from '@turf/turf';
import { scrapeRealo } from '@/scraper/realo';
import { scrapeImmoweb } from '@/scraper/immoweb';
import { scrapeZimmo } from '@/scraper/zimmo';
import { scrapeImmovlan } from '@/scraper/immovlan';
import { geocodeAddress } from '@/scraper/geocode';
import { upsertListings, fetchListingsInBbox, deleteStaleListings } from '@/scraper/db';
import { PropertyListing } from '@/scraper/types';

// Three scrapers in parallel + geocoding pushes past the old 60s ceiling
export const maxDuration = 120;

type ScrapeResult = { listings: PropertyListing[]; blocked: boolean };

export async function POST(req: NextRequest) {
  const debug: Record<string, unknown> = {};

  try {
    const body = await req.json();
    const polygon: Feature<Polygon | MultiPolygon> = body.polygon;
    const force: boolean = body.force === true;

    if (!polygon) {
      return NextResponse.json({ error: 'Missing polygon in request body' }, { status: 400 });
    }

    const [minLng, minLat, maxLng, maxLat] = turf.bbox(polygon);
    const bbox: [number, number, number, number] = [minLng, minLat, maxLng, maxLat];
    debug.bbox = bbox;
    console.log('[/api/scrape] bbox:', bbox);

    // Return cached data if any listing in the bbox is fresh (< 6h old), unless
    // the caller explicitly asks for a refresh.
    const existing = await fetchListingsInBbox(minLng, minLat, maxLng, maxLat);
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const hasRecentData = existing.some(l => l.scraped_at && l.scraped_at > sixHoursAgo);
    debug.cachedListings = existing.length;
    debug.hasRecentData = hasRecentData;
    debug.force = force;
    console.log(`[/api/scrape] Cache: ${existing.length} existing, fresh=${hasRecentData}, force=${force}`);

    let allListings: PropertyListing[] = existing;

    if (force || !hasRecentData) {
      const scrapeStartedAt = new Date().toISOString();

      const handleFailure = (name: string) => (err: unknown): ScrapeResult => {
        console.error(`[/api/scrape] ${name} threw:`, err);
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

      sources.forEach(s => {
        debug[s.name] = { count: s.listings.length, blocked: s.blocked };
        console.log(`[/api/scrape] ${s.name}: ${s.listings.length} listings${s.blocked ? ' (BLOCKED)' : ''}`);
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

      debug.geocodedWithCoords = geocoded.filter(l => l.latitude && l.longitude).length;
      debug.geocodedWithoutCoords = geocoded.length - (debug.geocodedWithCoords as number);
      console.log(`[/api/scrape] Geocoded: ${debug.geocodedWithCoords} with coords, ${debug.geocodedWithoutCoords} without`);

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
        console.log('[/api/scrape] Stale listings purged for successful sources');
      }

      allListings = await fetchListingsInBbox(minLng, minLat, maxLng, maxLat);
    }

    // Polygon filter (bbox is a superset of the polygon)
    const inside = allListings.filter(listing => {
      if (!listing.latitude || !listing.longitude) return false;
      const point = turf.point([listing.longitude, listing.latitude]);
      return turf.booleanPointInPolygon(point, polygon);
    });

    // Step 1: drop exact duplicates by (source, external_id). Should already
    // be unique after upsert, but cheap belt-and-braces.
    const seenKey = new Set<string>();
    const uniquePerSource = inside.filter(l => {
      const k = `${l.source}:${l.external_id}`;
      if (seenKey.has(k)) return false;
      seenKey.add(k);
      return true;
    });

    // Step 2: cross-source dedup. A property listed on multiple sites usually
    // shows up with the same street address (when both sources include
    // street+number) — that's the strongest signal. As a fallback we cluster
    // by very-close coordinates + similar price + matching property_type.
    //
    // Source priority for which copy to keep: realo (precise street-level
    // coords, rich data) > immoweb > immovlan (city-centroid only) > zimmo.
    const SOURCE_RANK: Record<string, number> = { realo: 4, immoweb: 3, immovlan: 2, zimmo: 1 };

    function streetKey(l: PropertyListing): string | null {
      if (!l.postal_code || !l.address) return null;
      // Normalize: lowercase, collapse whitespace, strip "belgium" suffix and punctuation
      const cleaned = l.address
        .toLowerCase()
        .replace(/,?\s*belgium\s*$/i, '')
        .replace(/[.,;]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return `${l.postal_code}:${cleaned}`;
    }

    function metersBetween(a: PropertyListing, b: PropertyListing): number {
      if (!a.latitude || !a.longitude || !b.latitude || !b.longitude) return Infinity;
      const R = 6371000;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(b.latitude - a.latitude);
      const dLng = toRad(b.longitude - a.longitude);
      const lat1 = toRad(a.latitude);
      const lat2 = toRad(b.latitude);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    }

    function priceClose(a?: number, b?: number): boolean {
      if (!a || !b) return false;
      return Math.abs(a - b) / Math.max(a, b) <= 0.02; // within 2%
    }

    // Group by street key first
    const byStreet = new Map<string, PropertyListing[]>();
    const noStreetKey: PropertyListing[] = [];
    for (const l of uniquePerSource) {
      const k = streetKey(l);
      if (k) {
        const arr = byStreet.get(k) ?? [];
        arr.push(l);
        byStreet.set(k, arr);
      } else {
        noStreetKey.push(l);
      }
    }

    const canonical: PropertyListing[] = [];
    let mergedCount = 0;
    const pickBest = (cluster: PropertyListing[]) =>
      cluster.reduce((best, cur) =>
        (SOURCE_RANK[cur.source] ?? 0) > (SOURCE_RANK[best.source] ?? 0) ? cur : best
      );

    for (const cluster of byStreet.values()) {
      if (cluster.length > 1) mergedCount += cluster.length - 1;
      canonical.push(pickBest(cluster));
    }

    // For listings without a street key, do a geo+price pass (catches cases
    // where both sources have coords but only one has an address).
    const usedIdx = new Set<number>();
    for (let i = 0; i < noStreetKey.length; i++) {
      if (usedIdx.has(i)) continue;
      const cluster: PropertyListing[] = [noStreetKey[i]];
      usedIdx.add(i);
      for (let j = i + 1; j < noStreetKey.length; j++) {
        if (usedIdx.has(j)) continue;
        const a = noStreetKey[i];
        const b = noStreetKey[j];
        if (
          a.property_type === b.property_type &&
          metersBetween(a, b) < 15 &&
          priceClose(a.price, b.price)
        ) {
          cluster.push(b);
          usedIdx.add(j);
        }
      }
      if (cluster.length > 1) mergedCount += cluster.length - 1;
      canonical.push(pickBest(cluster));
    }

    debug.insidePolygon = uniquePerSource.length;
    debug.afterDedup = canonical.length;
    debug.mergedDuplicates = mergedCount;
    debug.bySource = canonical.reduce<Record<string, number>>((acc, l) => {
      acc[l.source] = (acc[l.source] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `[/api/scrape] Final: ${canonical.length} unique listings (merged ${mergedCount} duplicates from ${uniquePerSource.length} pre-dedup)`,
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
