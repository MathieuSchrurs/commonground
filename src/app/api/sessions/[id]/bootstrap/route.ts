import { route } from '@/lib/session/route';
import { getSession, listUsers } from '@/lib/session/store';
import { getIsochrone } from '@/lib/mapbox';
import { computeIntersectionResult } from '@/lib/intersection';
import { fetchListingsInPolygon } from '@/scraper/db';
import { Feature, MultiPolygon, Polygon } from 'geojson';

type Ctx = { params: Promise<{ id: string }> };

// Everything the session page's map needs for its first paint, in one round
// trip: the session's participants, each participant's isochrone area, the
// common ground (with the session's search buffer applied) and the stored
// listings inside that area.
//
// This used to be four client-orchestrated serial fetches (session →
// isochrones → intersection → listings), each its own serverless invocation;
// the chain is strictly dependent, so it belongs server-side where each hop
// is a function call. Authorization is the same as GET /api/sessions/[id]:
// RLS membership-scopes the session read, and a non-member simply gets the
// store's NotFound.
export const GET = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const [session, users] = await Promise.all([getSession(id), listUsers(id)]);

  // Same clamp as the page's slider: the persisted buffer can never widen the
  // search area beyond what the UI can express.
  const bufferPct = Math.max(0, Math.min(15, session.search_buffer_pct ?? 0));

  const isochrones = (
    await Promise.all(
      users.map((u) =>
        getIsochrone({
          lat: u.latitude,
          lng: u.longitude,
          minutes: u.maxMinutes,
          mode: u.transportMode,
        })
      )
    )
  ).map((response) => response.features[0] as Feature<Polygon | MultiPolygon>);

  const area = computeIntersectionResult(isochrones, bufferPct);

  const { listings, stats } = area.bufferedIntersection
    ? await fetchListingsInPolygon(area.bufferedIntersection)
    : { listings: [], stats: null };

  return {
    // The persisted search buffer, already clamped to the slider range — the
    // raw sessions row (whose fields are snake_case) stays behind the store.
    bufferPct,
    participants: users,
    isochrones,
    ...area,
    listings,
    listingsStats: stats,
  };
});
