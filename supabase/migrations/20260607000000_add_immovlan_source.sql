-- Add 'immovlan' as a valid source for property_listings
ALTER TABLE property_listings
  DROP CONSTRAINT property_listings_source_check;

ALTER TABLE property_listings
  ADD CONSTRAINT property_listings_source_check
  CHECK (source IN ('immoweb', 'zimmo', 'realo', 'immovlan'));
