-- Decisions: what the group has agreed and now treats as settled.
--
-- "Decisions & todos" was one checklist, so the dashboard offered a checkbox
-- next to statements like "we agreed max €650k" — something that cannot be
-- completed. A decision has a date and an author, it constrains the hunt from
-- then on, and it can be superseded but never finished. See docs/adr/0003.
--
-- Deliberately no `done` column. If one ever appears here, the distinction has
-- been lost.

CREATE TABLE IF NOT EXISTS session_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  decided_by UUID REFERENCES session_users(id) ON DELETE SET NULL,
  -- Points at the decision that replaced this one. Changing your mind is
  -- recorded as history rather than by deleting the past.
  superseded_by UUID REFERENCES session_decisions(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS session_decisions_session ON session_decisions (session_id);

ALTER TABLE session_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members manage decisions" ON session_decisions;

-- Membership-scoped, matching session_users/listing_reactions/households per
-- ADR 0001 — not the pre-auth "Allow all" that the older dashboard tables
-- still carry.
CREATE POLICY "Members manage decisions" ON session_decisions
  FOR ALL
  USING (public.is_member(session_id))
  WITH CHECK (public.is_member(session_id));

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE session_decisions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
