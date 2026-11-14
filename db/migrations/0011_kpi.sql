-- 0011 kpi_events and targets (sections 13.1 and 13.2).
-- Every KPI figure is a count of rows in kpi_events. Never a stored total.

create table public.kpi_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  kpi text not null check (kpi in (
    'posts_chased', 'coaching_calls', 'linkedin_posts', 'new_a_star',
    'events_held', 'blogs_published', 'testimonials',
    'client_meetings', 'jobs_won', 'shortlists', 'first_interviews', 'offers',
    'placements', 'referrals_received', 'leads_passed', 'followups_on_time')),
  happened_at timestamptz not null default now(),
  week date not null,
  quarter date not null,
  amount numeric(12,2) not null default 1,
  source_table text,
  source_id uuid,
  -- KPI-4: company and role only. Never a candidate's name.
  label text,
  is_pmm boolean not null default true,
  manual boolean not null default false,
  reason text,
  reversed_by uuid references public.kpi_events (id),
  created_at timestamptz not null default now(),
  -- The same row can never count twice for the same KPI.
  unique (kpi, source_table, source_id),
  constraint kpi_events_manual_needs_reason check (not manual or nullif(btrim(reason), '') is not null)
);

create index kpi_events_kpi_week on public.kpi_events (kpi, week);
create index kpi_events_kpi_quarter on public.kpi_events (kpi, quarter);
create index kpi_events_reversed_by on public.kpi_events (reversed_by);

-- KPI-3: week and quarter are set from happened_at.
create function public.kpi_events_set_period() returns trigger
language plpgsql as $$
begin
  new.week := week_of(new.happened_at);
  new.quarter := quarter_of(new.happened_at);
  return new;
end $$;

-- KPI-2: events are never updated or deleted. A mistake is fixed by a second
-- event with a negative amount.
create function public.kpi_events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'kpi_events rows are never changed. Add a correction instead';
end $$;

create trigger t_period before insert on public.kpi_events for each row execute function public.kpi_events_set_period();
create trigger t_own before insert on public.kpi_events for each row execute function public.set_owner();
create trigger t_append_only before update or delete on public.kpi_events for each row execute function public.kpi_events_append_only();

-- A manual correction is logged (section 13.7).
create function public.kpi_events_audit_manual() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.manual then
    perform write_audit('manual KPI correction', 'kpi_events', new.id,
      jsonb_build_object('kpi', new.kpi, 'amount', new.amount, 'reason', new.reason));
  end if;
  return new;
end $$;

create trigger t_audit after insert on public.kpi_events for each row execute function public.kpi_events_audit_manual();

revoke all on public.kpi_events from anon;
revoke update, delete, truncate, references, trigger on public.kpi_events from authenticated;

create table public.targets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  kpi text not null,
  period text not null check (period in ('week', 'quarter', 'year')),
  target numeric(12,2) not null,
  valid_from date not null,
  valid_to date,
  note text,
  constraint targets_dates_in_order check (valid_to is null or valid_to >= valid_from)
);

create index targets_kpi_period on public.targets (kpi, period, valid_from);

create trigger t_own before insert on public.targets for each row execute function public.set_owner();

revoke all on public.targets from anon;
revoke delete, truncate, references, trigger on public.targets from authenticated;
