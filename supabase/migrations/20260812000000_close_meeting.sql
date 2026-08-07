-- Closing a meeting: record what came out of it, then clear the agenda.
--
-- The agenda hangs off the session rather than the meeting pin, so re-pinning
-- the meeting never reset it — last week's items accumulated forever. Closing
-- is the deliberate act that empties it.
--
-- Closing is destructive, so recording and clearing must be one operation: a
-- client that fails halfway must not leave the group with a wiped agenda and no
-- record of what was agreed. Hence a function rather than three round trips.
--
-- SECURITY INVOKER (the default) on purpose — row-level security still applies
-- to every statement inside, so this cannot be used to write into a session the
-- caller isn't a member of. The explicit check just fails faster and clearer.

CREATE OR REPLACE FUNCTION public.close_meeting(
  p_session_id UUID,
  p_decisions TEXT[],
  p_todos TEXT[],
  p_by UUID
) RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_member(p_session_id) THEN
    RAISE EXCEPTION 'not a member of this session';
  END IF;

  INSERT INTO public.session_decisions (session_id, text, decided_by)
  SELECT p_session_id, btrim(t), p_by
  FROM unnest(coalesce(p_decisions, '{}')) AS t
  WHERE length(btrim(t)) > 0;

  INSERT INTO public.session_todos (session_id, title, created_by)
  SELECT p_session_id, btrim(t), p_by
  FROM unnest(coalesce(p_todos, '{}')) AS t
  WHERE length(btrim(t)) > 0;

  -- Only now, once the outcomes are safely written.
  DELETE FROM public.meeting_items WHERE session_id = p_session_id;
END;
$$;
