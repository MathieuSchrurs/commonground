-- The last two session-scoped tables still open to anyone holding a session id.
--
-- session_todos and meeting_items were added in 20260808, after
-- 20260620160000_rls_membership.sql had tightened every other session-scoped
-- table to membership per ADR 0001 — and copied the older "Allow all" pattern
-- instead. `households` repeated the same mistake two days later, which is why
-- src/lib/rls-ratchet.test.ts now exists.
--
-- Until now, a signed-in person who knew any session id could read a group's
-- todos and meeting agenda, add to them, and delete them.
--
-- Both tables reached production on 2026-08-07 and are still empty, so this
-- tightens rows that do not exist yet. It will never be cheaper.
--
-- close_meeting() inserts into session_todos and is SECURITY INVOKER, so it
-- keeps working for members and keeps failing for everyone else — its own
-- is_member() check now matches the policy underneath it.

DROP POLICY IF EXISTS "Allow all" ON session_todos;
CREATE POLICY "Members manage todos" ON session_todos
  FOR ALL
  USING (public.is_member(session_id))
  WITH CHECK (public.is_member(session_id));

DROP POLICY IF EXISTS "Allow all" ON meeting_items;
CREATE POLICY "Members manage agenda" ON meeting_items
  FOR ALL
  USING (public.is_member(session_id))
  WITH CHECK (public.is_member(session_id));
