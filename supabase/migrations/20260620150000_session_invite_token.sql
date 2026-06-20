-- A per-session invite token. Sharing the link that carries it lets another
-- signed-in account join the hunt as a member. Unguessable, and rotatable later
-- if a link leaks. See ADR 0001.
alter table sessions
  add column if not exists invite_token uuid not null default gen_random_uuid();

create unique index if not exists sessions_invite_token on sessions (invite_token);
