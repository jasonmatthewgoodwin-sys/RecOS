-- 0009 follow_ups (section 8.2). One row per next action owed to a person.
--
-- call_id and search_id point at tables that arrive later. Their foreign keys
-- are added by the migrations that create calls (P1-36) and searches (P2-01).
-- The lifecycle rules (on_time, pairing with messages) arrive with P1-30.

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  person_id uuid references public.people (id),
  person_name text not null,
  company text,
  kind text not null check (kind in (
    'after_candidate_call', 'after_coaching', 'after_client_meeting',
    'after_interview', 'after_submission', 'rejection', 'aftercare',
    'after_event', 'league_cadence', 'email_owed', 'chase', 'referral_thanks', 'other')),
  reason text not null,
  source text not null check (source in ('call', 'email', 'crm_task', 'rule', 'manual')),
  call_id uuid,
  search_id uuid,
  source_url text,
  message_id uuid references public.messages (id),
  direction text not null default 'owed' check (direction in ('owed', 'waiting')),
  due_on date not null,
  status text not null default 'open' check (status in (
    'open', 'sent', 'done', 'handled_offline', 'snoozed', 'closed')),
  snoozed_until date,
  completed_at timestamptz,
  on_time boolean,
  dedup_key text not null unique,
  purge_after date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index follow_ups_status_due on public.follow_ups (status, due_on);
create index follow_ups_person on public.follow_ups (person_id);
create index follow_ups_message on public.follow_ups (message_id);
create index follow_ups_call on public.follow_ups (call_id);
create index follow_ups_search on public.follow_ups (search_id);

create trigger t_upd before update on public.follow_ups for each row execute function public.set_updated_at();
create trigger t_own before insert on public.follow_ups for each row execute function public.set_owner();

revoke all on public.follow_ups from anon;
revoke delete, truncate, references, trigger on public.follow_ups from authenticated;
