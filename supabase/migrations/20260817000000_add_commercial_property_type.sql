-- Classify commercial listings (offices, retail, industrial units) as their
-- own property type instead of folding them into 'other'.
ALTER TABLE property_listings
  DROP CONSTRAINT property_listings_property_type_check;

ALTER TABLE property_listings
  ADD CONSTRAINT property_listings_property_type_check
  CHECK (property_type IN ('house', 'apartment', 'land', 'commercial', 'other'));
