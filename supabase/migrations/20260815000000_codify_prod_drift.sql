-- Bring the migration history back in line with production.
--
-- Two objects existed in prod and in no migration, so a fresh local database
-- did not match the real one. That is how it bites: restoring a production
-- dump into local fails on the first unknown column, and the schema you
-- develop against silently differs from the one you deploy to.
--
-- Both are unused by the app — no code reads either — and appear to be
-- leftovers from an abandoned experiment. They are codified rather than
-- dropped: deleting objects in production deserves its own deliberate change,
-- not a side effect of a restore. IF NOT EXISTS makes this a no-op against
-- prod and a fix everywhere else.

ALTER TABLE session_users
  ADD COLUMN IF NOT EXISTS departure_time_morning TIME WITHOUT TIME ZONE DEFAULT '08:00:00',
  ADD COLUMN IF NOT EXISTS departure_time_evening TIME WITHOUT TIME ZONE DEFAULT '17:30:00';

CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  name TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- candidates carries a session_id, so it is session-scoped — and it was
-- sitting on the pre-ADR-0001 "Allow all" policy, readable and writable by
-- anyone holding a session id. The ratchet could not see it because the table
-- was in no migration. It is now, and this closes it.
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON candidates;
CREATE POLICY "Members manage candidates" ON candidates
  FOR ALL
  USING (public.is_member(session_id))
  WITH CHECK (public.is_member(session_id));
