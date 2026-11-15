-- 0041 Connections (low-level design 24.1 and 24.9, Route B; 15 November 2026,
-- Pending Jason in docs/decisions.md). RecOS talks to Outlook (Microsoft
-- Graph), Granola and Spott itself, with tokens and keys held in Supabase
-- Vault (0042), never in a table the browser can read.
--
-- connections: one row per app the owner has connected. Status in words and
-- when it last worked, nothing secret. The owner reads his own rows; only the
-- server functions write (through the definer functions in 0042).
--
-- connection_states: the short-lived state that ties an Outlook sign-in to
-- the owner's session. Server only.

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  provider text not null check (provider in ('outlook', 'granola', 'spott')),
  status text not null check (status in ('connected', 'needs_sign_in', 'failing')),
  account_label text check (account_label is null or length(account_label) <= 200),
  connected_at timestamptz,
  last_ok_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 500),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider)
);

create trigger connections_upd before update on public.connections
  for each row execute function public.set_updated_at();

create table public.connection_states (
  state_hash text primary key,
  owner_id uuid not null,
  provider text not null check (provider = 'outlook'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz
);

-- Read only for the owner; nothing for anon; everything for the server.
revoke all on public.connections from anon, authenticated;
grant select on public.connections to authenticated;
revoke all on public.connection_states from anon, authenticated;
grant all on public.connections, public.connection_states to service_role;
