-- Let groups organize the shared files hub into folders. Files keep working
-- with no folder (folder_id NULL = the "root" of the hub).

CREATE TABLE IF NOT EXISTS session_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS session_folders_session ON session_folders (session_id);

-- Deleting a folder keeps its files — they fall back to the root.
ALTER TABLE shared_files
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES session_folders(id) ON DELETE SET NULL;

ALTER TABLE session_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON session_folders;
CREATE POLICY "Allow all" ON session_folders FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE session_folders;
