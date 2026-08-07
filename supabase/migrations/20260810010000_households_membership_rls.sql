-- Households shipped with the "Allow all" policy the session-scoped tables used
-- *before* 20260620160000_rls_membership.sql tightened them. That was a
-- regression, not a match: household names are real people's names, and with
-- USING (true) anyone holding a session id could read the roster, insert junk
-- households, or dissolve someone else's pairing — the API routes carry no
-- app-level membership check and rely on RLS for authorization.
--
-- Bring households in line with session_users and listing_reactions per ADR 0001.

DROP POLICY IF EXISTS "Allow all" ON households;

CREATE POLICY "Members manage households" ON households
  FOR ALL
  USING (public.is_member(session_id))
  WITH CHECK (public.is_member(session_id));
