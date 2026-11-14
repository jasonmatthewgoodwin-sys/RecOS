-- 0014 calendar_today (section 14.1). A small cache of today's meetings,
-- refreshed by the Follow-up agent each morning and emptied each night.
-- Home's third number counts the external rows still to come.
--
-- The design names this table and what it holds but gives no DDL. The
-- columns below are the builder's reading of 14.1 and 26.4, recorded in
-- docs/decisions.md. Brought forward from P1-32 so Home can show four real
-- numbers in week 1.

create table public.calendar_today (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  title text not null,
  call_type text not null default 'other' check (call_type in (
    'candidate_screen', 'coaching', 'client_update', 'reference', 'internal', 'other')),
  person_id uuid references public.people (id),
  person_name text,
  search_id uuid,
  is_external boolean not null default true,
  -- The calendar's own reference for the event, so a refresh replaces rows
  -- instead of doubling them.
  event_ref text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index calendar_today_starts on public.calendar_today (is_external, starts_at);
create index calendar_today_person on public.calendar_today (person_id);

create trigger t_upd before update on public.calendar_today for each row execute function public.set_updated_at();
create trigger t_own before insert on public.calendar_today for each row execute function public.set_owner();

revoke all on public.calendar_today from anon;
revoke delete, truncate, references, trigger on public.calendar_today from authenticated;
