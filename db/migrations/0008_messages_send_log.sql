-- 0008 messages and send_log (sections 8.3 and 8.4).
--
-- Two columns point at tables that arrive in later tickets. The columns are
-- here now; their foreign keys are added by the migrations that create
-- templates (P1-29) and searches (P2-01).

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  type text not null references public.send_policies (type),
  channel text not null check (channel in ('email', 'linkedin')),
  person_id uuid references public.people (id),
  to_name text not null,
  -- MSG-1: filled at send time, used, and cleared 30 days after sending.
  to_address text,
  to_profile_url text,
  subject text,
  body text,
  template_id uuid,
  template_version int,
  variables jsonb not null default '{}',
  search_id uuid,
  created_by text not null,
  level_at_creation text not null check (level_at_creation in (
    'automatic', 'one_click', 'draft_only')),
  state text not null default 'draft' check (state in (
    'draft', 'queued', 'sending', 'sent', 'failed', 'held', 'cancelled')),
  hold_reason text,
  send_after timestamptz,
  sent_at timestamptz,
  external_ref text,
  outlook_draft_url text,
  attempts int not null default 0,
  last_error text,
  purge_after date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- MSG-3: free-text bodies can never be automatic.
  constraint messages_automatic_needs_template
    check (level_at_creation <> 'automatic' or template_id is not null)
);

create index messages_state_send_after on public.messages (state, send_after);
create index messages_person on public.messages (person_id);
create index messages_type on public.messages (type);
create index messages_search on public.messages (search_id);

-- MSG-4: only the send engine may set queued, sending, sent, failed or held.
-- The browser may cancel, and may edit body and subject only while a draft.
create function public.messages_browser_guard() returns trigger
language plpgsql as $$
begin
  if not is_browser() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.state <> 'draft' or new.level_at_creation = 'automatic' then
      raise exception 'A message from the app starts as a draft and is never automatic';
    end if;
    return new;
  end if;
  if new.state is distinct from old.state and new.state <> 'cancelled' then
    raise exception 'Only the send engine can move a message to %', new.state;
  end if;
  if old.state <> 'draft' and (new.body is distinct from old.body or new.subject is distinct from old.subject) then
    raise exception 'A message can only be edited while it is a draft';
  end if;
  if new.type is distinct from old.type
     or new.level_at_creation is distinct from old.level_at_creation
     or new.template_id is distinct from old.template_id
     or new.to_address is distinct from old.to_address
     or new.send_after is distinct from old.send_after
     or new.sent_at is distinct from old.sent_at
     or new.attempts is distinct from old.attempts then
    raise exception 'That part of a message is set by the send engine';
  end if;
  return new;
end $$;

create trigger t_guard before insert or update on public.messages for each row execute function public.messages_browser_guard();
create trigger t_upd before update on public.messages for each row execute function public.set_updated_at();
create trigger t_own before insert on public.messages for each row execute function public.set_owner();

revoke all on public.messages from anon;
revoke delete, truncate, references, trigger on public.messages from authenticated;

-- send_log: an append-only record of every send attempt. Kept for 24 months.
-- LOG-1: inserted by the send engine only and never updated.
create table public.send_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  message_id uuid not null references public.messages (id),
  type text not null,
  channel text not null,
  to_name text not null,
  level text not null,
  outcome text not null check (outcome in (
    'sent', 'failed', 'held', 'skipped', 'cancelled')),
  detail text,
  caps_snapshot jsonb,
  logged_at timestamptz not null default now()
);

create index send_log_message on public.send_log (message_id);
create index send_log_type_logged on public.send_log (type, logged_at desc);

create function public.send_log_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'send_log rows are never changed';
end $$;

create trigger t_append_only before update on public.send_log for each row execute function public.send_log_append_only();

revoke all on public.send_log from anon;
revoke insert, update, delete, truncate, references, trigger on public.send_log from authenticated;
