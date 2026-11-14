-- 0003 Sign-in: allow-list, app_users, the role in the token (section 5).
--
-- Two auth hooks are defined here. They must also be switched on in the
-- Supabase dashboard under Authentication, Hooks, for each project:
--   "Customize Access Token (JWT) Claims"  -> public.custom_access_token_hook
--   "Before User Created"                  -> public.before_user_created_hook
-- The allow-list is seeded with the owner's work address by a later
-- migration, written once Jason has given the address.

create table public.allowed_emails (
  email text primary key check (email = lower(btrim(email))),
  role text not null check (role in ('owner', 'reviewer')),
  added_at timestamptz not null default now()
);

create table public.app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text,
  role text not null check (role in ('owner', 'reviewer')),
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

revoke all on public.allowed_emails, public.app_users from anon;
revoke insert, update, delete, truncate, references, trigger on public.allowed_emails, public.app_users from authenticated;

-- Email comparison is case-insensitive and trims spaces (5.4).
create function public.clean_email(e text) returns text
language sql immutable as $$
  select lower(btrim(e))
$$;

-- On first sign-in, copy the matching allow-list row into app_users.
-- Someone who is not on the list gets no row, so no role, so no data.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  listed allowed_emails%rowtype;
begin
  select * into listed from allowed_emails where email = clean_email(new.email);
  if found then
    insert into app_users (id, email, display_name, role, last_sign_in_at)
    values (
      new.id,
      listed.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
      listed.role,
      new.last_sign_in_at)
    on conflict (id) do nothing;
  else
    perform write_audit('refused sign-in', null, null, null);
  end if;
  return new;
end $$;

create trigger t_new_user after insert on auth.users
for each row execute function public.handle_new_user();

-- AUTH-7: each sign-in is written to the audit log.
create function public.handle_sign_in() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    update app_users set last_sign_in_at = new.last_sign_in_at where id = new.id;
    if found then
      insert into audit_log (actor, action, target_table, target_id)
      select email, 'sign-in', 'app_users', id from app_users where id = new.id;
    end if;
  end if;
  return new;
end $$;

create trigger t_sign_in after update of last_sign_in_at on auth.users
for each row execute function public.handle_sign_in();

-- Removing an address from the allow-list removes the user's role. Their
-- current token stops carrying a role at its next refresh.
create function public.handle_unlisted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from app_users where email = old.email;
  return old;
end $$;

create trigger t_unlisted after delete on public.allowed_emails
for each row execute function public.handle_unlisted();

-- Hook: add app_role to the session token (5.7). The front end never decides
-- the role.
create function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  found_role text;
begin
  select role into found_role from app_users where id = (event ->> 'user_id')::uuid;
  if found_role is null then
    claims := claims - 'app_role';
  else
    claims := jsonb_set(claims, '{app_role}', to_jsonb(found_role));
  end if;
  return jsonb_set(event, '{claims}', claims);
end $$;

-- Hook: refuse to create a user whose address is not on the allow-list
-- (AUTH-2). This also stops the emailed link being sent to anyone else,
-- and the reply to the browser is the same either way (5.5).
create function public.before_user_created_hook(event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  address text := clean_email(event -> 'user' ->> 'email');
begin
  if exists (select 1 from allowed_emails where email = address) then
    return '{}'::jsonb;
  end if;
  insert into audit_log (actor, action) values ('unknown', 'refused sign-in');
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'This account does not have access.'));
end $$;

revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
revoke execute on function public.before_user_created_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant execute on function public.before_user_created_hook(jsonb) to supabase_auth_admin;

-- AUTH-7: the browser reports a sign-out just before it ends the session.
create function public.audit_sign_out() returns void
language plpgsql security definer set search_path = public as $$
begin
  if app_role() in ('owner', 'reviewer') then
    perform write_audit('sign-out', 'app_users', auth.uid(), null);
  end if;
end $$;

revoke execute on function public.audit_sign_out() from public, anon;
grant execute on function public.audit_sign_out() to authenticated;
