import { NextRequest, NextResponse } from 'next/server';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import * as turf from '@turf/turf';
import { getServiceRoleClient } from '@/lib/supabase';
import { getIsochrone } from '@/lib/mapbox';
import { computeIntersection, bufferPolygon } from '@/lib/geo';
import { refreshListingsForPolygon } from '@/scraper/refresh';
import { fetchNewListingsInBbox } from '@/scraper/db';

// Scraping + geocoding for multiple sessions takes a while
export const maxDuration = 300;

// Most recent sessions to refresh per run — keeps us inside maxDuration
const MAX_SESSIONS_PER_RUN = 3;

interface SessionUserRow {
  session_id: string;
  latitude: number;
  longitude: number;
  max_minutes: number;
  transport_mode: 'driving' | 'cycling';
  created_at: string;
}

/**
 * Legacy scrape endpoint — no longer on a schedule. The daily/weekly crawl now
 * runs in GitHub Actions (.github/workflows/crawl.yml → src/scraper/run-crawler.ts),
 * which has no 300s limit and covers the union of all sessions deeply. This
 * route is kept as an auth-gated manual fallback (shallow, top-3 sessions).
 *
 * For every active session, recompute the commute intersection and refresh the
 * listings inside it. Because
 * first_seen_at is only set on insert, anything that shows up here for the
 * first time will carry today's timestamp — which is what the UI uses to
 * badge listings as NEW.
 */
export async function GET(req: NextRequest) {
  // Vercel sends `Authorization: Bearer ${CRON_SECRET}` along with cron
  // invocations. Fail closed: no secret configured means no access.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runStartedAt = new Date().toISOString();
  const supabase = getServiceRoleClient();

  const { data, error } = await supabase
    .from('session_users')
    .select('session_id, latitude, longitude, max_minutes, transport_mode, created_at');

  if (error) {
    return NextResponse.json({ error: `Failed to load sessions: ${error.message}` }, { status: 500 });
  }

  const { data: sessionRows } = await supabase
    .from('sessions')
    .select('id, search_buffer_pct');
  const bufferBySession = new Map(
    ((sessionRows ?? []) as { id: string; search_buffer_pct: number }[]).map(s => [
      s.id,
      s.search_buffer_pct ?? 0,
    ])
  );

  // Group users by session, then take the sessions with the most recent
  // activity (someone added/changed a commute lately = session is alive).
  const bySession = new Map<string, SessionUserRow[]>();
  for (const row of (data ?? []) as SessionUserRow[]) {
    const arr = bySession.get(row.session_id) ?? [];
    arr.push(row);
    bySession.set(row.session_id, arr);
  }

  const activeSessions = [...bySession.entries()]
    .sort(([, a], [, b]) => {
      const latest = (rows: SessionUserRow[]) => Math.max(...rows.map(r => Date.parse(r.created_at)));
      return latest(b) - latest(a);
    })
    .slice(0, MAX_SESSIONS_PER_RUN);

  const results: Array<Record<string, unknown>> = [];

  for (const [sessionId, userRows] of activeSessions) {
    try {
      const isochrones = await Promise.all(
        userRows.map(async u => {
          const iso = await getIsochrone({
            lat: Number(u.latitude),
            lng: Number(u.longitude),
            minutes: u.max_minutes,
            mode: u.transport_mode,
          });
          return iso.features[0] as Feature<Polygon | MultiPolygon>;
        })
      );

      const intersection = computeIntersection(isochrones);
      if (!intersection) {
        results.push({ sessionId, skipped: 'no intersection' });
        continue;
      }

      // Apply the session's search buffer so the scrape covers the extended zone.
      const bufferPct = bufferBySession.get(sessionId) ?? 0;
      const searchZone = bufferPct > 0
        ? (bufferPolygon(intersection, bufferPct) ?? intersection)
        : intersection;

      const summary = await refreshListingsForPolygon(searchZone);

      // Count listings that appeared for the first time during this run and
      // sit inside the session's zone — the hook for future email alerts.
      const [minLng, minLat, maxLng, maxLat] = turf.bbox(searchZone);
      const newRows = await fetchNewListingsInBbox(minLng, minLat, maxLng, maxLat, runStartedAt);
      const newListings = newRows.filter(l =>
        turf.booleanPointInPolygon(turf.point([l.longitude, l.latitude]), searchZone)
      );

      results.push({
        sessionId,
        users: userRows.length,
        newListings: newListings.length,
        ...summary,
      });
      console.log(`[cron/scrape] Session ${sessionId}: ${newListings.length} new listings`);
    } catch (err) {
      console.error(`[cron/scrape] Session ${sessionId} failed:`, err);
      results.push({ sessionId, error: err instanceof Error ? err.message : 'failed' });
    }
  }

  return NextResponse.json({
    ranAt: runStartedAt,
    sessionsProcessed: results.length,
    sessionsTotal: bySession.size,
    results,
  });
}
