-- Folders inside folders.
--
-- session_folders was flat: every folder a sibling of every other, so the hub
-- was exactly two levels (root -> folder). Six people filing documents per
-- house want "Houses -> Kerkstraat 12 -> Survey", and the flat model forced
-- that into folder names with punctuation in them.
--
-- parent_id is nullable and permanently so: null means the folder sits at the
-- root, mirroring how shared_files.folder_id already means "at the root". With
-- every parent null the tree is one level deep and the hub looks exactly as it
-- does today — nothing needs reorganising on day one.
--
-- ON DELETE SET NULL, not CASCADE: deleting a folder must never destroy a
-- document. A deleted folder's files already fall back to the root; its child
-- folders now do the same, so the whole subtree survives.

ALTER TABLE session_folders
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES session_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS session_folders_parent ON session_folders (parent_id);

-- A folder may only be parented within its own session. The foreign key alone
-- cannot express this, so it is a trigger — the store scopes by session too,
-- but a cross-session parent would silently detach a subtree from its hub.
CREATE OR REPLACE FUNCTION public.folder_parent_same_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'a folder cannot be its own parent';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.session_folders p
      WHERE p.id = NEW.parent_id AND p.session_id = NEW.session_id
    ) THEN
      RAISE EXCEPTION 'a folder parent must belong to the same session';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS folder_parent_same_session ON session_folders;
CREATE TRIGGER folder_parent_same_session
  BEFORE INSERT OR UPDATE OF parent_id, session_id ON session_folders
  FOR EACH ROW EXECUTE FUNCTION public.folder_parent_same_session();
