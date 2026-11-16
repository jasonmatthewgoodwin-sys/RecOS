-- 0048 The new search flow, data and agent half (docs/new-search-split.md,
-- Jason, 16 November 2026). A search gains its intake fields; search_jobs is
-- the queue the owner fills by asking for brief questions, a client lowdown
-- or a market map; a6_calls in mode `research` claims the waiting jobs through
-- the context value `search_jobs` and answers each with one `search_result`
-- record, which lands as a new version in search_notes.

-- ---------------------------------------------------------------- intake fields

alter table public.searches
  add column role_type text check (role_type is null or role_type in ('ic_pmm', 'senior_pmm', 'technical_pmm', 'head_of_pmm', 'director_vp_pmm', 'plg_pmm', 'other')),
  add column jd_text text check (jd_text is null or length(jd_text) <= 60000),
  add column brief_due_on date;

alter table public.search_notes drop constraint search_notes_tab_check;
alter table public.search_notes add constraint search_notes_tab_check
  check (tab in ('brief', 'map', 'calibration', 'client_updates', 'interviews', 'offer', 'close_out', 'questions', 'lowdown'));

-- ---------------------------------------------------------------- the queue

create table public.search_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  search_id uuid not null references public.searches (id),
  kind text not null check (kind in ('questions', 'lowdown', 'map')),
  status text not null default 'waiting' check (status in ('waiting', 'working', 'ready', 'failed')),
  -- One plain line for the screen, for example why it failed.
  note text check (note is null or length(note) <= 280),
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts int not null default 0,
  finished_at timestamptz
);
-- One open job per search and kind.
create unique index search_jobs_one_open on public.search_jobs (search_id, kind) where status in ('waiting', 'working');
create index search_jobs_search on public.search_jobs (search_id, requested_at desc);
comment on table public.search_jobs is
  'Research the owner has asked for on a search (0048): brief questions, client lowdown, market map. Rows are added by request_search_job, claimed by a6_calls through agent_context(search_jobs) and closed by the search_result write kind. The browser reads only.';

-- The owner reads; nothing in the browser writes (the policy file says the same).
alter table public.search_jobs enable row level security;
revoke all on public.search_jobs from anon;
revoke insert, update, delete, truncate, references, trigger on public.search_jobs from authenticated;
grant select on public.search_jobs to authenticated;

-- ---------------------------------------------------------------- the owner's two calls

-- Start a search from the intake step. The client key is built as addSearch
-- builds it in the app (lower case, letters, digits and single spaces), less
-- the company suffixes, so that aw_find_search, which looks a client up by
-- norm_company, finds "Contoso Inc" when an agent writes "Contoso".
create function public.start_search(p_client text, p_role text, p_role_type text default null, p_jd_text text default null, p_brief_due_on date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  jd text := nullif(btrim(coalesce(p_jd_text, '')), '');
begin
  if app_role() <> 'owner' then raise exception 'Only the owner can do that'; end if;
  if norm_text(p_client) is null then raise exception 'A search needs a client'; end if;
  if nullif(btrim(coalesce(p_role, '')), '') is null then raise exception 'A search needs a role, however rough'; end if;
  if p_role_type is not null and p_role_type not in ('ic_pmm', 'senior_pmm', 'technical_pmm', 'head_of_pmm', 'director_vp_pmm', 'plg_pmm', 'other') then
    raise exception 'Unknown role type';
  end if;
  if length(coalesce(jd, '')) > 60000 then raise exception 'That job description is too long. Keep it under 60,000 characters'; end if;
  insert into searches (owner_id, client, client_key, role, function, status, role_type, jd_text, brief_due_on)
  values (auth.uid(), btrim(p_client), coalesce(norm_company(p_client), norm_text(p_client)), btrim(p_role), 'pmm', 'intake', p_role_type, jd, p_brief_due_on)
  returning id into sid;
  return sid;
end $$;
revoke execute on function public.start_search(text, text, text, text, date) from public, anon;
grant execute on function public.start_search(text, text, text, text, date) to authenticated;

-- Ask for a piece of research. A second ask while one is open returns the open one.
create function public.request_search_job(p_search uuid, p_kind text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s searches%rowtype;
  jid uuid;
begin
  if app_role() <> 'owner' then raise exception 'Only the owner can do that'; end if;
  if p_kind is null or p_kind not in ('questions', 'lowdown', 'map') then raise exception 'A job is questions, lowdown or map'; end if;
  select * into s from searches where id = p_search;
  if s.id is null then raise exception 'No such search'; end if;
  select j.id into jid from search_jobs j where j.search_id = p_search and j.kind = p_kind and j.status in ('waiting', 'working') limit 1;
  if jid is not null then return jid; end if;
  insert into search_jobs (owner_id, search_id, kind) values (s.owner_id, p_search, p_kind) returning search_jobs.id into jid;
  return jid;
end $$;
revoke execute on function public.request_search_job(uuid, text) from public, anon;
grant execute on function public.request_search_job(uuid, text) to authenticated;

-- ---------------------------------------------------------------- the agent's side

-- Claim up to three jobs in one statement: those waiting, and those a run
-- took more than an hour ago and never answered. A job taken three times
-- without an answer is closed as failed, so a broken one cannot loop.
-- The client is given by name even on a confidential search: the lowdown
-- cannot be researched without it. The flag travels with it.
create function public.aw_claim_search_jobs() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  out jsonb;
begin
  update search_jobs set status = 'failed', note = 'No answer after three tries. Ask again.', finished_at = now()
  where status = 'working' and claimed_at < now() - interval '60 minutes' and attempts >= 3;

  with pick as (
    select j.id from search_jobs j
    where j.status = 'waiting' or (j.status = 'working' and j.claimed_at < now() - interval '60 minutes')
    order by j.requested_at
    limit 3
    for update skip locked
  ), took as (
    update search_jobs j set status = 'working', claimed_at = now(), attempts = j.attempts + 1
    from pick where j.id = pick.id
    returning j.id, j.kind, j.search_id, j.requested_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'job_id', t.id, 'kind', t.kind,
    'search', jsonb_build_object('id', s.id, 'client', s.client, 'confidential', s.confidential, 'role', s.role, 'role_type', s.role_type, 'jd_text', s.jd_text, 'location', s.location),
    'brief', (select n.structured from search_notes n where n.search_id = s.id and n.tab = 'brief' order by n.version desc limit 1)
  ) order by t.requested_at), '[]') into out
  from took t join searches s on s.id = t.search_id;
  return out;
end $$;
revoke execute on function public.aw_claim_search_jobs() from public, anon, authenticated;

-- search_result: the answer to one job. ready writes a new version of the
-- note for that tab (the agent never overwrites a version, so the owner's
-- edits to the one before are kept) and closes the job; failed closes it
-- with one line for the screen.
create function public.aw_search_result(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j search_jobs%rowtype;
  jid uuid;
  st text := d ->> 'status';
  body text := d ->> 'content';
  nid uuid;
  v int;
begin
  begin
    jid := (d ->> 'job_id')::uuid;
  exception when others then jid := null; end;
  if jid is null then return aw_reject('invalid', 'A search_result needs job_id.', 'job_id'); end if;
  if st is null or st not in ('ready', 'failed') then return aw_reject('invalid', 'status is ready or failed.', 'status'); end if;
  if length(coalesce(d ->> 'note', '')) > 280 then return aw_reject('invalid', 'Keep note to one line of 280 characters.', 'note'); end if;
  select * into j from search_jobs where id = jid for update;
  if j.id is null then return aw_reject('not_found', 'No such job.', 'job_id'); end if;
  if j.status in ('ready', 'failed') then return aw_reject('wrong_state', 'That job is already closed.', 'job_id'); end if;

  if st = 'failed' then
    update search_jobs set status = 'failed', note = coalesce(nullif(btrim(d ->> 'note'), ''), 'It could not be done this time.'), finished_at = now() where id = j.id;
    return jsonb_build_object('outcome', 'merged', 'id', j.id, 'note', 'Job closed as failed');
  end if;

  if d -> 'structured' is null or jsonb_typeof(d -> 'structured') <> 'object' then return aw_reject('invalid', 'structured must be an object.', 'structured'); end if;
  if jsonb_typeof(d -> 'content') is distinct from 'string' or btrim(body) = '' then return aw_reject('invalid', 'content is the readable text and is needed.', 'content'); end if;
  if length(body) >= 60000 then return aw_reject('invalid', 'Keep content under 60,000 characters.', 'content'); end if;
  if j.kind = 'questions' and jsonb_typeof(d -> 'structured' -> 'groups') is distinct from 'array' then return aw_reject('invalid', 'A questions result needs structured.groups, a list.', 'structured'); end if;
  if j.kind = 'map' and jsonb_typeof(d -> 'structured' -> 'tiers') is distinct from 'array' then return aw_reject('invalid', 'A map result needs structured.tiers, a list.', 'structured'); end if;
  if j.kind = 'lowdown' and d -> 'structured' = '{}'::jsonb then return aw_reject('invalid', 'A lowdown result needs something in structured.', 'structured'); end if;

  select coalesce(max(n.version), 0) + 1 into v from search_notes n where n.search_id = j.search_id and n.tab = j.kind;
  insert into search_notes (owner_id, search_id, tab, content, structured, version, created_by)
  values (j.owner_id, j.search_id, j.kind, body, d -> 'structured', v, 'agent')
  returning id into nid;
  update search_jobs set status = 'ready', note = nullif(btrim(d ->> 'note'), ''), finished_at = now() where id = j.id;
  return jsonb_build_object('outcome', 'created', 'id', nid, 'note', format('Version %s', v));
end $$;
revoke execute on function public.aw_search_result(uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- the write contract
-- aw_allowed_fields as in 0046, aw_may_send and agent_write as in 0040, each
-- with search_result added. agent_context as in 0040 with search_jobs added.

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
    when 'calendar_today' then array['events', 'from', 'to']
    when 'coaching_answers' then array['person_name', 'held_at', 'q_interviewed_where', 'q_who_else_looking', 'q_how_they_hire', 'q_events_rated', 'advice_given', 'referrals_count', 'leads_count']
    when 'message' then array['type', 'channel', 'person_name', 'company', 'to_name', 'subject', 'body', 'level', 'variables', 'search_id', 'follow_up_id', 'call_id']
    when 'opt_out' then array['person_name', 'company', 'phrase', 'source_url']
    when 'content_draft' then array['kind', 'run_source', 'angle', 'topic', 'hook', 'body', 'close_line', 'hashtags', 'data_point', 'data_point_url', 'prompted_by', 'prompted_by_url']
    when 'outreach_step' then array['lead_id', 'company', 'role', 'step', 'on', 'note', 'outcome']
    when 'call' then array['granola_ref', 'granola_url', 'calendar_ref', 'title', 'held_at', 'minutes', 'call_type', 'person_name', 'company', 'search_client', 'search_role', 'match_confidence', 'w_record', 'w_cv', 'w_note', 'w_on_search', 'w_follow_up', 'cv_requested', 'crm_note_ref', 'is_new_a_star', 'skip_reason']
    when 'search_counts' then array['search_id', 'search_client', 'search_role', 'n_sourced', 'n_spoken', 'n_submitted', 'n_first_stage', 'n_later_stage', 'n_offer', 'last_client_contact_on', 'waiting_on', 'health', 'health_reason', 'next_step', 'next_step_on']
    when 'a_star_suggestion' then array['name', 'title', 'company', 'city', 'linkedin_url', 'why', 'week']
    when 'data_point' then array['statement', 'value', 'as_of', 'category', 'source_name', 'source_url']
    when 'campaign_step' then array['campaign_id', 'step', 'on', 'note', 'outcome', 'crm_ref', 'crm_url']
    when 'search_result' then array['job_id', 'status', 'note', 'content', 'structured']
    else null end
$$;

create or replace function public.aw_may_send(p_agent text, p_kind text) returns boolean
language sql immutable as $$
  select p_kind = any(case p_agent
    when 'a1_review' then array['inbox_item', 'message', 'kpi_event', 'opt_out']
    when 'a2_content' then array['content_draft', 'data_point']
    when 'a3_jobs' then array['job_lead', 'wider_lead', 'person', 'message', 'a_star_suggestion', 'outreach_step']
    when 'a4_signals' then array['signal', 'person', 'message']
    when 'a5_followups' then array['person', 'follow_up', 'message', 'touch', 'calendar_today', 'kpi_event', 'opt_out']
    when 'a6_calls' then array['wider_lead', 'person', 'follow_up', 'message', 'call', 'referral', 'coaching_answers', 'touch', 'search_counts', 'kpi_event', 'opt_out', 'search_result']
    when 'a7_events' then array['inbox_item', 'event_idea']
    when 'a8_campaigns' then array['campaign_step', 'outreach_step']
    else array[]::text[] end)
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
            when 'campaign_step' then aw_campaign_step(p_run, r.agent, d)
            when 'call' then aw_call(p_run, r.agent, d)
            when 'search_counts' then aw_search_counts(p_run, r.agent, d)
            when 'a_star_suggestion' then aw_a_star(p_run, r.agent, d)
            when 'opt_out' then aw_opt_out(p_run, r.agent, d)
            when 'search_result' then aw_search_result(p_run, r.agent, d)
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
    when 'a6_calls' then array['searches', 'dnc', 'search_jobs']
    when 'a7_events' then array['dnc']
    when 'a8_campaigns' then array['campaigns', 'dnc']
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
      when 'campaigns' then jsonb_build_object('campaigns', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id, 'name', c.name, 'status', c.status, 'steps', c.steps, 'started_on', c.started_on, 'crm_ref', c.crm_ref,
          'lead', case when l.id is null then null else jsonb_build_object('id', l.id, 'company', l.company, 'role', l.role, 'poster_name', l.poster_name, 'poster_title', l.poster_title, 'poster_profile_url', l.poster_profile_url, 'existing_client', l.existing_client) end,
          'candidate', case when p.id is null then null else jsonb_build_object('id', p.id, 'name', p.display_name, 'title', p.display_title, 'company', p.display_company, 'crm_url', p.crm_url) end
        ) order by c.created_at)
        from campaigns c left join job_leads l on l.id = c.job_lead_id left join people p on p.id = c.candidate_person_id
        where c.tool = 'email' and c.status in ('planned', 'running')), '[]'))
      when 'search_jobs' then jsonb_build_object('search_jobs', aw_claim_search_jobs())
      else '{}'::jsonb end;
  end loop;
  return out;
end $$;
