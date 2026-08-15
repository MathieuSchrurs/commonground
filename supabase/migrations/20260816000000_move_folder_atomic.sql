-- Moving a folder used to be read-validate-write across three round trips:
-- the store read the tree, validated the move against that snapshot in JS,
-- then wrote it. Two concurrent moves each validate against a snapshot that
-- doesn't include the other's not-yet-committed change, so "move A into B"
-- and "move B into A" can both pass validation and both commit — a two-node
-- cycle the folder_parent_same_session trigger never sees, because neither
-- individual write is a self-parent or a cross-session parent.
--
-- Folding read, validate, and write into one function closes this: the
-- `FOR UPDATE` below locks every folder row in the session for the duration
-- of the transaction, so a second concurrent move blocks until the first
-- commits, then re-validates against the now-current (post-move) data.
--
-- SECURITY INVOKER (the default) on purpose, same reasoning as close_meeting:
-- RLS still applies to every statement inside, so this cannot write into a
-- session the caller isn't a member of.

CREATE OR REPLACE FUNCTION public.move_folder(
  p_session_id UUID,
  p_folder_id UUID,
  p_parent_id UUID,
  p_max_depth INT
) RETURNS SETOF public.session_folders
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_depth INT := 0;
  v_height INT;
  v_current UUID;
  v_steps INT := 0;
BEGIN
  -- Serializes every move within this session against every other, closing
  -- the race described above.
  PERFORM 1 FROM public.session_folders WHERE session_id = p_session_id FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.session_folders WHERE id = p_folder_id AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'folder not found: %', p_folder_id USING ERRCODE = 'P0002';
  END IF;

  IF p_parent_id IS NOT NULL THEN
    IF p_parent_id = p_folder_id THEN
      RAISE EXCEPTION 'A folder cannot be moved inside itself' USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.session_folders WHERE id = p_parent_id AND session_id = p_session_id
    ) THEN
      RAISE EXCEPTION 'folder not found: %', p_parent_id USING ERRCODE = 'P0002';
    END IF;

    -- Moving into a descendant would detach the folder's own subtree from the
    -- hub. Walk down from p_folder_id looking for p_parent_id; capped so a
    -- cycle already in the data (which the app tolerates read-side, per
    -- buildFolderTree) can't spin this forever.
    IF EXISTS (
      WITH RECURSIVE descendants AS (
        SELECT id FROM public.session_folders WHERE parent_id = p_folder_id
        UNION ALL
        SELECT sf.id
        FROM public.session_folders sf
        JOIN descendants d ON sf.parent_id = d.id
      )
      SELECT 1 FROM descendants WHERE id = p_parent_id
    ) THEN
      RAISE EXCEPTION 'A folder cannot be moved inside itself' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Depth of the target parent, root counted as 0 (mirrors folders.ts's
  -- depthOf(folders, null) === 0). Capped at 50 for the same reason as above.
  v_current := p_parent_id;
  WHILE v_current IS NOT NULL AND v_steps < 50 LOOP
    v_depth := v_depth + 1;
    v_steps := v_steps + 1;
    SELECT parent_id INTO v_current FROM public.session_folders WHERE id = v_current;
  END LOOP;

  -- Height of the subtree being moved (itself counts as 1), so a shallow move
  -- can't push a grandchild past the limit.
  WITH RECURSIVE subtree AS (
    SELECT p_folder_id AS id, 1 AS depth
    UNION ALL
    SELECT sf.id, subtree.depth + 1
    FROM public.session_folders sf
    JOIN subtree ON sf.parent_id = subtree.id
    WHERE subtree.depth < 50
  )
  SELECT MAX(depth) INTO v_height FROM subtree;

  IF v_depth + v_height > p_max_depth THEN
    RAISE EXCEPTION 'Folders can only go % levels deep', p_max_depth USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  UPDATE public.session_folders
  SET parent_id = p_parent_id
  WHERE id = p_folder_id AND session_id = p_session_id
  RETURNING *;
END;
$$;
