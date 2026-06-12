-- Track when a listing first entered the database, for "new since you last
-- looked" detection. Unlike scraped_at (refreshed on every scrape), this is
-- set once on insert and never updated by the upsert (the scraper payload
-- doesn't include it).
ALTER TABLE property_listings
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Best guess for rows that existed before this column
UPDATE property_listings SET first_seen_at = scraped_at WHERE first_seen_at IS NULL;

-- Reactions: each session user can shortlist (love) or veto a listing.
-- One reaction per user per listing per session; toggling is handled in the API.
-- Listings deleted as stale (sold/delisted) cascade their reactions away.
CREATE TABLE IF NOT EXISTS listing_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES property_listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES session_users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('love', 'veto')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (session_id, listing_id, user_id)
);

CREATE INDEX IF NOT EXISTS listing_reactions_session ON listing_reactions (session_id);

ALTER TABLE listing_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON listing_reactions;
CREATE POLICY "Allow all" ON listing_reactions FOR ALL USING (true) WITH CHECK (true);

-- Realtime so everyone in a session sees votes land live
ALTER PUBLICATION supabase_realtime ADD TABLE listing_reactions;
