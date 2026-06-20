-- Sessions gain a human-readable name and an owner; membership becomes explicit
-- so the hub can list "the sessions I created or belong to". See ADR 0001.

alter table sessions add column if not exists name text;
alter table sessions add column if not exists created_by uuid references auth.users (id) on delete set null;

-- Who belongs to a session. An owner is the creator; invites (issue #7) add
-- members. Reactions/meetings/files still attribute to session_users; this table
-- is the account↔session link, not the per-session commute constraint.
create table if not exists session_members (
  session_id uuid not null references sessions (id) on delete cascade,
  account_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz default now(),
  primary key (session_id, account_id)
);

create index if not exists session_members_account on session_members (account_id);

alter table session_members enable row level security;
-- Consistent with the app's current posture; tightened to membership-scoped
-- policies in the RLS issue (#9).
drop policy if exists "Allow all" on session_members;
create policy "Allow all" on session_members for all using (true) with check (true);

alter publication supabase_realtime add table session_members;
