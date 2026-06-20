-- Owner/admin flag for the activity view (#10): only the project owner sees who
-- logged in when. is_admin must never be self-settable — a trigger blocks any
-- change made by a signed-in user (auth.uid() is not null). Set it via the
-- dashboard SQL editor or the service role (both run with auth.uid() = null).
alter table profiles add column if not exists is_admin boolean not null default false;

create or replace function public.prevent_self_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_admin is distinct from old.is_admin and auth.uid() is not null then
    raise exception 'is_admin cannot be changed by a user';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_self_admin on profiles;
create trigger profiles_prevent_self_admin
  before update on profiles
  for each row execute function public.prevent_self_admin();
