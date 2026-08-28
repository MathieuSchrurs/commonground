-- The "Allow all" policy on property_listings was created as
-- FOR ALL USING (true) WITH CHECK (true), which grants anonymous
-- insert/update/delete on every listing row, not just the intended public
-- read. The scraper writes with SUPABASE_SERVICE_ROLE_KEY, which bypasses
-- RLS entirely, so no permissive write policy is needed here at all.
-- "Allow public read" (FOR SELECT USING (true)) is intentional and unchanged.
DROP POLICY IF EXISTS "Allow all" ON property_listings;
