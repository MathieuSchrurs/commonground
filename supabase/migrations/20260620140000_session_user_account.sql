-- Link a commute constraint to the account that owns it, so "who am I" in a
-- session is resolved from the signed-in account instead of a localStorage pick.
-- Nullable: legacy rows (pre-auth) keep account_id null until claimed (issue #8).
alter table session_users
  add column if not exists account_id uuid references auth.users (id) on delete set null;

create index if not exists session_users_account on session_users (session_id, account_id);
