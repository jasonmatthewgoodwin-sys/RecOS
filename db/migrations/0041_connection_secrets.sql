-- 0041 Connection secrets and status (24.1, 24.9; 15 November 2026).
--
-- Outlook's refresh token and the Granola and Spott API keys live in Supabase
-- Vault, one secret per owner and app, named recos_conn_<provider>_<owner>.
-- Only these definer functions touch the vault, and every one of them except
-- connection_oauth_begin is granted to service_role alone, so a browser can
-- neither read a secret nor learn its id. The secret is never returned to
-- the browser by any path.
--
-- The vault calls sit in three small wrappers (connection_secret_put, _get,
-- _drop). The database tests run in PGlite, which has no vault; there the
-- test shim stands in a vault schema with the same three entry points
-- (create_secret, update_secret, decrypted_secrets), as it stands in the
-- Supabase roles and the auth schema.

create function public.connection_secret_name(p_owner uuid, p_provider text) returns text
language sql immutable as $$
  select 'recos_conn_' || p_provider || '_' || p_owner::text
$$;

-- Store or replace the secret for one app.
create function public.connection_secret_put(p_owner uuid, p_provider text, p_secret text) returns void
language plpgsql security definer set search_path = public as $$
declare
  n text := connection_secret_name(p_owner, p_provider);
  sid uuid;
begin
  if is_browser() then raise exception 'not_allowed: secrets are kept by the server'; end if;
  if p_provider not in ('outlook', 'granola', 'spott') then raise exception 'invalid: unknown app %', p_provider; end if;
  if p_secret is null or length(p_secret) < 8 then raise exception 'invalid: the secret is empty'; end if;
  select id into sid from vault.decrypted_secrets where name = n;
  if sid is null then
    perform vault.create_secret(p_secret, n, 'RecOS connection');
  else
    perform vault.update_secret(sid, p_secret);
  end if;
end $$;

-- Read the secret for one app, or null.
create function public.connection_secret_get(p_owner uuid, p_provider text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  s text;
begin
  if is_browser() then raise exception 'not_allowed: secrets are kept by the server'; end if;
  select decrypted_secret into s from vault.decrypted_secrets where name = connection_secret_name(p_owner, p_provider);
  return s;
end $$;

-- Forget the secret for one app.
create function public.connection_secret_drop(p_owner uuid, p_provider text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if is_browser() then raise exception 'not_allowed: secrets are kept by the server'; end if;
  delete from vault.secrets where name = connection_secret_name(p_owner, p_provider);
end $$;

-- Record how a connection stands (24.9: ok, needs sign-in or failing). A good
-- read sets last_ok_at and clears the error; connected_at is kept from the
-- first connect. account_label is kept when null is passed.
create function public.connection_record(p_owner uuid, p_provider text, p_status text, p_account_label text default null, p_error text default null)
returns public.connections
language plpgsql security definer set search_path = public as $$
declare
  c connections%rowtype;
begin
  if is_browser() then raise exception 'not_allowed: only the server records a connection'; end if;
  insert into connections (owner_id, provider, status, account_label, connected_at, last_ok_at, last_error)
  values (p_owner, p_provider, p_status, left(p_account_label, 200),
          case when p_status = 'connected' then now() end,
          case when p_status = 'connected' then now() end,
          case when p_status <> 'connected' then left(p_error, 500) end)
  on conflict (owner_id, provider) do update set
    status = excluded.status,
    account_label = coalesce(excluded.account_label, connections.account_label),
    connected_at = case when excluded.status = 'connected' then coalesce(connections.connected_at, now()) else connections.connected_at end,
    last_ok_at = case when excluded.status = 'connected' then now() else connections.last_ok_at end,
    last_error = case when excluded.status = 'connected' then null else excluded.last_error end
  returning * into c;
  return c;
end $$;

-- Connect: keep the secret and mark the app connected, in one step.
create function public.connection_connect(p_owner uuid, p_provider text, p_secret text, p_account_label text default null)
returns public.connections
language plpgsql security definer set search_path = public as $$
declare
  c connections%rowtype;
begin
  if is_browser() then raise exception 'not_allowed: only the server connects an app'; end if;
  perform connection_secret_put(p_owner, p_provider, p_secret);
  c := connection_record(p_owner, p_provider, 'connected', p_account_label);
  perform write_audit('connection made', 'connections', c.id, jsonb_build_object('provider', p_provider));
  return c;
end $$;

-- Disconnect: forget the secret and the row.
create function public.connection_disconnect(p_owner uuid, p_provider text) returns void
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if is_browser() then raise exception 'not_allowed: only the server disconnects an app'; end if;
  perform connection_secret_drop(p_owner, p_provider);
  delete from connections where owner_id = p_owner and provider = p_provider returning id into cid;
  perform write_audit('connection removed', 'connections', cid, jsonb_build_object('provider', p_provider));
end $$;

-- The owner asks to sign in to Outlook: a one-time state, good for ten
-- minutes, tied to his user id. Only its hash is kept.
create function public.connection_oauth_begin(p_provider text default 'outlook') returns text
language plpgsql security definer set search_path = public as $$
declare
  s text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if app_role() <> 'owner' or auth.uid() is null then raise exception 'not_allowed: only the owner can connect an app'; end if;
  if p_provider <> 'outlook' then raise exception 'invalid: only Outlook signs in this way'; end if;
  delete from connection_states where expires_at < now() - interval '1 day';
  insert into connection_states (state_hash, owner_id, provider) values (encode(sha256(convert_to(s, 'UTF8')), 'hex'), auth.uid(), p_provider);
  return s;
end $$;

-- The connections function asks this with the caller's own session token:
-- the owner's user id, or a refusal. The database decides who the owner is.
create function public.connection_owner() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if app_role() <> 'owner' or auth.uid() is null then raise exception 'not_allowed: only the owner can connect an app'; end if;
  return auth.uid();
end $$;

-- Check a state without using it (the start route).
create function public.connection_oauth_check(p_state text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  o uuid;
begin
  if is_browser() then raise exception 'not_allowed: the server checks the state'; end if;
  select owner_id into o from connection_states
  where state_hash = encode(sha256(convert_to(coalesce(p_state, ''), 'UTF8')), 'hex') and used_at is null and expires_at > now();
  return o;
end $$;

-- Use a state once (the callback route). Returns the owner, or null.
create function public.connection_oauth_take(p_state text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o uuid;
begin
  if is_browser() then raise exception 'not_allowed: the server checks the state'; end if;
  update connection_states set used_at = now()
  where state_hash = encode(sha256(convert_to(coalesce(p_state, ''), 'UTF8')), 'hex') and used_at is null and expires_at > now()
  returning owner_id into o;
  return o;
end $$;

-- ---------------------------------------------------------------- grants

revoke execute on function
  public.connection_secret_name(uuid, text),
  public.connection_secret_put(uuid, text, text),
  public.connection_secret_get(uuid, text),
  public.connection_secret_drop(uuid, text),
  public.connection_record(uuid, text, text, text, text),
  public.connection_connect(uuid, text, text, text),
  public.connection_disconnect(uuid, text),
  public.connection_oauth_check(text),
  public.connection_oauth_take(text)
  from public, anon, authenticated;
grant execute on function
  public.connection_secret_name(uuid, text),
  public.connection_secret_put(uuid, text, text),
  public.connection_secret_get(uuid, text),
  public.connection_secret_drop(uuid, text),
  public.connection_record(uuid, text, text, text, text),
  public.connection_connect(uuid, text, text, text),
  public.connection_disconnect(uuid, text),
  public.connection_oauth_check(text),
  public.connection_oauth_take(text)
  to service_role;

revoke execute on function public.connection_oauth_begin(text), public.connection_owner() from public, anon;
grant execute on function public.connection_oauth_begin(text), public.connection_owner() to authenticated, service_role;
