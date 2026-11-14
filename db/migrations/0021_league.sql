-- 0021 Lists, the league, touches and signals (sections 10.2 to 10.5, 14.6,
-- 23.4). Tickets P1-37 and P1-38.
--
-- A departure agreed on 14 November 2026 (docs/decisions.md): the league's
-- two halves of 50 are rows in a lists table, each its own page under
-- People, so more lists can be added later. A member points at a list. The
-- three tiers and their cadences within a list stay as section 10.2 has
-- them. list.kind keeps the design's leader and a_star halves for the rules
-- that mention them (23.4).

-- ------------------------------------------------------------------ lists

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  kind text not null default 'other' check (kind in ('leader', 'a_star', 'other')),
  -- Seats are a guide, not a hard limit (LEA-4).
  seats int not null default 50 check (seats > 0),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, key)
);

create trigger t_upd before update on public.lists for each row execute function public.set_updated_at();
create trigger t_own before insert on public.lists for each row execute function public.set_owner();

-- --------------------------------------------------------- league_members

create table public.league_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  person_id uuid not null references public.people (id),
  list_id uuid not null references public.lists (id),
  tier text not null check (tier in ('premier', 'championship', 'league_one')),
  why text,
  active boolean not null default true,
  added_on date not null default current_date,
  added_from text check (added_from in (
    'seed', 'signal', 'referral', 'job_lead', 'a_star_feed', 'placement', 'manual')),
  last_touch_on date,
  next_due_on date,
  missed_cycles int not null default 0,
  jobs_briefed int not null default 0,
  referrals_given int not null default 0,
  intros_made int not null default 0,
  attended_events int not null default 0,
  removed_on date,
  removed_reason text,
  purge_after date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, person_id)
);

create index league_members_list on public.league_members (list_id);
create index league_members_due on public.league_members (next_due_on) where active;

create table public.league_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  member_id uuid not null references public.league_members (id),
  changed_on date not null default current_date,
  from_tier text,
  to_tier text,
  reason text,
  created_at timestamptz not null default now()
);

create index league_history_member on public.league_history (member_id);

-- The days between touches for a tier, from Settings (10.2).
create function public.league_cadence_days(p_tier text) returns int
language sql stable as $$
  select case p_tier
    when 'premier' then league_days_premier
    when 'championship' then league_days_championship
    else league_days_league_one
  end
  from app_settings
$$;

-- LEA-1: next_due_on is last_touch_on plus the tier's days; with no touch
-- yet, added_on plus 7. LEA-6: every tier change writes a history row.
-- Removal sets removed_on and, per 34.5, deletion 12 months later.
create function public.league_members_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.next_due_on := coalesce(new.next_due_on,
      case when new.last_touch_on is null then new.added_on + 7
           else new.last_touch_on + league_cadence_days(new.tier) end);
    return new;
  end if;
  if new.tier is distinct from old.tier then
    insert into league_history (owner_id, member_id, from_tier, to_tier, reason)
    values (new.owner_id, new.id, old.tier, new.tier, new.why);
    if new.last_touch_on is not null then
      new.next_due_on := new.last_touch_on + league_cadence_days(new.tier);
    end if;
  end if;
  if new.active is distinct from old.active then
    if not new.active then
      new.removed_on := coalesce(new.removed_on, current_date);
      new.purge_after := (new.removed_on + interval '12 months')::date;
      insert into league_history (owner_id, member_id, from_tier, to_tier, reason)
      values (new.owner_id, new.id, old.tier, null, coalesce(new.removed_reason, 'removed'));
    else
      new.removed_on := null;
      new.removed_reason := null;
      new.purge_after := null;
      insert into league_history (owner_id, member_id, from_tier, to_tier, reason)
      values (new.owner_id, new.id, null, new.tier, 'back on the list');
    end if;
  end if;
  return new;
end $$;

create trigger t_rules before insert or update on public.league_members
  for each row execute function public.league_members_rules();
create trigger t_upd before update on public.league_members for each row execute function public.set_updated_at();
create trigger t_own before insert on public.league_members for each row execute function public.set_owner();

-- LEA-3: run nightly (P1-47). Adds one missed cycle each time a full cadence
-- window passes with no touch, and pushes next_due_on on by one window.
create function public.league_missed_cycles() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  with moved as (
    update league_members m
    set missed_cycles = missed_cycles + 1,
        next_due_on = next_due_on + league_cadence_days(tier)
    where active and next_due_on + league_cadence_days(tier) <= current_date
    returning 1
  )
  select count(*) into n from moved;
  return n;
end $$;

revoke execute on function public.league_missed_cycles() from public, anon, authenticated;

-- ---------------------------------------------------------------- touches

create table public.touches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  person_id uuid not null references public.people (id),
  touched_on date not null default current_date,
  channel text not null check (channel in ('email', 'linkedin', 'phone', 'meeting', 'event', 'other')),
  kind text not null check (kind in (
    'call', 'coaching', 'meeting', 'event_invite', 'event_attended',
    'message_replied', 'voice_note', 'intro', 'other')),
  source text not null check (source in ('call', 'email', 'calendar', 'event', 'manual')),
  -- calls arrives with P1-36; its foreign key is added then.
  call_id uuid,
  source_url text,
  note text,
  dedup_key text not null unique,
  -- TOU-5: kept for 24 months.
  purge_after date,
  created_at timestamptz not null default now()
);

create index touches_person_date on public.touches (person_id, touched_on desc);
create index touches_call on public.touches (call_id);

-- TOU-4: one touch per person per day per kind. The key says so; a second
-- insert is refused by the unique key, which the app and the write endpoint
-- treat as merged.
create function public.touches_before() returns trigger
language plpgsql as $$
begin
  new.dedup_key := coalesce(nullif(new.dedup_key, ''), format('%s:%s:%s', new.person_id, new.touched_on, new.kind));
  new.purge_after := coalesce(new.purge_after, (new.touched_on + interval '24 months')::date);
  return new;
end $$;

-- LEA-2: a new touch updates last_touch_on, recalculates next_due_on and
-- resets missed_cycles to 0 on the person's league row.
create function public.touches_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update league_members
  set last_touch_on = greatest(coalesce(last_touch_on, new.touched_on), new.touched_on),
      next_due_on = greatest(coalesce(last_touch_on, new.touched_on), new.touched_on) + league_cadence_days(tier),
      missed_cycles = 0
  where person_id = new.person_id and active;
  return new;
end $$;

create trigger t_before before insert on public.touches for each row execute function public.touches_before();
create trigger t_after after insert on public.touches for each row execute function public.touches_after();
create trigger t_own before insert on public.touches for each row execute function public.set_owner();

-- ---------------------------------------------------------------- signals

create table public.signals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  person_id uuid references public.people (id),
  person_name text,
  person_key text,
  company text,
  company_key text,
  title text,
  city text,
  signal_type text not null check (signal_type in (
    'new_role', 'promoted', 'company_raised', 'company_hiring',
    'open_to_work', 'speaker_idea', 'placed_anniversary', 'left_company')),
  strength int not null check (strength between 1 and 3),
  detail text,
  source text not null check (source in ('linkedin_alert', 'alex_leads', 'job_lead', 'call', 'manual')),
  source_url text,
  seen_on date not null default current_date,
  in_icp boolean,
  status text not null default 'new' check (status in ('new', 'actioned', 'added_to_league', 'ignored', 'expired')),
  message_id uuid references public.messages (id),
  dedup_key text not null unique,
  -- SIG-4: expires by type; removed 90 days after expiring or being ignored,
  -- 12 months after being actioned (34.5).
  expires_on date,
  purge_after date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index signals_person_type_seen on public.signals (person_key, signal_type, seen_on);
create index signals_person on public.signals (person_id);
create index signals_status on public.signals (status, seen_on desc);
create index signals_message on public.signals (message_id);

/** Days before a signal of this type expires (10.4). */
create function public.signal_days(p_type text) returns int
language sql immutable as $$
  select case p_type
    when 'new_role' then 90
    when 'promoted' then 90
    when 'company_raised' then 60
    when 'company_hiring' then 45
    when 'open_to_work' then 30
    when 'left_company' then 60
    when 'placed_anniversary' then 30
    when 'speaker_idea' then 90
    else 60
  end
$$;

-- SIG-3: a signal outside the ICP is stored as ignored, so the 30-day
-- duplicate rule still applies. Expiry is set from the type.
create function public.signals_before() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.expires_on := coalesce(new.expires_on, new.seen_on + signal_days(new.signal_type));
    if new.in_icp is false then
      new.status := 'ignored';
    end if;
  end if;
  if new.status is distinct from old.status or tg_op = 'INSERT' then
    new.purge_after := case new.status
      when 'actioned' then (current_date + interval '12 months')::date
      when 'added_to_league' then (current_date + interval '12 months')::date
      when 'ignored' then (current_date + interval '90 days')::date
      when 'expired' then (current_date + interval '90 days')::date
      else null end;
  end if;
  return new;
end $$;

create trigger t_before before insert or update on public.signals for each row execute function public.signals_before();
create trigger t_upd before update on public.signals for each row execute function public.set_updated_at();
create trigger t_own before insert on public.signals for each row execute function public.set_owner();

-- SIG-4: run nightly (P1-47). New signals past their expiry become expired.
create function public.signals_expire() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  with moved as (
    update signals set status = 'expired' where status = 'new' and expires_on < current_date returning 1
  )
  select count(*) into n from moved;
  return n;
end $$;

revoke execute on function public.signals_expire() from public, anon, authenticated;

-- ------------------------------------------------------ do not contact (10.5)

create function public.may_contact(p_person uuid, p_company_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from people where id = p_person and do_not_contact
  ) and not exists (
    select 1 from do_not_contact d
    where d.person_id = p_person
       or (d.scope = 'company' and d.company is not null and lower(d.company) = p_company_key)
  )
$$;

grant execute on function public.may_contact(uuid, text) to authenticated, service_role;

-- Setting do_not_contact on a person removes them from the league, cancels
-- their queued messages and closes their open follow-ups, in the same
-- transaction as the change (10.5).
create function public.people_do_not_contact() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.do_not_contact and not old.do_not_contact then
    update league_members set active = false, removed_reason = 'do_not_contact'
    where person_id = new.id and active;
    update messages set state = 'cancelled'
    where person_id = new.id and state in ('draft', 'queued', 'held');
    update follow_ups set status = 'closed'
    where person_id = new.id and status in ('open', 'snoozed');
    update signals set status = 'ignored' where person_id = new.id and status = 'new';
    perform write_audit('do not contact', 'people', new.id, null);
  end if;
  return new;
end $$;

create trigger t_do_not_contact after update of do_not_contact on public.people
  for each row execute function public.people_do_not_contact();

-- LEA-5, the parts whose tables exist: referrals given and introductions
-- made. jobs_briefed (searches) and attended_events (event_guests) arrive
-- with their tables.
create function public.league_count_referral() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.referred_by_id is not null then
    update league_members set referrals_given = referrals_given + 1 where person_id = new.referred_by_id and active;
  end if;
  return new;
end $$;

create trigger t_league after insert on public.referrals for each row execute function public.league_count_referral();

create function public.league_count_intro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.mentioned_by_id is not null then
    update league_members set intros_made = intros_made + 1 where person_id = new.mentioned_by_id and active;
  end if;
  return new;
end $$;

create trigger t_league after insert on public.wider_leads for each row execute function public.league_count_intro();

-- ------------------------------------------------------------------ grants

revoke all on public.lists, public.league_members, public.league_history, public.touches, public.signals from anon, authenticated;
grant select, insert, update on public.lists, public.league_members, public.touches, public.signals to authenticated;
grant select on public.league_history to authenticated;
grant all on public.lists, public.league_members, public.league_history, public.touches, public.signals to service_role;
grant execute on function public.league_cadence_days(text), public.signal_days(text) to authenticated, service_role;
grant execute on function public.league_missed_cycles(), public.signals_expire() to service_role;
