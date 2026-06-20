-- Owner-only activity: who logged in and when. Reads auth.users.last_sign_in_at
-- (protected schema) via a SECURITY DEFINER function that returns rows ONLY to
-- admins — a non-admin caller gets an empty set. Not exposed to regular members.
create or replace function public.admin_activity()
returns table (
  id uuid,
  display_name text,
  email text,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.display_name, p.email, u.last_sign_in_at, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where exists (
    select 1 from public.profiles me
    where me.id = auth.uid() and me.is_admin
  )
  order by u.last_sign_in_at desc nulls last;
$$;
