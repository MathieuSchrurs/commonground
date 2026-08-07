-- Households: the unit that decides.
--
-- Three couples produce six participants — six commutes, because six jobs —
-- but three deciders. Every convergence signal counts households, not people.
-- See docs/adr/0002.

CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS households_session ON households (session_id);

-- Nullable on purpose, and permanently so: a participant belonging to no
-- household is a household of one. That is what makes a solo co-buyer a
-- first-class case and what lets this migration change nothing until someone
-- actually pairs up. ON DELETE SET NULL so dissolving a household unpairs its
-- members rather than deleting people.
ALTER TABLE session_users
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE SET NULL;

ALTER TABLE households ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON households;
CREATE POLICY "Allow all" ON households FOR ALL USING (true) WITH CHECK (true);

-- Realtime so pairing lands live for everyone in the session. Guarded: adding
-- a table already in the publication raises, which would abort a re-run.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE households;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
