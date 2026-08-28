-- Per-participant preference for whether commercial real-estate listings are
-- shown to them, defaulting to hidden. Deliberately per participant, not per
-- household: see docs/adr/0004.
ALTER TABLE session_users
  ADD COLUMN IF NOT EXISTS hide_commercial_listings BOOLEAN NOT NULL DEFAULT true;
