/**
 * CommonGround crawler — the unbounded home for deep scraping.
 *
 * Runs from a GitHub Action (no Vercel 300s limit). It reads every active
 * session, folds their commute zones into one search area, and scrapes that
 * union deeply — once across all sessions, not per session × per area.
 *
 * Usage:
 *   npx tsx src/scraper/run-crawler.ts --mode free     (4 free sources, deep)
 *   npx tsx src/scraper/run-crawler.ts --mode zimmo    (Zimmo only, capped)
 *   npx tsx src/scraper/run-crawler.ts --mode all      (everything)
 *   npx tsx src/scraper/run-crawler.ts --mode free --plan   (dry run: print zone, no scrape)
 *
 * Env (from .env.local locally, or GitHub secrets in CI):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAPBOX_SECRET_TOKEN,
 *   and SCRAPER_API_KEY (Zimmo only).
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local for local runs. In CI the file is absent and dotenv no-ops,
// so the secrets injected via the workflow's `env:` block are used instead.
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import { computeIntersection, unionPolygons } from '../lib/geo';
import { discoverAreas, Area } from './areas';
import { refreshListingsForPolygon, RefreshOptions, SourceName } from './refresh';

type Mode = 'free' | 'zimmo' | 'all';

const FREE_SOURCES: SourceName[] = ['realo', 'immoweb', 'immovlan', 'immoscoop'];

// Page caps for the unbounded crawler. These are safety ceilings: every
// scraper stops early on the first empty page (verified per source), so a
// generous cap just means "go to exhaustion".
const DEEP_FREE_PAGES = 25;
// Zimmo is throttled hard: each request costs ~25 Scrape.do credits (render +
// super/residential proxy to clear Cloudflare) against a 1,000/mo free tier.
// Measured at 6 areas: 1 page/week ≈ 645 credits/month (fits); 2 pages would
// blow the budget. Page 1 is the newest listings, which is what weekly
// monitoring wants. Override per-run with --zimmo-pages for a deeper backfill.
const DEFAULT_ZIMMO_PAGES = 1;

// Towns/cities the breadth-capped sources (Immovlan, ImmoScoop) may cover. The
// union of ~6 people's zones is well under this, so it rarely bites.
const DEEP_MAX_AREAS = 50;

interface SessionUserRow {
  session_id: string;
  latitude: number;
  longitude: number;
  max_minutes: number;
  transport_mode: 'driving' | 'cycling';
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

// A single isochrone polygon for one commuter. Inlined (rather than importing
// lib/mapbox) so this script stays free of Next.js path aliases and the
// module-level token throw.
async function fetchIsochrone(
  lat: number,
  lng: number,
  minutes: number,
  mode: 'driving' | 'cycling'
): Promise<Feature<Polygon | MultiPolygon> | null> {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  const url = `https://api.mapbox.com/isochrone/v1/mapbox/${mode}/${lng},${lat}?contours_minutes=${minutes}&polygons=true&access_token=${token}`;
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json();
  return (data.features?.[0] as Feature<Polygon | MultiPolygon>) ?? null;
}

interface SearchPlan {
  /** Union of all session zones — used only for the stale-purge bounding box. */
  zone: Feature<Polygon | MultiPolygon>;
  /** Deduped postal areas discovered across the individual session zones. */
  areas: Area[];
}

// Fold every active session into a search plan: per session, intersect its
// members' commute isochrones (the zone they all reach), discover that zone's
// postal areas, and dedupe across sessions. Areas are discovered per zone (not
// on the union) because grid-sampling one sprawling multi-zone polygon misses
// the gaps between scattered sessions.
async function buildSearchPlan(): Promise<SearchPlan | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mapboxToken = process.env.MAPBOX_SECRET_TOKEN;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  if (!mapboxToken) throw new Error('MAPBOX_SECRET_TOKEN is not set');

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from('session_users')
    .select('session_id, latitude, longitude, max_minutes, transport_mode');
  if (error) throw new Error(`Failed to load sessions: ${error.message}`);

  const bySession = new Map<string, SessionUserRow[]>();
  for (const row of (data ?? []) as SessionUserRow[]) {
    const arr = bySession.get(row.session_id) ?? [];
    arr.push(row);
    bySession.set(row.session_id, arr);
  }
  console.log(`[crawler] ${bySession.size} active session(s)`);

  const zones: Feature<Polygon | MultiPolygon>[] = [];
  const areasByCode = new Map<string, Area>();
  for (const [sessionId, users] of bySession) {
    const isochrones = (
      await Promise.all(
        users.map(u =>
          fetchIsochrone(Number(u.latitude), Number(u.longitude), u.max_minutes, u.transport_mode)
        )
      )
    ).filter((f): f is Feature<Polygon | MultiPolygon> => f !== null);

    if (isochrones.length < users.length) {
      console.warn(`[crawler] Session ${sessionId}: ${users.length - isochrones.length} isochrone(s) failed`);
    }
    const zone = computeIntersection(isochrones);
    if (!zone) {
      console.log(`[crawler] Session ${sessionId}: no common commute zone — skipped`);
      continue;
    }
    zones.push(zone);
    for (const a of await discoverAreas(zone, mapboxToken)) {
      if (!areasByCode.has(a.postalCode)) areasByCode.set(a.postalCode, a);
    }
  }

  const union = unionPolygons(zones);
  if (!union) return null;
  return { zone: union, areas: [...areasByCode.values()] };
}

async function main() {
  const mode = (arg('--mode') ?? 'free') as Mode;
  const plan = process.argv.includes('--plan');
  const zimmoPages = Number(arg('--zimmo-pages') ?? DEFAULT_ZIMMO_PAGES);

  if (!['free', 'zimmo', 'all'].includes(mode)) {
    console.error(`Invalid --mode "${mode}". Use free | zimmo | all.`);
    process.exit(1);
  }
  if ((mode === 'zimmo' || mode === 'all') && !process.env.SCRAPER_API_KEY) {
    console.warn('[crawler] SCRAPER_API_KEY not set — Zimmo will be blocked and return nothing.');
  }

  console.log(`\n=== CommonGround crawler — mode: ${mode}${plan ? ' (plan only)' : ''} ===\n`);

  const searchPlan = await buildSearchPlan();
  if (!searchPlan || searchPlan.areas.length === 0) {
    console.log('[crawler] No search zone (no active sessions with a common zone). Nothing to do.');
    return;
  }

  if (plan) {
    console.log(`\n[crawler] PLAN: would scrape ${searchPlan.areas.length} area(s) in mode "${mode}":`);
    console.log(searchPlan.areas.map(a => `  ${a.postalCode} ${a.city} (${a.citySlug})`).join('\n'));
    return;
  }

  const sources: SourceName[] = mode === 'free' ? FREE_SOURCES : mode === 'zimmo' ? ['zimmo'] : [...FREE_SOURCES, 'zimmo'];
  const pages: RefreshOptions['pages'] = {
    realo: DEEP_FREE_PAGES,
    immoweb: DEEP_FREE_PAGES,
    immovlan: DEEP_FREE_PAGES,
    immoscoop: DEEP_FREE_PAGES,
    zimmo: zimmoPages,
  };

  const summary = await refreshListingsForPolygon(searchPlan.zone, {
    sources,
    pages,
    maxAreas: DEEP_MAX_AREAS,
    areas: searchPlan.areas,
  });

  console.log('\n=== Crawl complete ===');
  console.log(`Areas: ${summary.areas} | Upserted: ${summary.upserted}`);
  for (const [name, s] of Object.entries(summary.bySource)) {
    console.log(`  ${name}: ${s.count}${s.blocked ? ' (BLOCKED)' : ''}`);
  }
}

main().catch(err => {
  console.error('[crawler] Failed:', err);
  process.exit(1);
});
