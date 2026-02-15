-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table (linked to sessions)
CREATE TABLE IF NOT EXISTS session_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  max_minutes INTEGER NOT NULL,
  transport_mode TEXT NOT NULL CHECK (transport_mode IN ('driving', 'cycling')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable real-time
ALTER PUBLICATION supabase_realtime ADD TABLE session_users;

-- Enable RLS (Row Level Security)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow all" ON sessions;
DROP POLICY IF EXISTS "Allow all" ON session_users;

-- Allow public access for open collaboration
CREATE POLICY "Allow all" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON session_users FOR ALL USING (true) WITH CHECK (true);
