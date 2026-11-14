-- 0018 Business development tables (section 9): job_leads, coaching_sessions,
-- referrals, wider_leads, campaigns, target_companies. Ticket P1-18.
--
-- call_id columns point at calls, and search_id columns at searches. Those
-- tables arrive later (P1-36, P2-01); their foreign keys are added then, as
-- 0009 did for follow_ups. The KPI triggers for these tables are in 0019.
-- REF-3 (added_to_league creates a league row) arrives with league_members.

-- A date n working days after d, Monday to Friday. Public holidays are not
-- modelled (section 7.3).
create function public.add_working_days(d date, n int) returns date
language sql immutable as $$
  select g::date
  from generate_series(d + 1, d + n * 2 + 7, interval '1 day') g
  where extract(isodow from g) < 6
  offset greatest(n, 1) - 1
  limit 1
$$;

-- ------------------------------------------------------------ job_leads (9.1)

create table public.job_leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  company text not null,
  company_key text not null,
  role text not null,
  role_key text not null,
  function text not null default 'pmm' check (function in (
    'pmm', 'marketing', 'sales', 'customer_success', 'revops', 'creative', 'operating_partner', 'other')),
  level text check (level in (
    'ic', 'senior', 'principal', 'manager', 'director', 'senior_director', 'head', 'vp', 'cmo', 'unknown')),
  location text,
  city text,
  country text not null default 'US' check (country in ('US', 'UK', 'other')),
  sources text[] not null default '{}',
  source_urls text[] not null default '{}',
  poster_name text,
  poster_title text,
  poster_profile_url text,
  hiring_manager_id uuid references public.people (id),
  company_size text,
  fit_score int check (fit_score between 0 and 100),
  fit_reason text,
  existing_client boolean not null default false,
  stage text not null default 'new' check (stage in (
    'new', 'chased', 'replied', 'meeting_booked', 'job_won', 'dead', 'passed')),
  dead_reason text check (dead_reason in (
    'no_reply', 'filled', 'other_agency', 'in_house', 'not_icp', 'expired', 'other')),
  -- Up to 3 entries of {person_id, name, reason}. Names only.
  matched jsonb not null default '[]',
  spec_message_id uuid references public.messages (id),
  first_seen_on date not null default current_date,
  last_seen_on date not null default current_date,
  chased_on date,
  replied_on date,
  meeting_on date,
  won_on date,
  search_id uuid,
  wider_lead_id uuid,
  purge_after date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, company_key, role_key),
  -- JOB-3: a won job is a search.
  constraint job_leads_won_needs_search check (stage <> 'job_won' or search_id is not null),
  -- JOB-4: a dead lead says why.
  constraint job_leads_dead_needs_reason check (stage <> 'dead' or dead_reason is not null),
  constraint job_leads_matched_is_short_list check (jsonb_typeof(matched) = 'array' and jsonb_array_length(matched) <= 3),
  constraint job_leads_seen_in_order check (last_seen_on >= first_seen_on)
);

create index job_leads_stage on public.job_leads (stage, last_seen_on);
create index job_leads_hiring_manager on public.job_leads (hiring_manager_id);
create index job_leads_spec_message on public.job_leads (spec_message_id);
create index job_leads_search on public.job_leads (search_id);
create index job_leads_wider_lead on public.job_leads (wider_lead_id);

-- Stage dates are set the first time a stage is reached and never cleared,
-- so a lead moved back and forward keeps its history (JOB-1).
create function public.job_leads_stage_dates() returns trigger
language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    if new.stage = 'chased' then
      new.chased_on := coalesce(new.chased_on, current_date);
    elsif new.stage = 'replied' then
      new.replied_on := coalesce(new.replied_on, current_date);
    elsif new.stage = 'job_won' then
      new.won_on := coalesce(new.won_on, current_date);
    elsif new.stage = 'dead' then
      -- Section 34.5: deleted 12 months after becoming dead.
      new.purge_after := (current_date + interval '12 months')::date;
    end if;
    if old.stage = 'dead' and new.stage <> 'dead' then
      new.purge_after := null;
      new.dead_reason := null;
    end if;
  end if;
  return new;
end $$;

create trigger t_stage before update on public.job_leads for each row execute function public.job_leads_stage_dates();
create trigger t_upd before update on public.job_leads for each row execute function public.set_updated_at();
create trigger t_own before insert on public.job_leads for each row execute function public.set_owner();

-- ---------------------------------------------------- coaching_sessions (9.2)

create table public.coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  person_id uuid not null references public.people (id),
  call_id uuid,
  booked_for timestamptz,
  held_at timestamptz,
  source text check (source in ('inbound', 'open_to_work', 'league', 'referral', 'other')),
  status text not null default 'booked' check (status in ('booked', 'held', 'no_show', 'cancelled')),
  -- COA-3: filled by the Call-to-CRM agent. Empty means not asked.
  -- COA-4: cleared after 12 months by the retention job.
  q_interviewed_where text,
  q_who_else_looking text,
  q_how_they_hire text,
  q_events_rated text,
  advice_given text,
  referrals_count int not null default 0 check (referrals_count >= 0),
  leads_count int not null default 0 check (leads_count >= 0),
  followed_up boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coaching_sessions_person on public.coaching_sessions (person_id);
create index coaching_sessions_call on public.coaching_sessions (call_id);
create index coaching_sessions_status on public.coaching_sessions (status, held_at);

-- COA-2: held records when, if the app did not say.
create function public.coaching_sessions_held() returns trigger
language plpgsql as $$
begin
  if new.status = 'held' and new.held_at is null then
    new.held_at := coalesce(new.booked_for, now());
  end if;
  return new;
end $$;

create trigger t_held before insert or update on public.coaching_sessions for each row execute function public.coaching_sessions_held();
create trigger t_upd before update on public.coaching_sessions for each row execute function public.set_updated_at();
create trigger t_own before insert on public.coaching_sessions for each row execute function public.set_owner();

-- ------------------------------------------------------------ referrals (9.3)

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  referred_name text not null,
  referred_company text,
  referred_title text,
  referred_person_id uuid references public.people (id),
  referred_by_id uuid references public.people (id),
  referred_by_name text not null,
  context text,
  kind text not null default 'person' check (kind in ('person', 'company', 'job')),
  call_id uuid,
  stage text not null default 'new' check (stage in (
    'new', 'contacted', 'spoken', 'added_to_league', 'not_relevant')),
  thanked boolean not null default false,
  received_on date not null default current_date,
  contacted_on date,
  dedup_key text not null unique,
  -- Section 34.5: deleted 24 months after received.
  purge_after date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index referrals_referred_person on public.referrals (referred_person_id);
create index referrals_referred_by on public.referrals (referred_by_id);
create index referrals_call on public.referrals (call_id);
create index referrals_stage on public.referrals (stage, received_on);

create function public.referrals_received() returns trigger
language plpgsql as $$
begin
  new.purge_after := coalesce(new.purge_after, (new.received_on + interval '24 months')::date);
  return new;
end $$;

-- REF-2: contacting the referred person owes the referrer a thank-you, due in
-- two working days. Once per referral: the follow-up key is the referral id.
create function public.referrals_contacted() returns trigger
language plpgsql as $$
begin
  if new.stage is distinct from old.stage and new.stage = 'contacted' then
    new.contacted_on := coalesce(new.contacted_on, current_date);
    insert into public.follow_ups (owner_id, person_id, person_name, kind, reason, source, due_on, dedup_key)
    values (new.owner_id, new.referred_by_id, new.referred_by_name, 'referral_thanks',
      format('Thank them for the introduction to %s', new.referred_name),
      'rule', public.add_working_days(current_date, 2), 'referral_thanks:' || new.id)
    on conflict (dedup_key) do nothing;
  end if;
  return new;
end $$;

create trigger t_received before insert on public.referrals for each row execute function public.referrals_received();
create trigger t_contacted before update on public.referrals for each row execute function public.referrals_contacted();
create trigger t_upd before update on public.referrals for each row execute function public.set_updated_at();
create trigger t_own before insert on public.referrals for each row execute function public.set_owner();

-- ---------------------------------------------------------- wider_leads (9.4)

create table public.wider_leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  company text not null,
  role text,
  function text not null check (function in (
    'pmm', 'marketing', 'sales', 'customer_success', 'revops', 'creative', 'operating_partner', 'other')),
  country text not null check (country in ('US', 'UK', 'other')),
  location text,
  source text not null check (source in (
    'client_call', 'placement', 'coaching', 'league_call', 'alex_leads', 'uk_client', 'job_post', 'other')),
  mentioned_by_id uuid references public.people (id),
  mentioned_by_name text,
  call_id uuid,
  job_lead_id uuid references public.job_leads (id),
  existing_client boolean not null default false,
  -- WID-4: a colleague's name as typed. No colleague directory.
  passed_to text,
  passed_on date,
  -- WID-2: must be filled before the introduction draft can be approved.
  split_note text,
  status text not null default 'spotted' check (status in (
    'spotted', 'passed', 'meeting_booked', 'job_won', 'placed', 'not_pursued')),
  intro_message_id uuid references public.messages (id),
  fee_share numeric(12,2),
  currency text default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- WID-1: passing needs someone to pass to.
  constraint wider_leads_passed_needs_colleague check (
    status not in ('passed', 'meeting_booked', 'job_won', 'placed') or nullif(btrim(passed_to), '') is not null)
);

create index wider_leads_status on public.wider_leads (status, created_at desc);
create index wider_leads_mentioned_by on public.wider_leads (mentioned_by_id);
create index wider_leads_call on public.wider_leads (call_id);
create index wider_leads_job_lead on public.wider_leads (job_lead_id);
create index wider_leads_intro_message on public.wider_leads (intro_message_id);

alter table public.job_leads
  add constraint job_leads_wider_lead_id_fkey foreign key (wider_lead_id) references public.wider_leads (id);

create function public.wider_leads_passed() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status = 'passed' then
    new.passed_on := coalesce(new.passed_on, current_date);
  end if;
  return new;
end $$;

create trigger t_passed before update on public.wider_leads for each row execute function public.wider_leads_passed();
create trigger t_upd before update on public.wider_leads for each row execute function public.set_updated_at();
create trigger t_own before insert on public.wider_leads for each row execute function public.set_owner();

-- ------------------------------------------------------------ campaigns (9.5)

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  audience text,
  tool text,
  search_id uuid,
  started_on date,
  ended_on date,
  contacted int not null default 0 check (contacted >= 0),
  replies int not null default 0 check (replies >= 0),
  calls_booked int not null default 0 check (calls_booked >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_dates_in_order check (ended_on is null or started_on is null or ended_on >= started_on)
);

create index campaigns_search on public.campaigns (search_id);

create trigger t_upd before update on public.campaigns for each row execute function public.set_updated_at();
create trigger t_own before insert on public.campaigns for each row execute function public.set_owner();

-- ----------------------------------------------------- target_companies (9.6)

create table public.target_companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  list text not null default 'uk_to_us',
  company text not null,
  company_key text not null,
  hq_country text,
  us_presence text,
  headcount_band text,
  marketing_lead_name text,
  marketing_lead_title text,
  marketing_lead_id uuid references public.people (id),
  -- TGT-1: when true the first approach goes through account_owner.
  existing_client boolean not null default false,
  account_owner text,
  signals text[] not null default '{}',
  last_signal_on date,
  status text not null default 'to_research' check (status in (
    'to_research', 'ready', 'contacted', 'in_conversation', 'client', 'parked')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, list, company_key)
);

create index target_companies_marketing_lead on public.target_companies (marketing_lead_id);
create index target_companies_status on public.target_companies (list, status);

create trigger t_upd before update on public.target_companies for each row execute function public.set_updated_at();
create trigger t_own before insert on public.target_companies for each row execute function public.set_owner();

-- ------------------------------------------------------------------ grants

-- Stated in full, as 0017 does, so the result is the same whether or not the
-- project grants the API roles anything on new tables. P-OWNER: never delete.
revoke all on
  public.job_leads, public.coaching_sessions, public.referrals,
  public.wider_leads, public.campaigns, public.target_companies
  from anon, authenticated;
grant select, insert, update on
  public.job_leads, public.coaching_sessions, public.referrals,
  public.wider_leads, public.campaigns, public.target_companies
  to authenticated;
grant all on
  public.job_leads, public.coaching_sessions, public.referrals,
  public.wider_leads, public.campaigns, public.target_companies
  to service_role;
grant execute on function public.add_working_days(date, int) to authenticated, service_role;
