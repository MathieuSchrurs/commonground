-- A re-run of the scraper that upserts the same listing twice within one
-- crawl (or a retry after a partial failure) previously appended a duplicate
-- price_history row for the same (listing_id, recorded_at) pair, since there
-- was no uniqueness constraint to stop it. Guard against that going forward.
--
-- Production may already hold duplicates from that exact bug, so a bare
-- ADD CONSTRAINT ... UNIQUE would fail to apply. Delete the duplicates first,
-- keeping the lowest id per pair, then add the constraint.
DELETE FROM price_history a
USING price_history b
WHERE a.listing_id = b.listing_id
  AND a.recorded_at = b.recorded_at
  AND a.id > b.id;

ALTER TABLE price_history
  ADD CONSTRAINT price_history_listing_recorded_unique UNIQUE (listing_id, recorded_at);
