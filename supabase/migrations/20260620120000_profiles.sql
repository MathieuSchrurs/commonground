-- Profiles: a public mirror of auth.users so the app can show names and avatars
-- without reaching into the protected `auth` schema. One row per account,
-- created automatically on signup by a trigger. See ADR 0001.

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- Consistent with the app's current posture (tightened in the RLS issue #9):
-- profiles are readable, and an account may update only its own.
drop policy if exists "Profiles are readable" on profiles;
create policy "Profiles are readable" on profiles for select using (true);

drop policy if exists "Update own profile" on profiles;
create policy "Update own profile" on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- Mint a profile whenever a new auth user signs up. Google puts the person's
-- name in full_name/name and their picture in avatar_url; fall back to the
-- email local-part so display_name is never null.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
