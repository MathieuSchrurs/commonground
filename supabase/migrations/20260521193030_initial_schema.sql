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

-- Property listings table (scraped from Immoweb, Zimmo, etc.)
CREATE TABLE IF NOT EXISTS property_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('immoweb', 'zimmo', 'realo')),
  external_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  price BIGINT,
  property_type TEXT CHECK (property_type IN ('house', 'apartment', 'land', 'other')),
  bedrooms BIGINT,
  surface_area BIGINT,
  land_area BIGINT,
  image_url TEXT,
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(source, external_id)
);

CREATE INDEX IF NOT EXISTS property_listings_location ON property_listings (latitude, longitude);
CREATE INDEX IF NOT EXISTS property_listings_postal_code ON property_listings (postal_code);
CREATE INDEX IF NOT EXISTS property_listings_price ON property_listings (price);

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

-- RLS for property listings (public read, restricted write)
ALTER TABLE property_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read" ON property_listings;
DROP POLICY IF EXISTS "Allow all" ON property_listings;
CREATE POLICY "Allow public read" ON property_listings FOR SELECT USING (true);
CREATE POLICY "Allow all" ON property_listings FOR ALL USING (true) WITH CHECK (true);
