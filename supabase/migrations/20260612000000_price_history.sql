-- Price tracking: previous_price/price_changed_at give the UI a query-free
-- "was €X" signal; price_history keeps the full series for future charts.
ALTER TABLE property_listings
  ADD COLUMN IF NOT EXISTS previous_price BIGINT,
  ADD COLUMN IF NOT EXISTS price_changed_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES property_listings(id) ON DELETE CASCADE,
  price BIGINT NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS price_history_listing ON price_history (listing_id);

ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON price_history;
CREATE POLICY "Allow all" ON price_history FOR ALL USING (true) WITH CHECK (true);
