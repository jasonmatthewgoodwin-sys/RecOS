-- 0033 Searches, candidates, calls, A-star and campaigns (sections 11.1 to
-- 11.5, 30, 31.1, 28.7; P2-01 and P1-36, built on 15 November 2026 for the
-- one-push deploy Mia asked for). RecOS keeps the working layer of a search
-- and a thin list of who is in play. The record of each candidate stays in
-- the CRM: no CV, compensation, note text or transcript lives here (CAN-5).

-- ---------------------------------------------------------------- tables

create table public.searches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  client text not null,
  client_key text not null,
  role text not null,
  function text not null default 'pmm',
  is_pmm boolean generated always as (function = 'pmm') stored,
  level text,
  location text,
  city text,
  country text not null default 'US',
  confidential boolean not null default false,
  share_with_reviewer boolean not null default true,
  crm text check (crm is null or crm in ('jobadder', 'spott')),
  crm_job_ref text,
  crm_url text,
  crm_stage_map jsonb not null default '{}',
  priority text not null default 'active' check (priority in ('focus', 'active', 'maintenance', 'dormant')),
  status text not null default 'open' check (status in ('intake', 'open', 'offer', 'placed', 'lost', 'on_hold', 'closed')),
  opened_on date not null default current_date,
  first_submission_on date,
  placed_on date,
  closed_on date,
  client_contact_id uuid references public.people (id),
  client_cadence text,
  next_client_call timestamptz,
  last_client_contact_on date,
  waiting_on text check (waiting_on is null or waiting_on in ('client', 'candidate', 'desk', 'nobody')),
  next_step text,
  next_step_on date,
  health text not null default 'warm' check (health in ('warm', 'cooling', 'cold')),
  health_reason text,
  forecast_month date,
  confidence int check (confidence is null or confidence between 0 and 100),
  fee_estimate numeric(12,2),
  currency text default 'USD',
  split_note text,
  won_from_job_lead uuid references public.job_leads (id),
  shared_with text,
  n_sourced int not null default 0,
  n_spoken int not null default 0,
  n_submitted int not null default 0,
  n_first_stage int not null default 0,
  n_later_stage int not null default 0,
  n_offer int not null default 0,
  counts_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index searches_status on public.searches (status, priority);
create index searches_client on public.searches (client_key);

create table public.search_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  search_id uuid not null references public.searches (id),
  tab text not null check (tab in ('brief', 'map', 'calibration', 'client_updates', 'interviews', 'offer', 'close_out')),
  title text,
  content text not null default '',
  structured jsonb,
  version int not null default 1,
  created_by text not null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index search_notes_search on public.search_notes (search_id, tab, version desc);

create table public.search_candidates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  search_id uuid not null references public.searches (id),
  person_id uuid not null references public.people (id),
  crm_application_ref text,
  stage text not null check (stage in ('sourced', 'spoken', 'submitted', 'first_stage', 'later_stage', 'offer', 'placed', 'rejected', 'withdrew')),
  stage_changed_on date not null default current_date,
  submitted_on date,
  feedback_received_on date,
  feedback_nudges int not null default 0,
  consent_to_submit boolean not null default false,
  consent_on date,
  next_interview_at timestamptz,
  prep_sent boolean not null default false,
  last_candidate_contact_on date,
  outcome_reason text,
  -- Offer card fields (30.7): status, dates, references, risks.
  offer_status text check (offer_status is null or offer_status in ('expected', 'verbal', 'written', 'accepted', 'declined')),
  decision_due_on date,
  start_on date,
  references_taken int not null default 0,
  references_needed int not null default 2,
  competing_process boolean not null default false,
  risks text,
  would_swing text,
  aftercare_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (search_id, person_id)
);
create index search_candidates_search on public.search_candidates (search_id, stage);
create index search_candidates_person on public.search_candidates (person_id);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  granola_ref text unique,
  granola_url text,
  calendar_ref text,
  title text,
  held_at timestamptz not null,
  minutes int,
  call_type text not null default 'unknown' check (call_type in ('candidate_screen', 'coaching', 'client_update', 'client_intake', 'reference', 'interview_prep', 'debrief', 'internal', 'other', 'unknown')),
  person_id uuid references public.people (id),
  search_id uuid references public.searches (id),
  match_confidence text not null default 'none' check (match_confidence in ('confirmed', 'high', 'low', 'none')),
  w_record boolean not null default false,
  w_cv boolean not null default false,
  w_note boolean not null default false,
  w_on_search boolean not null default false,
  w_follow_up boolean not null default false,
  cv_requested boolean not null default false,
  crm_note_ref text,
  is_new_a_star boolean not null default false,
  skip_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index calls_held on public.calls (held_at desc);
create index calls_search on public.calls (search_id);

create table public.a_star_suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  person_id uuid references public.people (id),
  name text not null,
  title text,
  company text,
  city text,
  linkedin_url text,
  why text,
  week date not null,
  verdict text not null default 'pending' check (verdict in ('pending', 'good', 'not_good')),
  verdict_on date,
  dedup_key text not null unique,
  purge_after date,
  created_at timestamptz not null default now()
);

-- Campaigns (28.7, and Jason's notes of 14 November 2026): the table from
-- 0018 gains the spec-campaign fields, so a campaign can be the step-by-step
-- plan for putting one matched candidate in front of one lead.
alter table public.campaigns
  add column job_lead_id uuid references public.job_leads (id),
  add column candidate_person_id uuid references public.people (id),
  add column steps jsonb not null default '[]',
  add column status text not null default 'planned' check (status in ('planned', 'running', 'done'));

-- Warm specs (31.1): a switch on any person card.
alter table public.people add column warm_spec boolean not null default false;

create trigger t_own before insert on public.searches for each row execute function public.set_owner();
create trigger t_upd before update on public.searches for each row execute function public.set_updated_at();
create trigger t_own before insert on public.search_notes for each row execute function public.set_owner();
create trigger t_upd before update on public.search_notes for each row execute function public.set_updated_at();
create trigger t_own before insert on public.search_candidates for each row execute function public.set_owner();
create trigger t_upd before update on public.search_candidates for each row execute function public.set_updated_at();
create trigger t_own before insert on public.calls for each row execute function public.set_owner();
create trigger t_upd before update on public.calls for each row execute function public.set_updated_at();
create trigger t_own before insert on public.a_star_suggestions for each row execute function public.set_owner();

revoke all on public.searches, public.search_notes, public.search_candidates, public.calls, public.a_star_suggestions from anon;
revoke delete, truncate, references, trigger on public.searches, public.search_notes, public.search_candidates, public.calls, public.a_star_suggestions from authenticated;
grant select, insert, update on public.searches, public.search_notes, public.search_candidates, public.calls to authenticated;
grant select on public.a_star_suggestions to authenticated;

-- ---------------------------------------------------------------- rules

create function public.kpi_once(p_owner uuid, p_kpi text, p_at timestamptz, p_table text, p_id uuid, p_label text, p_pmm boolean) returns void
language sql security definer set search_path = public as $$
  insert into kpi_events (owner_id, kpi, happened_at, source_table, source_id, label, is_pmm)
  values (p_owner, p_kpi, coalesce(p_at, now()), p_table, p_id, left(p_label, 120), p_pmm)
  on conflict (kpi, source_table, source_id) do nothing
$$;
revoke execute on function public.kpi_once(uuid, text, timestamptz, text, uuid, text, boolean) from public, anon, authenticated;

-- SEA-1, SEA-2, SEA-3.
create function public.searches_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.won_from_job_lead is not null and new.function = 'pmm' then
    perform kpi_once(new.owner_id, 'jobs_won', now(), 'searches', new.id, 'Won: ' || new.role || ' at ' || new.client, true);
  end if;
  if new.first_submission_on is not null and (tg_op = 'INSERT' or old.first_submission_on is null) then
    perform kpi_once(new.owner_id, 'shortlists', new.first_submission_on::timestamp at time zone 'Europe/London', 'searches', new.id, 'Shortlist: ' || new.role, new.function = 'pmm');
  end if;
  if new.status = 'placed' and (tg_op = 'INSERT' or old.status <> 'placed') then
    new.placed_on := coalesce(new.placed_on, current_date);
    perform kpi_once(new.owner_id, 'placements', new.placed_on::timestamp at time zone 'Europe/London', 'searches', new.id, 'Placed: ' || new.role || ' at ' || new.client, new.function = 'pmm');
    -- Two testimonial requests: the client and the candidate (SEA-3).
    insert into content_items (owner_id, kind, topic, topic_key, status, search_id, hook)
    values (new.owner_id, 'testimonial', 'Testimonial from ' || case when new.confidential then 'the client' else new.client end, 'testimonial client ' || new.id::text, 'draft', new.id, 'Would you write a few lines on how the search went?'),
           (new.owner_id, 'testimonial', 'Testimonial from the candidate, ' || new.role, 'testimonial candidate ' || new.id::text, 'draft', new.id, 'Would you write a few lines on how we worked together?')
    on conflict do nothing;
  end if;
  if new.status in ('lost', 'closed') and (tg_op = 'INSERT' or old.status not in ('lost', 'closed')) then
    new.closed_on := coalesce(new.closed_on, current_date);
  end if;
  return new;
end $$;
create trigger t_rules before insert or update on public.searches for each row execute function public.searches_rules();

-- CAN-1 to CAN-4, and the offer accepted path (30.7).
create function public.search_candidates_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s searches%rowtype;
  who text;
begin
  select * into s from searches where id = new.search_id;
  if new.stage = 'submitted' and not new.consent_to_submit then
    raise exception 'Agreed to be put forward must be on first';
  end if;
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    new.stage_changed_on := current_date;
  end if;
  if new.consent_to_submit and new.consent_on is null then new.consent_on := current_date; end if;
  if new.stage = 'submitted' and (tg_op = 'INSERT' or old.stage <> 'submitted') then
    new.submitted_on := coalesce(new.submitted_on, current_date);
    update searches set first_submission_on = coalesce(first_submission_on, new.submitted_on) where id = new.search_id;
  end if;
  if new.stage = 'first_stage' and (tg_op = 'INSERT' or old.stage <> 'first_stage') then
    perform kpi_once(new.owner_id, 'first_interviews', now(), 'search_candidates', new.id, 'First interview: ' || s.role, s.function = 'pmm');
  end if;
  if new.stage = 'offer' and (tg_op = 'INSERT' or old.stage <> 'offer') then
    perform kpi_once(new.owner_id, 'offers', now(), 'search_candidates', new.id, 'Offer: ' || s.role, s.function = 'pmm');
    new.offer_status := coalesce(new.offer_status, 'expected');
  end if;
  if new.offer_status = 'accepted' and (tg_op = 'INSERT' or old.offer_status is distinct from 'accepted') then
    new.stage := 'placed';
  end if;
  if new.stage = 'placed' and (tg_op = 'INSERT' or old.stage <> 'placed') then
    new.aftercare_on := coalesce(new.aftercare_on, coalesce(new.start_on, current_date) + 30);
    update searches set status = 'placed' where id = new.search_id and status <> 'placed';
  end if;
  if new.stage in ('rejected', 'withdrew') and (tg_op = 'INSERT' or old.stage not in ('rejected', 'withdrew')) then
    select display_name into who from people where id = new.person_id;
    insert into follow_ups (owner_id, person_id, person_name, company, kind, reason, source, direction, due_on, dedup_key)
    values (new.owner_id, new.person_id, coalesce(who, 'The candidate'), case when s.confidential then null else s.client end, 'rejection',
      case when new.stage = 'rejected' then 'Tell them it is a no, kindly' else 'Thank them and keep the door open' end || coalesce(': ' || new.outcome_reason, ''),
      'rule', 'owed', add_working_days(current_date, 1), 'rejection:' || new.id::text)
    on conflict (dedup_key) do nothing;
  end if;
  return new;
end $$;
create trigger t_rules before insert or update on public.search_candidates for each row execute function public.search_candidates_rules();

-- A first call with someone marked good in the A-star feed counts once.
create function public.calls_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_new_a_star and (tg_op = 'INSERT' or not old.is_new_a_star) then
    perform kpi_once(new.owner_id, 'new_a_star', new.held_at, 'calls', new.id, 'New A-star call', true);
  end if;
  return new;
end $$;
create trigger t_rules before insert or update on public.calls for each row execute function public.calls_rules();

-- The owner's verdict on an A-star suggestion (31.1): good makes the person
-- and puts them in the A-star half of the league at League One.
create function public.a_star_verdict(p_id uuid, p_verdict text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s a_star_suggestions%rowtype;
  pid uuid;
  lid uuid;
begin
  if app_role() <> 'owner' then raise exception 'Only the owner can do that'; end if;
  if p_verdict not in ('good', 'not_good') then raise exception 'A verdict is good or not_good'; end if;
  select * into s from a_star_suggestions where id = p_id;
  if s.id is null then raise exception 'No such suggestion'; end if;
  if p_verdict = 'not_good' then
    update a_star_suggestions set verdict = 'not_good', verdict_on = current_date, purge_after = current_date + 365 where id = p_id;
    return null;
  end if;
  pid := s.person_id;
  if pid is null and nullif(s.linkedin_url, '') is not null then
    select id into pid from people where linkedin_url = s.linkedin_url limit 1;
  end if;
  if pid is null then pid := aw_find_person(s.name, s.company); end if;
  if pid is null then
    insert into people (owner_id, display_name, name_key, display_title, display_company, company_key, city, kind, linkedin_url, refreshed_on)
    values (s.owner_id, s.name, norm_text(s.name), s.title, s.company, norm_company(s.company), s.city, 'candidate', s.linkedin_url, current_date)
    returning id into pid;
  end if;
  select id into lid from lists where kind = 'a_star' and not archived order by position limit 1;
  if lid is not null and not exists (select 1 from league_members where person_id = pid and list_id = lid) then
    insert into league_members (owner_id, person_id, list_id, tier, why, added_from)
    values (s.owner_id, pid, lid, 'league_one', coalesce(s.why, 'From the A-star feed'), 'a_star_feed');
  end if;
  update a_star_suggestions set verdict = 'good', verdict_on = current_date, person_id = pid where id = p_id;
  return pid;
end $$;
revoke execute on function public.a_star_verdict(uuid, text) from public, anon;
grant execute on function public.a_star_verdict(uuid, text) to authenticated;

-- ---------------------------------------------------------------- the write contract: call, search_counts, a_star_suggestion

create function public.aw_find_search(d jsonb) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  sid uuid;
begin
  if nullif(d ->> 'search_id', '') is not null then
    select id into sid from searches where id = (d ->> 'search_id')::uuid;
    return sid;
  end if;
  if norm_company(d ->> 'search_client') is null then return null; end if;
  select id into sid from searches
  where client_key = norm_company(d ->> 'search_client')
    and (nullif(d ->> 'search_role', '') is null or norm_role(role) = norm_role(d ->> 'search_role'))
    and status in ('intake', 'open', 'offer')
  order by opened_on desc limit 1;
  return sid;
end $$;

create function public.aw_call(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  was calls%rowtype;
  pid uuid;
  sid uuid;
  conf text := coalesce(d ->> 'match_confidence', 'none');
  ctype text := coalesce(d ->> 'call_type', 'unknown');
  held timestamptz;
  id uuid;
  tick boolean;
begin
  begin
    held := (d ->> 'held_at')::timestamptz;
  exception when others then held := null; end;
  if held is null then return aw_reject('invalid', 'A call needs held_at.', 'held_at'); end if;
  if ctype not in ('candidate_screen', 'coaching', 'client_update', 'client_intake', 'reference', 'interview_prep', 'debrief', 'internal', 'other', 'unknown') then
    return aw_reject('invalid', 'Unknown call_type.', 'call_type');
  end if;
  if conf not in ('confirmed', 'high', 'low', 'none') then return aw_reject('invalid', 'match_confidence is confirmed, high, low or none.', 'match_confidence'); end if;
  pid := aw_find_person(d ->> 'person_name', d ->> 'company');
  sid := aw_find_search(d);
  if sid is null then conf := 'none'; end if;
  if nullif(d ->> 'granola_ref', '') is not null then
    select * into was from calls where granola_ref = d ->> 'granola_ref';
  end if;
  if was.id is not null then
    -- A second write-up for the same call updates the ticks and the match; it never doubles the row.
    update calls set
      person_id = coalesce(pid, person_id), search_id = coalesce(sid, search_id), match_confidence = case when sid is not null then conf else match_confidence end,
      w_record = w_record or coalesce((d ->> 'w_record')::boolean, false), w_cv = w_cv or coalesce((d ->> 'w_cv')::boolean, false),
      w_note = w_note or coalesce((d ->> 'w_note')::boolean, false), w_on_search = w_on_search or coalesce((d ->> 'w_on_search')::boolean, false),
      w_follow_up = w_follow_up or coalesce((d ->> 'w_follow_up')::boolean, false), cv_requested = cv_requested or coalesce((d ->> 'cv_requested')::boolean, false),
      crm_note_ref = coalesce(d ->> 'crm_note_ref', crm_note_ref), is_new_a_star = is_new_a_star or coalesce((d ->> 'is_new_a_star')::boolean, false),
      skip_reason = coalesce(d ->> 'skip_reason', skip_reason), minutes = coalesce((d ->> 'minutes')::int, minutes), title = coalesce(d ->> 'title', title)
    where calls.id = was.id;
    return jsonb_build_object('outcome', 'merged', 'id', was.id);
  end if;
  insert into calls (owner_id, granola_ref, granola_url, calendar_ref, title, held_at, minutes, call_type, person_id, search_id, match_confidence,
    w_record, w_cv, w_note, w_on_search, w_follow_up, cv_requested, crm_note_ref, is_new_a_star, skip_reason)
  values (aw_owner(), nullif(d ->> 'granola_ref', ''), d ->> 'granola_url', d ->> 'calendar_ref', d ->> 'title', held, (d ->> 'minutes')::int, ctype, pid, sid, conf,
    coalesce((d ->> 'w_record')::boolean, false), coalesce((d ->> 'w_cv')::boolean, false), coalesce((d ->> 'w_note')::boolean, false), coalesce((d ->> 'w_on_search')::boolean, false),
    coalesce((d ->> 'w_follow_up')::boolean, false), coalesce((d ->> 'cv_requested')::boolean, false), d ->> 'crm_note_ref', coalesce((d ->> 'is_new_a_star')::boolean, false), d ->> 'skip_reason')
  returning calls.id into id;
  -- A call the agent could not place on a search needs confirming (30.5).
  tick := ctype in ('candidate_screen', 'interview_prep', 'debrief') and conf in ('low', 'none');
  if tick then
    perform aw_inbox(p_run, p_agent, 'call_writeup', format('Which search was %s on?', coalesce(d ->> 'person_name', 'this call')),
      jsonb_build_object('why', 'The call notes did not say. Confirm the search so the write-up lands in the right place.', 'suggested_action', 'Confirm', 'company', d ->> 'company', 'source', 'granola', 'source_url', d ->> 'granola_url'),
      format('call_writeup:confirm:%s', id), 30, pid, 'calls', id, null);
  end if;
  return jsonb_build_object('outcome', 'created', 'id', id, 'note', case when tick then 'Needs the search confirming' else null end);
end $$;

create function public.aw_search_counts(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s searches%rowtype;
begin
  select * into s from searches where id = aw_find_search(d);
  if s.id is null then return aw_reject('not_found', 'No open search for that client and role.', 'search_client'); end if;
  -- SEA-4: a search at offer is never changed by an agent.
  if s.status = 'offer' then return aw_reject('policy_refused', 'That search is at offer. Counts are left to the owner.', 'search_id'); end if;
  if d ->> 'waiting_on' is not null and d ->> 'waiting_on' not in ('client', 'candidate', 'desk', 'nobody') then return aw_reject('invalid', 'waiting_on is client, candidate, desk or nobody.', 'waiting_on'); end if;
  update searches set
    n_sourced = coalesce((d ->> 'n_sourced')::int, n_sourced), n_spoken = coalesce((d ->> 'n_spoken')::int, n_spoken), n_submitted = coalesce((d ->> 'n_submitted')::int, n_submitted),
    n_first_stage = coalesce((d ->> 'n_first_stage')::int, n_first_stage), n_later_stage = coalesce((d ->> 'n_later_stage')::int, n_later_stage), n_offer = coalesce((d ->> 'n_offer')::int, n_offer),
    last_client_contact_on = coalesce((d ->> 'last_client_contact_on')::date, last_client_contact_on), waiting_on = coalesce(d ->> 'waiting_on', waiting_on),
    counts_refreshed_at = now()
  where id = s.id;
  return jsonb_build_object('outcome', 'merged', 'id', s.id);
end $$;

create function public.aw_a_star(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  key text;
  was uuid;
  id uuid;
  wk date;
begin
  if norm_text(d ->> 'name') is null then return aw_reject('invalid', 'A suggestion needs a name.', 'name'); end if;
  key := case when nullif(d ->> 'linkedin_url', '') is not null then 'a_star:' || lower(btrim(d ->> 'linkedin_url')) else 'a_star:' || norm_text(d ->> 'name') || ':' || coalesce(norm_company(d ->> 'company'), '') end;
  begin
    wk := coalesce((d ->> 'week')::date, week_of(now()));
  exception when others then wk := week_of(now()); end;
  select a.id into was from a_star_suggestions a where a.dedup_key = key and a.created_at >= now() - interval '12 months';
  if was is not null then return jsonb_build_object('outcome', 'rejected', 'code', 'duplicate', 'id', was, 'field', 'name', 'message', 'Suggested in the last 12 months.'); end if;
  insert into a_star_suggestions (owner_id, person_id, name, title, company, city, linkedin_url, why, week, dedup_key)
  values (aw_owner(), aw_find_person(d ->> 'name', d ->> 'company'), btrim(d ->> 'name'), d ->> 'title', d ->> 'company', d ->> 'city', d ->> 'linkedin_url', d ->> 'why', wk, key)
  returning a_star_suggestions.id into id;
  return jsonb_build_object('outcome', 'created', 'id', id);
end $$;
revoke execute on function public.aw_find_search(jsonb), public.aw_call(uuid, text, jsonb), public.aw_search_counts(uuid, text, jsonb), public.aw_a_star(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.aw_allowed_fields(p_kind text) returns text[]
language sql immutable as $$
  select case p_kind
    when 'inbox_item' then array['type', 'title', 'why', 'suggested_action', 'draft', 'source', 'source_url', 'links', 'rank', 'company', 'role', 'location', 'person_name']
    when 'job_lead' then array['company', 'role', 'function', 'level', 'location', 'city', 'country', 'source', 'source_url', 'poster_name', 'poster_title', 'poster_profile_url', 'company_size', 'fit_score', 'fit_reason', 'existing_client', 'spec_draft', 'why', 'matched', 'uk_to_us']
    when 'wider_lead' then array['company', 'role', 'function', 'country', 'location', 'source', 'mentioned_by_name', 'existing_client', 'notes', 'why']
    when 'signal' then array['person_name', 'company', 'title', 'city', 'signal_type', 'strength', 'detail', 'source', 'source_url', 'seen_on', 'in_icp', 'draft', 'uk_to_us']
    when 'person' then array['display_name', 'display_title', 'display_company', 'city', 'kind', 'crm', 'crm_ref', 'crm_url', 'linkedin_url', 'email', 'in_crm', 'profile_summary']
    when 'follow_up' then array['person_name', 'company', 'kind', 'reason', 'source', 'source_url', 'direction', 'due_on', 'call_ref', 'thread_ref', 'draft']
    when 'referral' then array['referred_name', 'referred_company', 'referred_title', 'referred_by_name', 'context', 'kind', 'call_ref']
    when 'touch' then array['person_name', 'company', 'touched_on', 'channel', 'kind', 'source', 'source_url', 'note']
    when 'event_idea' then array['title', 'why', 'source', 'source_url']
    when 'kpi_event' then array['kpi', 'source_table', 'source_ref', 'label', 'is_pmm', 'happened_at']
    when 'calendar_today' then array['events']
    when 'coaching_answers' then array['person_name', 'held_at', 'q_interviewed_where', 'q_who_else_looking', 'q_how_they_hire', 'q_events_rated', 'advice_given', 'referrals_count', 'leads_count']
    when 'message' then array['type', 'channel', 'person_name', 'to_name', 'subject', 'body', 'level']
    when 'content_draft' then array['kind', 'run_source', 'angle', 'topic', 'hook', 'body', 'close_line', 'hashtags', 'data_point', 'data_point_url', 'prompted_by', 'prompted_by_url']
    when 'outreach_step' then array['lead_id', 'company', 'role', 'step', 'on', 'note', 'outcome']
    when 'call' then array['granola_ref', 'granola_url', 'calendar_ref', 'title', 'held_at', 'minutes', 'call_type', 'person_name', 'company', 'search_client', 'search_role', 'match_confidence', 'w_record', 'w_cv', 'w_note', 'w_on_search', 'w_follow_up', 'cv_requested', 'crm_note_ref', 'is_new_a_star', 'skip_reason']
    when 'search_counts' then array['search_id', 'search_client', 'search_role', 'n_sourced', 'n_spoken', 'n_submitted', 'n_first_stage', 'n_later_stage', 'n_offer', 'last_client_contact_on', 'waiting_on']
    when 'a_star_suggestion' then array['name', 'title', 'company', 'city', 'linkedin_url', 'why', 'week']
    when 'data_point' then array['statement', 'value', 'as_of', 'category', 'source_name', 'source_url']
    else null end
$$;

create or replace function public.agent_write(p_run uuid, p_records jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r agent_runs%rowtype;
  rec jsonb;
  i int := 0;
  kind text;
  d jsonb;
  extra text[];
  res jsonb;
  results jsonb := '[]';
  created int := 0;
  merged int := 0;
  rejected int := 0;
begin
  select * into r from agent_runs where id = p_run;
  if r.id is null then raise exception 'not_found: no such run'; end if;
  if r.status <> 'running' then raise exception 'wrong_state: that run has finished'; end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 or jsonb_array_length(p_records) > 200 then
    raise exception 'invalid: records is a list of 1 to 200';
  end if;

  for rec in select * from jsonb_array_elements(p_records) loop
    kind := rec ->> 'kind';
    d := coalesce(rec -> 'data', '{}');
    if kind is null or aw_allowed_fields(kind) is null then
      res := case when kind in ('call', 'search_counts', 'a_star_suggestion')
        then aw_reject('invalid', format('%s arrives in a later phase. Not stored.', kind), 'kind')
        else aw_reject('invalid', 'Unknown kind.', 'kind') end;
    elsif not aw_may_send(r.agent, kind) then
      res := aw_reject('not_allowed', format('%s may not send %s.', r.agent, kind), 'kind');
    elsif jsonb_typeof(d) <> 'object' then
      res := aw_reject('invalid', 'data must be an object.', 'data');
    else
      select array_agg(k) into extra from jsonb_object_keys(d) k where k <> all(aw_allowed_fields(kind));
      if extra is not null then
        res := aw_reject('invalid', format('Unknown field %s. It was refused, not ignored.', extra[1]), extra[1]);
      else
        begin
          res := case kind
            when 'inbox_item' then aw_inbox_item(p_run, r.agent, d)
            when 'job_lead' then aw_job_lead(p_run, r.agent, d)
            when 'wider_lead' then aw_wider_lead(p_run, r.agent, d)
            when 'signal' then aw_signal(p_run, r.agent, d)
            when 'person' then aw_person(p_run, r.agent, d)
            when 'follow_up' then aw_follow_up(p_run, r.agent, d)
            when 'referral' then aw_referral(p_run, r.agent, d)
            when 'touch' then aw_touch(p_run, r.agent, d)
            when 'event_idea' then aw_inbox_item(p_run, r.agent, d, 'event_idea')
            when 'kpi_event' then aw_kpi_event(p_run, r.agent, d)
            when 'calendar_today' then aw_calendar_today(p_run, r.agent, d)
            when 'coaching_answers' then aw_coaching_answers(p_run, r.agent, d)
            when 'message' then aw_message(p_run, r.agent, d)
            when 'content_draft' then aw_content_draft(p_run, r.agent, d)
            when 'data_point' then aw_data_point(p_run, r.agent, d)
            when 'outreach_step' then aw_outreach_step(p_run, r.agent, d)
            when 'call' then aw_call(p_run, r.agent, d)
            when 'search_counts' then aw_search_counts(p_run, r.agent, d)
            when 'a_star_suggestion' then aw_a_star(p_run, r.agent, d)
            end;
          -- UK to US (Jason, 14 November 2026): the agent flags a lead or a signal; the flag lands on the row it made or merged.
          if kind = 'job_lead' and coalesce((d ->> 'uk_to_us')::boolean, false) and (res ->> 'id') is not null then
            update job_leads set uk_to_us = true where id = (res ->> 'id')::uuid;
          end if;
          if kind = 'signal' and coalesce((d ->> 'uk_to_us')::boolean, false) and (res ->> 'id') is not null then
            update signals set uk_to_us = true where id = (res ->> 'id')::uuid;
          end if;
        exception when others then
          res := aw_reject('failed', left(sqlerrm, 200));
        end;
      end if;
    end if;
    results := results || (jsonb_build_object('index', i) || res);
    case res ->> 'outcome'
      when 'created' then created := created + 1;
      when 'merged' then merged := merged + 1;
      else rejected := rejected + 1;
    end case;
    i := i + 1;
  end loop;

  update agent_runs set items_created = items_created + created, items_merged = items_merged + merged, items_rejected = items_rejected + rejected
  where id = p_run;
  return jsonb_build_object('results', results, 'created', created, 'merged', merged, 'rejected', rejected);
end $$;

create or replace function public.agent_context(p_agent text, p_want text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  w text;
  out jsonb := '{}';
  allowed text[];
begin
  allowed := case p_agent
    when 'a1_review' then array['searches', 'kpis', 'dnc']
    when 'a2_content' then array['topic_keys', 'sources', 'dnc']
    when 'a3_jobs' then array['pool', 'job_keys', 'accounts', 'dnc']
    when 'a4_signals' then array['league', 'accounts', 'dnc']
    when 'a5_followups' then array['searches', 'league', 'offline', 'dnc']
    when 'a6_calls' then array['searches', 'dnc']
    when 'a7_events' then array['dnc']
    else array[]::text[] end;
  foreach w in array coalesce(p_want, array[]::text[]) loop
    if w <> all(allowed) then
      raise exception 'not_allowed: % may not ask for %', p_agent, w;
    end if;
    out := out || case w
      when 'searches' then jsonb_build_object('searches', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'client', case when confidential then 'Confidential' else client end, 'client_key', client_key, 'role', role, 'role_key', norm_role(role), 'crm_job_ref', crm_job_ref, 'priority', priority, 'status', status, 'waiting_on', waiting_on) order by priority, opened_on)
        from searches where status in ('intake', 'open', 'offer')), '[]'))
      when 'pool' then jsonb_build_object('pool', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'name', display_name, 'title', display_title, 'company', display_company, 'city', city, 'crm_url', crm_url))
        from people where kind = 'candidate' and not do_not_contact), '[]'))
      when 'league' then jsonb_build_object('league', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'title', p.display_title, 'company', p.display_company, 'tier', m.tier, 'last_touch_on', m.last_touch_on, 'linkedin_url', p.linkedin_url, 'profile_summary', p.profile_summary, 'profile_pulled_at', p.profile_pulled_at))
        from league_members m join people p on p.id = m.person_id where m.active), '[]'))
      when 'job_keys' then jsonb_build_object('job_keys', coalesce((
        select jsonb_agg(jsonb_build_object('company_key', company_key, 'role_key', role_key))
        from job_leads where last_seen_on >= current_date - 45), '[]'))
      when 'topic_keys' then jsonb_build_object('topic_keys', coalesce((
        select jsonb_agg(distinct topic_key) from content_items where status <> 'binned' and created_at >= now() - interval '56 days'), '[]'))
      when 'sources' then jsonb_build_object('sources', coalesce((
        select jsonb_agg(jsonb_build_object('run_source', run_source, 'name', name, 'url', url, 'kind', kind))
        from content_sources where active), '[]'))
      when 'accounts' then jsonb_build_object('accounts', coalesce((
        select jsonb_agg(jsonb_build_object('company', company, 'company_key', company_key, 'kind', kind, 'colleague', colleague) order by company)
        from accounts where active), '[]'))
      when 'dnc' then jsonb_build_object('dnc', coalesce((
        select jsonb_agg(jsonb_build_object('name', name, 'company', company, 'scope', scope, 'email_hash', email_hash, 'profile_url', profile_url))
        from do_not_contact), '[]'))
      when 'offline' then jsonb_build_object('offline', coalesce((
        select jsonb_agg(dedup_key) from follow_ups where status = 'handled_offline'), '[]'))
      when 'kpis' then jsonb_build_object('kpis', jsonb_build_object(
        'week', week_of(now()) - 7,
        'lines', coalesce((select jsonb_agg(jsonb_build_object('kpi', kpi, 'total', total, 'target', target, 'hit', hit, 'pmm_total', pmm_total, 'pmm_hit', pmm_hit))
          from kpi_week_view where week = week_of(now()) - 7), '[]'),
        'outputs', coalesce((select jsonb_agg(jsonb_build_object('kpi', kpi, 'total', total)) from kpi_output_week_view where week = week_of(now()) - 7), '[]'),
        'follow_ups', (select jsonb_build_object('completed', completed, 'on_time', on_time) from followups_week_view where week = week_of(now()) - 7),
        'review', (select jsonb_build_object('learned', learned, 'changes', changes, 'plan', plan) from weekly_reviews where week = week_of(now()) - 7)))
      else '{}'::jsonb end;
  end loop;
  return out;
end $$;
