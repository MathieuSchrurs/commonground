-- Replace the app-wide "Allow all" policies with membership-scoped RLS. Only
-- members of a session can read/write its data; only the creator can rename or
-- delete it. See ADR 0001. property_listings stays public (shared listing data,
-- written by the scraper); only session-scoped tables are tightened here.

-- Membership check used by every session-scoped policy. SECURITY DEFINER so it
-- bypasses RLS on session_members — this is what prevents infinite recursion
-- when session_members' own policy needs to check membership.
create or replace function public.is_member(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.session_members m
    where m.session_id = p_session_id and m.account_id = auth.uid()
  );
$$;

-- Is the caller the creator of this session? Definer so it can be used inside
-- the session_members insert policy without tripping sessions' own RLS (the
-- creator isn't a member yet when they add their owner row at create time).
create or replace function public.is_creator(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session_id and s.created_by = auth.uid()
  );
$$;

-- Join via an invite token. A non-member can't read the session under RLS, so
-- the lookup + membership insert run as definer. Uses auth.uid() (the caller's
-- verified identity) for the new member row.
create or replace function public.join_session(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  select id into v_session_id from public.sessions where invite_token = p_token;
  if v_session_id is null then
    raise exception 'invalid invite token';
  end if;
  insert into public.session_members (session_id, account_id, role)
  values (v_session_id, auth.uid(), 'member')
  on conflict (session_id, account_id) do nothing;
  return v_session_id;
end;
$$;

-- sessions: members read; creator inserts/updates/deletes their own.
drop policy if exists "Allow all" on sessions;
drop policy if exists "Members read sessions" on sessions;
drop policy if exists "Create own session" on sessions;
drop policy if exists "Creator updates session" on sessions;
drop policy if exists "Creator deletes session" on sessions;
-- Members read; the creator can always read their own session too, so that
-- create's INSERT ... RETURNING works before the owner membership row exists.
create policy "Members read sessions" on sessions for select using (public.is_member(id) or created_by = auth.uid());
create policy "Create own session" on sessions for insert with check (created_by = auth.uid());
create policy "Creator updates session" on sessions for update using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "Creator deletes session" on sessions for delete using (created_by = auth.uid());

-- session_members: members see the roster; you may add yourself only to a
-- session you created (the owner row). Joining someone else's session goes
-- through join_session (the RPC, which is definer). You may remove yourself.
drop policy if exists "Allow all" on session_members;
drop policy if exists "Members read roster" on session_members;
drop policy if exists "Add self as creator" on session_members;
drop policy if exists "Remove self" on session_members;
create policy "Members read roster" on session_members for select using (public.is_member(session_id));
create policy "Add self as creator" on session_members for insert
  with check (account_id = auth.uid() and public.is_creator(session_id));
create policy "Remove self" on session_members for delete using (account_id = auth.uid());

-- session-scoped data tables: members do everything, non-members nothing.
drop policy if exists "Allow all" on session_users;
drop policy if exists "Members manage participants" on session_users;
create policy "Members manage participants" on session_users for all
  using (public.is_member(session_id)) with check (public.is_member(session_id));

drop policy if exists "Allow all" on listing_reactions;
drop policy if exists "Members manage reactions" on listing_reactions;
create policy "Members manage reactions" on listing_reactions for all
  using (public.is_member(session_id)) with check (public.is_member(session_id));

drop policy if exists "Allow all" on session_meetings;
drop policy if exists "Members manage meeting" on session_meetings;
create policy "Members manage meeting" on session_meetings for all
  using (public.is_member(session_id)) with check (public.is_member(session_id));

drop policy if exists "Allow all" on shared_files;
drop policy if exists "Members manage files" on shared_files;
create policy "Members manage files" on shared_files for all
  using (public.is_member(session_id)) with check (public.is_member(session_id));

drop policy if exists "Allow all" on session_folders;
drop policy if exists "Members manage folders" on session_folders;
create policy "Members manage folders" on session_folders for all
  using (public.is_member(session_id)) with check (public.is_member(session_id));

-- Storage (shared-files bucket): only members may upload/delete in a session's
-- folder — the object path is "<session_id>/...". Reads stay public (the object
-- paths are unguessable UUIDs and the shared_files metadata is RLS-protected, so
-- non-members can't discover them). Uploads go through the authed browser client.
drop policy if exists "shared-files allow all" on storage.objects;
drop policy if exists "shared-files public read" on storage.objects;
drop policy if exists "shared-files members write" on storage.objects;
drop policy if exists "shared-files members delete" on storage.objects;
create policy "shared-files public read" on storage.objects for select
  using (bucket_id = 'shared-files');
create policy "shared-files members write" on storage.objects for insert
  with check (bucket_id = 'shared-files' and public.is_member((storage.foldername(name))[1]::uuid));
create policy "shared-files members delete" on storage.objects for delete
  using (bucket_id = 'shared-files' and public.is_member((storage.foldername(name))[1]::uuid));

-- profiles: any signed-in user may read display names/avatars (trusted group);
-- you may update only your own.
drop policy if exists "Profiles are readable" on profiles;
drop policy if exists "Update own profile" on profiles;
create policy "Profiles are readable" on profiles for select using (auth.uid() is not null);
create policy "Update own profile" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
