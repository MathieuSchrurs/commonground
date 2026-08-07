-- Local development seed. Runs after migrations on `supabase db reset`, and is
-- never applied to a hosted project (`db push` ignores it).
--
-- Why this exists: after a `db reset`, tables created by the migrations end up
-- without SELECT/INSERT/UPDATE/DELETE for the `anon` and `authenticated` roles,
-- so PostgREST answers every request with "permission denied for table ..." and
-- the local app cannot read or write anything. The hosted project grants these,
-- which is why the bug only shows up locally and only after a reset.
--
-- These are grants, not policies: row-level security still decides *which* rows
-- each role may touch. Without the grant, RLS never even gets a say.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;
