-- Grant the project owner admin (for the owner-only activity view, #10).
-- Idempotent; runs as the migration role (auth.uid() is null), so it passes the
-- self-admin guard. Matches the owner's profile by email — a no-op until that
-- account has signed in on the environment.
update public.profiles set is_admin = true where email = 'schrursmathieu@gmail.com';
