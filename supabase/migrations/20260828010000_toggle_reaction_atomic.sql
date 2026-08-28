-- Toggling a reaction used to be read-then-write across three round trips:
-- the store selected the existing row for (session, listing, user), then
-- either deleted it or upserted the new reaction, branching in JS between the
-- two. Two toggles from the same participant fired close together (a
-- double-click, a flaky connection retrying) each read the same "no reaction
-- yet" snapshot before either write lands, so both can decide to insert, or
-- one decides to insert while the other — reading a snapshot that still shows
-- the old row — decides to delete, leaving the reaction in whichever state
-- the losing write happened to leave it rather than the one the participant
-- actually asked for last.
--
-- Folding read, branch, and write into one function closes this: `FOR UPDATE`
-- locks the (session, listing, user) row for the duration of the transaction,
-- so a second concurrent toggle from the same participant waits for the first
-- to commit and then re-reads its result, rather than racing against a stale
-- snapshot.
--
-- SECURITY INVOKER (the default) on purpose, same reasoning as close_meeting
-- and move_folder: row-level security still applies to every statement
-- inside, so this cannot be used to write a reaction into a session the
-- caller isn't a member of.

CREATE OR REPLACE FUNCTION public.toggle_reaction(
  p_session_id UUID,
  p_listing_id UUID,
  p_user_id UUID,
  p_reaction TEXT
) RETURNS SETOF public.listing_reactions
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_existing public.listing_reactions%ROWTYPE;
BEGIN
  IF NOT public.is_member(p_session_id) THEN
    RAISE EXCEPTION 'not a member of this session';
  END IF;

  SELECT * INTO v_existing
  FROM public.listing_reactions
  WHERE session_id = p_session_id AND listing_id = p_listing_id AND user_id = p_user_id
  FOR UPDATE;

  -- Same reaction applied again: remove it, returning no rows.
  IF FOUND AND v_existing.reaction = p_reaction THEN
    DELETE FROM public.listing_reactions WHERE id = v_existing.id;
    RETURN;
  END IF;

  -- No reaction yet, or a different one: add or replace it.
  RETURN QUERY
  INSERT INTO public.listing_reactions (session_id, listing_id, user_id, reaction)
  VALUES (p_session_id, p_listing_id, p_user_id, p_reaction)
  ON CONFLICT (session_id, listing_id, user_id)
  DO UPDATE SET reaction = EXCLUDED.reaction
  RETURNING *;
END;
$$;
