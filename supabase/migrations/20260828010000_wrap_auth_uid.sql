-- A bare auth.uid() inside an RLS policy (or a function a policy calls) gets
-- re-evaluated per row; wrapping it as (select auth.uid()) makes it a
-- one-time InitPlan, evaluated once per query instead. Logic is unchanged —
-- only how the current-user check is evaluated.

create or replace function public.is_member(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.session_members m
    where m.session_id = p_session_id and m.account_id = (select auth.uid())
  );
$$;

create or replace function public.is_creator(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session_id and s.created_by = (select auth.uid())
  );
$$;

drop policy if exists "Members read sessions" on sessions;
drop policy if exists "Create own session" on sessions;
drop policy if exists "Creator updates session" on sessions;
drop policy if exists "Creator deletes session" on sessions;
create policy "Members read sessions" on sessions for select using (public.is_member(id) or created_by = (select auth.uid()));
create policy "Create own session" on sessions for insert with check (created_by = (select auth.uid()));
create policy "Creator updates session" on sessions for update using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy "Creator deletes session" on sessions for delete using (created_by = (select auth.uid()));

drop policy if exists "Add self as creator" on session_members;
drop policy if exists "Remove self" on session_members;
create policy "Add self as creator" on session_members for insert
  with check (account_id = (select auth.uid()) and public.is_creator(session_id));
create policy "Remove self" on session_members for delete using (account_id = (select auth.uid()));

drop policy if exists "Profiles are readable" on profiles;
drop policy if exists "Update own profile" on profiles;
create policy "Profiles are readable" on profiles for select using ((select auth.uid()) is not null);
create policy "Update own profile" on profiles for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
