-- Listing an account's sessions for the hub used to be four round trips: the
-- store read session_members for the account's own sessions and role, then in
-- parallel read sessions by id and every member row for those sessions, then
-- read profiles to resolve each member's display name. Folding that into one
-- function removes three round trips without changing what's returned.
--
-- SECURITY INVOKER (the default) on purpose: RLS on session_members, sessions
-- and profiles still applies to every statement inside, so passing an
-- arbitrary p_account_id can't be used to see another account's sessions —
-- the caller only ever gets back rows is_member() would already let them
-- read one at a time.
CREATE OR REPLACE FUNCTION public.list_sessions_for_account(p_account_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  updated_at TIMESTAMPTZ,
  role TEXT,
  members JSONB
)
LANGUAGE sql
SET search_path = ''
STABLE
AS $$
  SELECT
    s.id,
    s.name,
    s.updated_at,
    mine.role,
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object('id', m.account_id, 'name', p.display_name))
        FROM public.session_members m
        LEFT JOIN public.profiles p ON p.id = m.account_id
        WHERE m.session_id = s.id
      ),
      '[]'::jsonb
    ) AS members
  FROM public.session_members mine
  JOIN public.sessions s ON s.id = mine.session_id
  WHERE mine.account_id = p_account_id
  ORDER BY s.updated_at DESC NULLS LAST;
$$;
