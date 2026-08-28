-- Durable cache for Mapbox isochrones.
--
-- An isochrone is deterministic per (lat, lng, minutes, mode): the same
-- rounded constraint always yields the same polygon. Until now they were
-- cached only in each serverless instance's memory (10-minute TTL), so every
-- deploy or scaled-out instance sent its first visitor back to Mapbox
-- (~300-1200ms, on the session page's serial bootstrap path). Rows here are
-- served before Mapbox is ever called and never go stale.

CREATE TABLE IF NOT EXISTS isochrone_cache (
  cache_key TEXT PRIMARY KEY,
  isochrone JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security with no policies: every client role is denied outright.
-- The cache is app-wide derived data with no owner and no user-specific
-- content — there is no membership rule worth expressing — so it is read and
-- written exclusively by server code through the service-role key
-- (src/lib/isochrone-cache.ts), which bypasses RLS entirely. This mirrors the
-- scraper's posture on property_listings writes, minus the public read:
-- clients reach isochrones only through /api/isochrone and the session
-- bootstrap route, never through this table.
ALTER TABLE isochrone_cache ENABLE ROW LEVEL SECURITY;
