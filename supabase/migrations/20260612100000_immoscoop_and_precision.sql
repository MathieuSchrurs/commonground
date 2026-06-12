-- New source: ImmoScoop (Flanders-focused portal)
ALTER TABLE property_listings
  DROP CONSTRAINT property_listings_source_check;

ALTER TABLE property_listings
  ADD CONSTRAINT property_listings_source_check
  CHECK (source IN ('immoweb', 'zimmo', 'realo', 'immovlan', 'immoscoop'));

-- Geocoding precision: 'exact' = source coordinates or street-level geocode,
-- 'approximate' = postcode-centroid fallback. Approximate pins are rendered
-- differently so a dot on the map is never mistaken for a real location.
ALTER TABLE property_listings
  ADD COLUMN IF NOT EXISTS location_precision TEXT
  CHECK (location_precision IN ('exact', 'approximate'));
