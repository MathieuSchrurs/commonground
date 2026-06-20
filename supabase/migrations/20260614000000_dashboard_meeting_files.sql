-- Group dashboard: a per-session "home base" alongside the map. Adds the next
-- meeting pin and a shared files hub. Group favorites are derived from existing
-- listing_reactions, so no new table is needed for those.

-- One pinned "next meeting" per session. UNIQUE(session_id) so the API can
-- upsert in place — there is only ever one current meeting per group.
CREATE TABLE IF NOT EXISTS session_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  meets_at TIMESTAMP WITH TIME ZONE NOT NULL,
  location TEXT,
  note TEXT,
  updated_by UUID REFERENCES session_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shared files: the bytes live in the `shared-files` Storage bucket; this table
-- holds the metadata (who uploaded, optional link to a house, a note).
CREATE TABLE IF NOT EXISTS shared_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES session_users(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  listing_id UUID REFERENCES property_listings(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shared_files_session ON shared_files (session_id);

-- RLS: public access, consistent with the rest of the app (a trusted group of six).
ALTER TABLE session_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON session_meetings;
DROP POLICY IF EXISTS "Allow all" ON shared_files;
CREATE POLICY "Allow all" ON session_meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON shared_files FOR ALL USING (true) WITH CHECK (true);

-- Realtime so the meeting and new uploads land live for everyone in the session.
ALTER PUBLICATION supabase_realtime ADD TABLE session_meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE shared_files;

-- Storage bucket for the uploads. Public = reachable by unguessable URL; fine
-- for a trusted group and matches our "Allow all" posture. Switch to a private
-- bucket + signed URLs if real privacy is ever needed.
INSERT INTO storage.buckets (id, name, public)
VALUES ('shared-files', 'shared-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anon clients to upload/read/delete objects in this one bucket.
DROP POLICY IF EXISTS "shared-files allow all" ON storage.objects;
CREATE POLICY "shared-files allow all" ON storage.objects
  FOR ALL
  USING (bucket_id = 'shared-files')
  WITH CHECK (bucket_id = 'shared-files');
