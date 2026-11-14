-- 0025 The agent endpoints in the database (sections 15.4, 15.5, 16, P1-14,
-- P1-15, P1-16): run-start, run-finish, context and the write contract with
-- its validation, duplicate keys, merges and side effects. The edge functions
-- in functions/ are thin: they check the agent key and call these.
--
-- Nothing here is callable by a browser role except agent_key_create,
-- agent_key_revoke and request_run, which check for the owner themselves.
-- Everything else is granted to service_role only.

-- ---------------------------------------------------------------- keys (16.5)

-- Lower case, accents folded, punctuation gone, spaces collapsed.
create function public.norm_text(p text) returns text
language sql immutable as $$
  select nullif(btrim(regexp_replace(regexp_replace(
    translate(lower(coalesce(p, '')),
      'àáâãäåèéêëìíîïòóôõöùúûüýÿçñ', 'aaaaaaeeeeiiiiooooouuuuyycn'),
    '[^a-z0-9 ]+', ' ', 'g'), '\s+', ' ', 'g')), '')
$$;

-- A company: drop a leading The and the usual suffixes.
create function public.norm_company(p text) returns text
language sql immutable as $$
  select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(
    coalesce(norm_text(p), ''),
    '^the ', ''),
    '\m(inc|incorporated|ltd|limited|llc|corp|corporation|gmbh|sas|bv|plc|co|company|group|holdings)\M', ' ', 'g'),
    '\s+', ' ', 'g')), '')
$$;

-- A role: expand short forms, drop bracketed text and anything after a dash
-- or comma (usually the place). Seniority words are kept.
create function public.norm_role(p text) returns text
language sql immutable as $$
  select nullif(btrim(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      coalesce(norm_text(regexp_replace(regexp_replace(coalesce(p, ''), '\([^)]*\)', ' ', 'g'), '\s[-–,|].*$', '')), ''),
      '\msr\M', 'senior', 'g'),
      '\mjr\M', 'junior', 'g'),
      '\mpmm\M', 'product marketing manager', 'g'),
      '\mvp\M', 'vice president', 'g'),
      '\mmgr\M', 'manager', 'g'),
      '\mdir\M', 'director', 'g'),
    '\s+', ' ', 'g')), '')
$$;

-- ---------------------------------------------------------------- tables

alter table public.agent_runs add column mode text;

-- AGW-1: a repeated batch returns the stored result.
create table public.agent_requests (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs (id),
  idempotency_key text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, idempotency_key)
);
revoke all on public.agent_requests from anon, authenticated;

-- E9: the owner asks for a run. The agent picks it up at the top of its schedule.
create table public.run_requests (
  id uuid primary key default gen_random_uuid(),
  agent text not null references public.agents (code),
  requested_at timestamptz not null default now(),
  requested_by text not null,
  taken_at timestamptz
);
create index run_requests_agent_open on public.run_requests (agent) where taken_at is null;
revoke all on public.run_requests from anon;
revoke insert, update, delete, truncate, references, trigger on public.run_requests from authenticated;
grant select on public.run_requests to authenticated;

-- ---------------------------------------------------------------- agent keys

-- Create new key (32.4). The plain key is returned once and never stored.
create function public.agent_key_create(p_agent text) returns text
language plpgsql security definer set search_path = public as $$
declare
  key text;
begin
  if app_role() <> 'owner' then
    raise exception 'Only the owner can make a key';
  end if;
  if not exists (select 1 from agents where code = p_agent) then
    raise exception 'No such agent';
  end if;
  key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  update agents set key_hash = encode(sha256(convert_to(key, 'UTF8')), 'hex'), key_created_at = now() where code = p_agent;
  perform write_audit('agent key created', 'agents', null, jsonb_build_object('agent', p_agent));
  return key;
end $$;

create function public.agent_key_revoke(p_agent text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if app_role() <> 'owner' then
    raise exception 'Only the owner can revoke a key';
  end if;
  update agents set key_hash = null, key_created_at = null where code = p_agent;
  perform write_audit('agent key revoked', 'agents', null, jsonb_build_object('agent', p_agent));
end $$;

-- For the edge functions: true when the key matches and the agent exists.
create function public.agent_authenticate(p_agent text, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from agents
    where code = p_agent and key_hash is not null
      and key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex')
  )
$$;

-- E9 from the browser.
create function public.request_run(p_agent text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  id uuid;
begin
  if app_role() <> 'owner' then
    raise exception 'Only the owner can ask for a run';
  end if;
  if exists (select 1 from run_requests where agent = p_agent and taken_at is null) then
    select r.id into id from run_requests r where r.agent = p_agent and r.taken_at is null limit 1;
    return id;
  end if;
  insert into run_requests (agent, requested_by) values (p_agent, coalesce(auth.jwt() ->> 'email', 'owner')) returning run_requests.id into id;
  return id;
end $$;

-- ---------------------------------------------------------------- E1, E3

create function public.agent_run_start(p_agent text, p_trigger text, p_mode text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a agents%rowtype;
  prompt agent_prompts%rowtype;
  run_id uuid;
  blocks jsonb;
  lookback date;
  caps jsonb;
  paused boolean;
begin
  select * into a from agents where code = p_agent;
  if a.code is null then
    raise exception 'No such agent';
  end if;
  if not a.enabled then
    return jsonb_build_object('enabled', false);
  end if;
  if p_trigger not in ('schedule', 'manual', 'after_call') then
    raise exception 'Unknown trigger';
  end if;

  select * into prompt from agent_prompts where agent = p_agent and active;
  select coalesce(jsonb_object_agg(code, body), '{}') into blocks
  from shared_blocks where code = any(coalesce(prompt.shared_blocks, '{}'));

  -- The finish of the last good run of this agent and mode, so no day is missed.
  select max(finished_at)::date into lookback
  from agent_runs where agent = p_agent and status in ('ok', 'partial')
    and (p_mode is null or mode is null or mode = p_mode);

  select coalesce(jsonb_object_agg(type, per_run_cap), '{}') into caps from send_policies where per_run_cap is not null;
  select all_sending_paused into paused from app_settings;

  insert into agent_runs (agent, trigger, mode, prompt_version)
  values (p_agent, p_trigger, p_mode, prompt.version)
  returning id into run_id;
  update agents set last_run_id = run_id where code = p_agent;
  update run_requests set taken_at = now() where agent = p_agent and taken_at is null;

  return jsonb_build_object(
    'run_id', run_id,
    'enabled', true,
    'prompt', case when prompt.id is null then null else jsonb_build_object('version', prompt.version, 'body', prompt.body, 'blocks', blocks) end,
    'settings', jsonb_build_object('lookback_from', coalesce(lookback, current_date - 7), 'per_run_caps', caps),
    'paused', jsonb_build_object('all_sending', paused)
  );
end $$;

create function public.agent_run_finish(p_run uuid, p_status text, p_errors jsonb default '[]', p_summary text default null, p_cost numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r agent_runs%rowtype;
begin
  select * into r from agent_runs where id = p_run;
  if r.id is null then
    raise exception 'No such run';
  end if;
  if r.status <> 'running' then
    raise exception 'That run has already finished';
  end if;
  if p_status not in ('ok', 'partial', 'failed') then
    raise exception 'A run finishes ok, partial or failed';
  end if;
  update agent_runs
  set status = p_status, finished_at = now(), errors = coalesce(p_errors, '[]'), summary = p_summary, cost_estimate = p_cost
  where id = p_run;
  update agents
  set consecutive_failures = case when p_status = 'failed' then consecutive_failures + 1 else 0 end,
      consecutive_empty = case when p_status = 'ok' and r.items_created = 0 then consecutive_empty + 1 else 0 end
  where code = r.agent;
  return jsonb_build_object('run_id', p_run, 'status', p_status, 'created', r.items_created, 'merged', r.items_merged, 'rejected', r.items_rejected);
end $$;

-- ---------------------------------------------------------------- E4

create function public.agent_context(p_agent text, p_want text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  w text;
  out jsonb := '{}';
  allowed text[];
begin
  allowed := case p_agent
    when 'a1_review' then array['searches', 'kpis', 'dnc']
    when 'a2_content' then array['topic_keys', 'sources', 'dnc']
    when 'a3_jobs' then array['pool', 'job_keys', 'dnc']
    when 'a4_signals' then array['league', 'dnc']
    when 'a5_followups' then array['searches', 'league', 'offline', 'dnc']
    when 'a6_calls' then array['searches', 'dnc']
    when 'a7_events' then array['dnc']
    else array[]::text[] end;
  foreach w in array coalesce(p_want, array[]::text[]) loop
    if w <> all(allowed) then
      raise exception 'not_allowed: % may not ask for %', p_agent, w;
    end if;
    out := out || case w
      when 'searches' then jsonb_build_object('searches', '[]'::jsonb)
      when 'pool' then jsonb_build_object('pool', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'name', display_name, 'title', display_title, 'company', display_company, 'city', city, 'crm_url', crm_url))
        from people where kind = 'candidate' and not do_not_contact), '[]'))
      when 'league' then jsonb_build_object('league', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'title', p.display_title, 'company', p.display_company, 'tier', m.tier, 'last_touch_on', m.last_touch_on))
        from league_members m join people p on p.id = m.person_id where m.active), '[]'))
      when 'job_keys' then jsonb_build_object('job_keys', coalesce((
        select jsonb_agg(jsonb_build_object('company_key', company_key, 'role_key', role_key))
        from job_leads where last_seen_on >= current_date - 45), '[]'))
      when 'topic_keys' then jsonb_build_object('topic_keys', '[]'::jsonb)
      when 'sources' then jsonb_build_object('sources', '[]'::jsonb)
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

-- ---------------------------------------------------------------- E2 helpers

-- The fields a kind may carry. Anything else is refused, not ignored (16.2).
create function public.aw_allowed_fields(p_kind text) returns text[]
language sql immutable as $$
  select case p_kind
    when 'inbox_item' then array['type', 'title', 'why', 'suggested_action', 'draft', 'source', 'source_url', 'links', 'rank', 'company', 'role', 'location', 'person_name']
    when 'job_lead' then array['company', 'role', 'function', 'level', 'location', 'city', 'country', 'source', 'source_url', 'poster_name', 'poster_title', 'poster_profile_url', 'company_size', 'fit_score', 'fit_reason', 'existing_client', 'spec_draft', 'why', 'matched']
    when 'wider_lead' then array['company', 'role', 'function', 'country', 'location', 'source', 'mentioned_by_name', 'existing_client', 'notes', 'why']
    when 'signal' then array['person_name', 'company', 'title', 'city', 'signal_type', 'strength', 'detail', 'source', 'source_url', 'seen_on', 'in_icp', 'draft']
    when 'person' then array['display_name', 'display_title', 'display_company', 'city', 'kind', 'crm', 'crm_ref', 'crm_url', 'linkedin_url', 'email', 'in_crm']
    when 'follow_up' then array['person_name', 'company', 'kind', 'reason', 'source', 'source_url', 'direction', 'due_on', 'call_ref', 'thread_ref', 'draft']
    when 'referral' then array['referred_name', 'referred_company', 'referred_title', 'referred_by_name', 'context', 'kind', 'call_ref']
    when 'touch' then array['person_name', 'company', 'touched_on', 'channel', 'kind', 'source', 'source_url', 'note']
    when 'event_idea' then array['title', 'why', 'source', 'source_url']
    when 'kpi_event' then array['kpi', 'source_table', 'source_ref', 'label', 'is_pmm', 'happened_at']
    when 'calendar_today' then array['events']
    when 'coaching_answers' then array['person_name', 'held_at', 'q_interviewed_where', 'q_who_else_looking', 'q_how_they_hire', 'q_events_rated', 'advice_given', 'referrals_count', 'leads_count']
    when 'message' then array['type', 'channel', 'person_name', 'to_name', 'subject', 'body', 'level']
    else null end
$$;

-- Who may send what (16.3).
create function public.aw_may_send(p_agent text, p_kind text) returns boolean
language sql immutable as $$
  select p_kind = any(case p_agent
    when 'a1_review' then array['inbox_item', 'message', 'kpi_event']
    when 'a2_content' then array['content_draft', 'data_point']
    when 'a3_jobs' then array['job_lead', 'wider_lead', 'person', 'message', 'a_star_suggestion']
    when 'a4_signals' then array['signal', 'person', 'message']
    when 'a5_followups' then array['person', 'follow_up', 'message', 'touch', 'calendar_today', 'kpi_event']
    when 'a6_calls' then array['wider_lead', 'person', 'follow_up', 'message', 'call', 'referral', 'coaching_answers', 'touch', 'search_counts', 'kpi_event']
    when 'a7_events' then array['inbox_item', 'event_idea']
    else array[]::text[] end)
$$;

create function public.aw_reject(p_code text, p_message text, p_field text default null) returns jsonb
language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('outcome', 'rejected', 'code', p_code, 'message', p_message, 'field', p_field))
$$;

create function public.aw_owner() returns uuid
language sql stable security definer set search_path = public as $$
  select id from app_users where role = 'owner' order by created_at limit 1
$$;

-- Find a person by name and company, or by name alone when it is unique.
create function public.aw_find_person(p_name text, p_company text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  id uuid;
  nk text := norm_text(p_name);
  ck text := norm_company(p_company);
begin
  if nk is null then return null; end if;
  if ck is not null then
    select p.id into id from people p where p.name_key = nk and p.company_key = ck limit 1;
    if id is not null then return id; end if;
  end if;
  if (select count(*) from people p where p.name_key = nk) = 1 then
    select p.id into id from people p where p.name_key = nk;
  end if;
  return id;
end $$;

-- A thin person row where none matches (rule 1: name, title, company only).
create function public.aw_person_upsert(p_name text, p_title text, p_company text, p_city text, p_kind text, p_linkedin text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  id uuid;
begin
  id := aw_find_person(p_name, p_company);
  if id is null and p_linkedin is not null then
    select p.id into id from people p where p.linkedin_url = p_linkedin limit 1;
  end if;
  if id is not null then
    update people set
      display_title = coalesce(display_title, p_title),
      display_company = coalesce(display_company, p_company),
      company_key = coalesce(company_key, norm_company(p_company)),
      city = coalesce(city, p_city),
      linkedin_url = coalesce(linkedin_url, p_linkedin)
    where people.id = aw_person_upsert.id;
    return id;
  end if;
  insert into people (owner_id, display_name, name_key, display_title, display_company, company_key, city, kind, linkedin_url)
  values (aw_owner(), btrim(p_name), norm_text(p_name), p_title, p_company, norm_company(p_company), p_city, coalesce(p_kind, 'unknown'), p_linkedin)
  returning people.id into id;
  return id;
end $$;

-- True when the name or company is on the do-not-contact list (16.7).
create function public.aw_blocked(p_name text, p_company text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from do_not_contact d
    where (d.scope = 'person' and norm_text(d.name) is not null and norm_text(d.name) = norm_text(p_name))
       or (d.scope = 'company' and norm_company(d.company) is not null and norm_company(d.company) = norm_company(p_company))
  )
$$;

create function public.aw_inbox(p_run uuid, p_agent text, p_type text, p_title text, p_data jsonb, p_dedup text, p_rank numeric, p_person uuid, p_ref_table text, p_ref_id uuid, p_draft text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  id uuid;
begin
  insert into inbox_items (owner_id, type, agent, run_id, title, person_id, company, role, location, why, suggested_action, draft, draft_original, source, source_url, links, ref_table, ref_id, dedup_key, rank, status)
  values (aw_owner(), p_type, p_agent, p_run, p_title, p_person, p_data ->> 'company', p_data ->> 'role', coalesce(p_data ->> 'location', p_data ->> 'city'),
          p_data ->> 'why', p_data ->> 'suggested_action', p_draft, p_draft, p_data ->> 'source', p_data ->> 'source_url',
          coalesce(p_data -> 'links', '[]'), p_ref_table, p_ref_id, p_dedup, coalesce(p_rank, 0), 'new')
  on conflict do nothing
  returning inbox_items.id into id;
  return id;
end $$;

-- ---------------------------------------------------------------- E2 kinds

create function public.aw_job_lead(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ck text := norm_company(d ->> 'company');
  rk text := norm_role(d ->> 'role');
  fn text := coalesce(d ->> 'function', 'pmm');
  country text := coalesce(d ->> 'country', 'US');
  existing job_leads%rowtype;
  lead_id uuid;
  poster uuid;
  item uuid;
  wider uuid;
  candidate text;
begin
  if ck is null then return aw_reject('invalid', 'A job lead needs a company.', 'company'); end if;
  if rk is null then return aw_reject('invalid', 'A job lead needs a role.', 'role'); end if;
  if nullif(d ->> 'source', '') is null or nullif(d ->> 'source_url', '') is null then
    return aw_reject('invalid', 'A job lead needs a source with a link.', 'source_url');
  end if;
  if fn not in ('pmm', 'marketing', 'sales', 'customer_success', 'revops', 'creative', 'operating_partner', 'other') then
    return aw_reject('invalid', 'Unknown function.', 'function');
  end if;
  if country not in ('US', 'UK', 'other') then return aw_reject('invalid', 'Country is US, UK or other.', 'country'); end if;
  -- The spec draft must not name a candidate (16.7).
  if d ->> 'spec_draft' is not null then
    select display_name into candidate from people
    where kind = 'candidate' and norm_text(d ->> 'spec_draft') like '%' || name_key || '%' limit 1;
    if candidate is not null then
      return aw_reject('invalid', format('The draft names a candidate, %s. Leave people out of spec messages.', candidate), 'spec_draft');
    end if;
  end if;

  -- Not PMM, or a UK role at an existing client: a wider lead instead (16.10).
  if fn <> 'pmm' or (country = 'UK' and coalesce((d ->> 'existing_client')::boolean, false)) then
    insert into wider_leads (owner_id, company, role, function, country, location, source, existing_client, notes)
    values (aw_owner(), d ->> 'company', d ->> 'role', fn, country, coalesce(d ->> 'location', d ->> 'city'), 'job_post', coalesce((d ->> 'existing_client')::boolean, false), d ->> 'why')
    returning id into wider;
    item := aw_inbox(p_run, p_agent, 'wider_lead', format('%s at %s', coalesce(d ->> 'role', 'A role'), d ->> 'company'), d,
      format('wider_lead:%s:%s', ck, rk), coalesce((d ->> 'fit_score')::numeric, 40), null, 'wider_leads', wider, null);
    return jsonb_build_object('outcome', 'created', 'id', wider, 'inbox_item_id', item, 'note', 'Not a PMM role, so it is a wider lead.');
  end if;

  select * into existing from job_leads where company_key = ck and role_key = rk;
  if existing.id is not null then
    update job_leads set
      sources = case when (d ->> 'source') = any(sources) then sources else array_append(sources, d ->> 'source') end,
      source_urls = case when (d ->> 'source_url') = any(source_urls) then source_urls else array_append(source_urls, d ->> 'source_url') end,
      last_seen_on = greatest(last_seen_on, current_date),
      stage = case when stage = 'dead' and dead_reason = 'expired' then 'new' else stage end,
      dead_reason = case when stage = 'dead' and dead_reason = 'expired' then null else dead_reason end
    where id = existing.id;
    return jsonb_build_object('outcome', 'merged', 'id', existing.id, 'note', format('Seen before from %s. Source added.', existing.sources[1]));
  end if;

  if nullif(d ->> 'poster_name', '') is not null then
    poster := aw_person_upsert(d ->> 'poster_name', d ->> 'poster_title', d ->> 'company', d ->> 'city', 'leader', d ->> 'poster_profile_url');
  end if;
  insert into job_leads (owner_id, company, company_key, role, role_key, function, level, location, city, country, sources, source_urls,
    poster_name, poster_title, poster_profile_url, hiring_manager_id, company_size, fit_score, fit_reason, existing_client, matched)
  values (aw_owner(), d ->> 'company', ck, d ->> 'role', rk, fn, d ->> 'level', d ->> 'location', d ->> 'city', country,
    array[d ->> 'source'], array[d ->> 'source_url'], d ->> 'poster_name', d ->> 'poster_title', d ->> 'poster_profile_url', poster,
    d ->> 'company_size', (d ->> 'fit_score')::int, d ->> 'fit_reason', coalesce((d ->> 'existing_client')::boolean, false), coalesce(d -> 'matched', '[]'))
  returning id into lead_id;
  item := aw_inbox(p_run, p_agent, 'job_lead', format('%s at %s', d ->> 'role', d ->> 'company'), d,
    format('job_lead:%s:%s', ck, rk), (d ->> 'fit_score')::numeric, poster, 'job_leads', lead_id, d ->> 'spec_draft');
  return jsonb_build_object('outcome', 'created', 'id', lead_id, 'inbox_item_id', item);
end $$;

create function public.aw_wider_lead(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ck text := norm_company(d ->> 'company');
  wider uuid;
  item uuid;
  by_id uuid;
begin
  if ck is null then return aw_reject('invalid', 'A wider lead needs a company.', 'company'); end if;
  if coalesce(d ->> 'function', '') not in ('pmm', 'marketing', 'sales', 'customer_success', 'revops', 'creative', 'operating_partner', 'other') then
    return aw_reject('invalid', 'A wider lead needs a function.', 'function');
  end if;
  if coalesce(d ->> 'country', '') not in ('US', 'UK', 'other') then return aw_reject('invalid', 'Country is US, UK or other.', 'country'); end if;
  if coalesce(d ->> 'source', '') not in ('client_call', 'placement', 'coaching', 'league_call', 'alex_leads', 'uk_client', 'job_post', 'other') then
    return aw_reject('invalid', 'Unknown source.', 'source');
  end if;
  if exists (select 1 from inbox_items where dedup_key = format('wider_lead:%s:%s', ck, norm_role(d ->> 'role')) and status not in ('binned')) then
    return jsonb_build_object('outcome', 'merged', 'note', 'Already in the Inbox.');
  end if;
  by_id := aw_find_person(d ->> 'mentioned_by_name', null);
  insert into wider_leads (owner_id, company, role, function, country, location, source, mentioned_by_id, mentioned_by_name, existing_client, notes)
  values (aw_owner(), d ->> 'company', d ->> 'role', d ->> 'function', d ->> 'country', d ->> 'location', d ->> 'source', by_id, d ->> 'mentioned_by_name',
    coalesce((d ->> 'existing_client')::boolean, false), d ->> 'notes')
  returning id into wider;
  item := aw_inbox(p_run, p_agent, 'wider_lead', format('%s at %s', coalesce(d ->> 'role', 'A role'), d ->> 'company'), d,
    format('wider_lead:%s:%s', ck, norm_role(d ->> 'role')), 40, by_id, 'wider_leads', wider, null);
  return jsonb_build_object('outcome', 'created', 'id', wider, 'inbox_item_id', item);
end $$;

create function public.aw_signal(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pk text := norm_text(d ->> 'person_name');
  ck text := norm_company(d ->> 'company');
  base text;
  seen date := coalesce((d ->> 'seen_on')::date, current_date);
  existing signals%rowtype;
  sig uuid;
  item uuid;
  person uuid;
  in_icp boolean := (d ->> 'in_icp')::boolean;
begin
  if coalesce(d ->> 'signal_type', '') not in ('new_role', 'promoted', 'company_raised', 'company_hiring', 'open_to_work', 'speaker_idea', 'placed_anniversary', 'left_company') then
    return aw_reject('invalid', 'A signal needs a type.', 'signal_type');
  end if;
  if pk is null and ck is null then return aw_reject('invalid', 'A signal needs a person or a company.', 'person_name'); end if;
  if coalesce(d ->> 'source', '') not in ('linkedin_alert', 'alex_leads', 'job_lead', 'call', 'manual') then
    return aw_reject('invalid', 'Unknown source.', 'source');
  end if;
  if aw_blocked(d ->> 'person_name', d ->> 'company') then
    return aw_reject('policy_refused', 'That person or company is on the do-not-contact list.', 'person_name');
  end if;
  base := format('signal:%s:%s', coalesce(pk, ck), d ->> 'signal_type');
  select * into existing from signals
  where dedup_key like base || ':%' and seen_on >= seen - 30 and seen_on <= seen + 30
  order by seen_on desc limit 1;
  if existing.id is not null then
    update signals set source_url = coalesce(source_url, d ->> 'source_url') where id = existing.id;
    return jsonb_build_object('outcome', 'merged', 'id', existing.id, 'note', 'Seen before. Source link kept.');
  end if;
  person := aw_find_person(d ->> 'person_name', d ->> 'company');
  insert into signals (owner_id, person_id, person_name, person_key, company, company_key, title, city, signal_type, strength, detail, source, source_url, seen_on, in_icp, dedup_key)
  values (aw_owner(), person, d ->> 'person_name', pk, d ->> 'company', ck, d ->> 'title', d ->> 'city', d ->> 'signal_type',
    coalesce((d ->> 'strength')::int, 2), d ->> 'detail', d ->> 'source', d ->> 'source_url', seen, in_icp, base || ':' || seen)
  returning id into sig;
  if in_icp is distinct from false then
    item := aw_inbox(p_run, p_agent, 'signal', coalesce(d ->> 'person_name', d ->> 'company') || ' ' ||
      case d ->> 'signal_type' when 'new_role' then 'has a new role' when 'promoted' then 'was promoted' when 'company_raised' then 'has raised money'
        when 'company_hiring' then 'is hiring' when 'open_to_work' then 'is open to work' when 'left_company' then 'has moved on'
        when 'placed_anniversary' then 'started a year ago' else 'is worth a word' end,
      d, format('signal:%s', sig), coalesce((d ->> 'strength')::numeric, 2) * 20, person, 'signals', sig, d ->> 'draft');
  end if;
  return jsonb_build_object('outcome', 'created', 'id', sig, 'inbox_item_id', item);
end $$;

create function public.aw_person(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  id uuid;
  was uuid;
begin
  if norm_text(d ->> 'display_name') is null then return aw_reject('invalid', 'A person needs a name.', 'display_name'); end if;
  if coalesce((d ->> 'in_crm')::boolean, false) and nullif(d ->> 'email', '') is not null then
    return aw_reject('invalid', 'A person in the CRM carries no email here.', 'email');
  end if;
  if d ->> 'kind' is not null and d ->> 'kind' not in ('candidate', 'client_contact', 'leader', 'referrer', 'colleague', 'unknown') then
    return aw_reject('invalid', 'Unknown kind.', 'kind');
  end if;
  if nullif(d ->> 'crm_ref', '') is not null then
    select p.id into was from people p where p.crm_ref = d ->> 'crm_ref' limit 1;
  end if;
  if was is null then was := aw_find_person(d ->> 'display_name', d ->> 'display_company'); end if;
  if was is null and nullif(d ->> 'linkedin_url', '') is not null then
    select p.id into was from people p where p.linkedin_url = d ->> 'linkedin_url' limit 1;
  end if;
  if was is not null then
    update people set
      display_title = coalesce(d ->> 'display_title', display_title),
      display_company = coalesce(d ->> 'display_company', display_company),
      company_key = coalesce(norm_company(d ->> 'display_company'), company_key),
      city = coalesce(d ->> 'city', city),
      crm = coalesce(d ->> 'crm', crm), crm_ref = coalesce(d ->> 'crm_ref', crm_ref), crm_url = coalesce(d ->> 'crm_url', crm_url),
      linkedin_url = coalesce(d ->> 'linkedin_url', linkedin_url),
      in_crm = in_crm or coalesce((d ->> 'in_crm')::boolean, false),
      email = case when in_crm or coalesce((d ->> 'in_crm')::boolean, false) then null else coalesce(d ->> 'email', email) end,
      refreshed_on = current_date
    where people.id = was;
    return jsonb_build_object('outcome', 'merged', 'id', was);
  end if;
  insert into people (owner_id, display_name, name_key, display_title, display_company, company_key, city, kind, crm, crm_ref, crm_url, linkedin_url, email, in_crm, refreshed_on)
  values (aw_owner(), btrim(d ->> 'display_name'), norm_text(d ->> 'display_name'), d ->> 'display_title', d ->> 'display_company', norm_company(d ->> 'display_company'),
    d ->> 'city', coalesce(d ->> 'kind', 'unknown'), d ->> 'crm', d ->> 'crm_ref', d ->> 'crm_url', d ->> 'linkedin_url', nullif(d ->> 'email', ''), coalesce((d ->> 'in_crm')::boolean, false), current_date)
  returning people.id into id;
  return jsonb_build_object('outcome', 'created', 'id', id);
end $$;

create function public.aw_follow_up(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  key text;
  existing follow_ups%rowtype;
  id uuid;
  person uuid;
  due date;
begin
  if norm_text(d ->> 'person_name') is null then return aw_reject('invalid', 'A follow-up needs a person.', 'person_name'); end if;
  if coalesce(d ->> 'kind', '') not in ('after_candidate_call', 'after_coaching', 'after_client_meeting', 'after_interview', 'after_submission', 'rejection', 'aftercare', 'after_event', 'league_cadence', 'email_owed', 'chase', 'referral_thanks', 'other') then
    return aw_reject('invalid', 'A follow-up needs a kind.', 'kind');
  end if;
  if nullif(d ->> 'reason', '') is null then return aw_reject('invalid', 'A follow-up needs a reason.', 'reason'); end if;
  begin
    due := (d ->> 'due_on')::date;
  exception when others then due := null; end;
  if due is null then return aw_reject('invalid', 'A follow-up needs a due date.', 'due_on'); end if;
  if coalesce(d ->> 'source', '') not in ('call', 'email', 'crm_task', 'rule', 'manual') then return aw_reject('invalid', 'Unknown source.', 'source'); end if;
  if d ->> 'direction' is not null and d ->> 'direction' not in ('owed', 'waiting') then return aw_reject('invalid', 'Direction is owed or waiting.', 'direction'); end if;
  key := format('%s:%s:%s', norm_text(d ->> 'person_name'), d ->> 'kind', coalesce(d ->> 'call_ref', d ->> 'thread_ref', ''));
  select * into existing from follow_ups where dedup_key = key;
  if existing.id is not null then
    if existing.status = 'handled_offline' then
      return aw_reject('duplicate', 'That follow-up was handled offline. Not raised again.', 'person_name');
    end if;
    if due < existing.due_on and existing.status = 'open' then
      update follow_ups set due_on = due where follow_ups.id = existing.id;
    end if;
    return jsonb_build_object('outcome', 'merged', 'id', existing.id, 'note', 'Already on the list.');
  end if;
  person := aw_find_person(d ->> 'person_name', d ->> 'company');
  insert into follow_ups (owner_id, person_id, person_name, company, kind, reason, source, source_url, direction, due_on, dedup_key)
  values (aw_owner(), person, btrim(d ->> 'person_name'), d ->> 'company', d ->> 'kind', d ->> 'reason', d ->> 'source', d ->> 'source_url', coalesce(d ->> 'direction', 'owed'), due, key)
  returning follow_ups.id into id;
  return jsonb_build_object('outcome', 'created', 'id', id);
end $$;

create function public.aw_referral(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  base text;
  existing referrals%rowtype;
  id uuid;
  item uuid;
  by_id uuid;
begin
  if norm_text(d ->> 'referred_name') is null then return aw_reject('invalid', 'A referral needs a name.', 'referred_name'); end if;
  if norm_text(d ->> 'referred_by_name') is null then return aw_reject('invalid', 'A referral needs who made it.', 'referred_by_name'); end if;
  if d ->> 'kind' is not null and d ->> 'kind' not in ('person', 'company', 'job') then return aw_reject('invalid', 'Kind is person, company or job.', 'kind'); end if;
  base := format('referral:%s:%s:%s', norm_text(d ->> 'referred_name'), coalesce(norm_company(d ->> 'referred_company'), ''), norm_text(d ->> 'referred_by_name'));
  select * into existing from referrals where dedup_key like base || ':%' and received_on >= current_date - interval '12 months' limit 1;
  if existing.id is not null then
    return jsonb_build_object('outcome', 'merged', 'id', existing.id, 'note', 'Already recorded.');
  end if;
  by_id := aw_find_person(d ->> 'referred_by_name', null);
  insert into referrals (owner_id, referred_name, referred_company, referred_title, referred_by_id, referred_by_name, context, kind, dedup_key)
  values (aw_owner(), btrim(d ->> 'referred_name'), d ->> 'referred_company', d ->> 'referred_title', by_id, btrim(d ->> 'referred_by_name'), d ->> 'context', coalesce(d ->> 'kind', 'person'), base || ':' || current_date)
  returning referrals.id into id;
  item := aw_inbox(p_run, p_agent, 'referral', format('%s named someone to speak to', d ->> 'referred_by_name'),
    jsonb_build_object('why', coalesce(d ->> 'context', format('%s at %s', d ->> 'referred_name', coalesce(d ->> 'referred_company', 'a company'))), 'suggested_action', 'Follow up'),
    format('referral:%s', id), 55, by_id, 'referrals', id, null);
  return jsonb_build_object('outcome', 'created', 'id', id, 'inbox_item_id', item);
end $$;

create function public.aw_touch(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  person uuid;
  id uuid;
  day date := coalesce((d ->> 'touched_on')::date, current_date);
begin
  person := aw_find_person(d ->> 'person_name', d ->> 'company');
  if person is null then return aw_reject('not_found', 'No person by that name. Send a person record first.', 'person_name'); end if;
  if coalesce(d ->> 'channel', '') not in ('email', 'linkedin', 'phone', 'meeting', 'event', 'other') then return aw_reject('invalid', 'Unknown channel.', 'channel'); end if;
  if coalesce(d ->> 'kind', '') not in ('call', 'coaching', 'meeting', 'event_invite', 'event_attended', 'message_replied', 'voice_note', 'intro', 'other') then
    return aw_reject('invalid', 'Unknown kind.', 'kind');
  end if;
  if coalesce(d ->> 'source', '') not in ('call', 'email', 'calendar', 'event', 'manual') then return aw_reject('invalid', 'Unknown source.', 'source'); end if;
  select t.id into id from touches t where t.dedup_key = format('%s:%s:%s', person, day, d ->> 'kind');
  if id is not null then return jsonb_build_object('outcome', 'merged', 'id', id, 'note', 'Already logged for that day.'); end if;
  insert into touches (owner_id, person_id, touched_on, channel, kind, source, source_url, note)
  values (aw_owner(), person, day, d ->> 'channel', d ->> 'kind', d ->> 'source', d ->> 'source_url', d ->> 'note')
  returning touches.id into id;
  return jsonb_build_object('outcome', 'created', 'id', id);
end $$;

create function public.aw_inbox_item(p_run uuid, p_agent text, d jsonb, p_type text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t text := coalesce(p_type, d ->> 'type');
  key text;
  item uuid;
  existing uuid;
begin
  if nullif(d ->> 'title', '') is null then return aw_reject('invalid', 'An item needs a title.', 'title'); end if;
  if t not in ('job_lead', 'signal', 'content_draft', 'event_idea', 'call_writeup', 'follow_up', 'referral', 'client_nudge', 'wider_lead', 'system_notice') then
    return aw_reject('invalid', 'Unknown item type.', 'type');
  end if;
  key := format('%s:%s', t, norm_text(d ->> 'title'));
  select i.id into existing from inbox_items i where i.dedup_key = key and i.status not in ('binned')
    and (t <> 'event_idea' or i.created_at >= now() - interval '90 days');
  if existing is not null then return jsonb_build_object('outcome', 'merged', 'id', existing, 'inbox_item_id', existing, 'note', 'Already in the Inbox.'); end if;
  item := aw_inbox(p_run, p_agent, t, d ->> 'title', d, key, coalesce((d ->> 'rank')::numeric, 10), aw_find_person(d ->> 'person_name', d ->> 'company'), null, null, d ->> 'draft');
  if item is null then return jsonb_build_object('outcome', 'merged', 'note', 'Already in the Inbox.'); end if;
  return jsonb_build_object('outcome', 'created', 'id', item, 'inbox_item_id', item);
end $$;

create function public.aw_kpi_event(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := case p_agent when 'a1_review' then array['client_meetings'] when 'a5_followups' then array['client_meetings'] when 'a6_calls' then array['new_a_star', 'coaching_calls', 'client_meetings'] else array[]::text[] end;
  id uuid;
  src uuid;
begin
  if (d ->> 'kpi') <> all(allowed) or d ->> 'kpi' is null then return aw_reject('not_allowed', format('%s may not write that KPI.', p_agent), 'kpi'); end if;
  if nullif(d ->> 'source_ref', '') is null then return aw_reject('invalid', 'A KPI event needs a source reference.', 'source_ref'); end if;
  src := md5(coalesce(d ->> 'source_table', 'agent') || ':' || (d ->> 'source_ref'))::uuid;
  insert into kpi_events (owner_id, kpi, happened_at, source_table, source_id, label, is_pmm, manual)
  values (aw_owner(), d ->> 'kpi', coalesce((d ->> 'happened_at')::timestamptz, now()), 'agent:' || coalesce(d ->> 'source_table', p_agent), src, d ->> 'label', coalesce((d ->> 'is_pmm')::boolean, true), false)
  on conflict (kpi, source_table, source_id) do nothing
  returning kpi_events.id into id;
  if id is null then return jsonb_build_object('outcome', 'merged', 'note', 'Already counted.'); end if;
  return jsonb_build_object('outcome', 'created', 'id', id);
end $$;

create function public.aw_calendar_today(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e jsonb;
  n int := 0;
  person uuid;
begin
  if jsonb_typeof(d -> 'events') <> 'array' then return aw_reject('invalid', 'Send the day as a list of events.', 'events'); end if;
  delete from calendar_today;
  for e in select * from jsonb_array_elements(d -> 'events') loop
    if nullif(e ->> 'title', '') is null or e ->> 'starts_at' is null then continue; end if;
    person := aw_find_person(e ->> 'person_name', null);
    insert into calendar_today (owner_id, starts_at, ends_at, title, call_type, person_id, person_name, is_external, event_ref)
    values (aw_owner(), (e ->> 'starts_at')::timestamptz, (e ->> 'ends_at')::timestamptz, e ->> 'title',
      case when coalesce(e ->> 'call_type', '') in ('candidate_screen', 'coaching', 'client_update', 'reference', 'internal', 'other') then e ->> 'call_type' else 'other' end,
      person, e ->> 'person_name', coalesce((e ->> 'is_external')::boolean, true), e ->> 'event_ref')
    on conflict (event_ref) do nothing;
    n := n + 1;
  end loop;
  return jsonb_build_object('outcome', 'created', 'note', format('%s events for today.', n));
end $$;

create function public.aw_coaching_answers(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  person uuid;
  s coaching_sessions%rowtype;
begin
  person := aw_find_person(d ->> 'person_name', null);
  if person is null then return aw_reject('not_found', 'No person by that name.', 'person_name'); end if;
  select * into s from coaching_sessions where person_id = person order by coalesce(held_at, booked_for) desc nulls last limit 1;
  if s.id is null then return aw_reject('not_found', 'No coaching session for that person.', 'person_name'); end if;
  update coaching_sessions set
    status = case when status in ('booked') then 'held' else status end,
    held_at = coalesce(held_at, (d ->> 'held_at')::timestamptz, now()),
    q_interviewed_where = coalesce(d ->> 'q_interviewed_where', q_interviewed_where),
    q_who_else_looking = coalesce(d ->> 'q_who_else_looking', q_who_else_looking),
    q_how_they_hire = coalesce(d ->> 'q_how_they_hire', q_how_they_hire),
    q_events_rated = coalesce(d ->> 'q_events_rated', q_events_rated),
    advice_given = coalesce(d ->> 'advice_given', advice_given),
    referrals_count = coalesce((d ->> 'referrals_count')::int, referrals_count),
    leads_count = coalesce((d ->> 'leads_count')::int, leads_count)
  where id = s.id;
  return jsonb_build_object('outcome', 'merged', 'id', s.id, 'note', 'Answers added.');
end $$;

create function public.aw_message(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pol send_policies%rowtype;
  person uuid;
  id uuid;
  lvl text;
begin
  select * into pol from send_policies where type = d ->> 'type';
  if pol.type is null then return aw_reject('invalid', 'Unknown message type.', 'type'); end if;
  if coalesce(d ->> 'channel', '') not in ('email', 'linkedin') then return aw_reject('invalid', 'Channel is email or linkedin.', 'channel'); end if;
  if nullif(d ->> 'to_name', '') is null and nullif(d ->> 'person_name', '') is null then return aw_reject('invalid', 'A message needs who it is to.', 'to_name'); end if;
  if coalesce(d ->> 'level', '') = 'automatic' then
    return aw_reject('policy_refused', 'Automatic needs an approved template. Templates arrive with the send engine; send it as a draft.', 'level');
  end if;
  -- The requested level is capped at the policy's level, and at one click until templates exist.
  lvl := case when send_level_rank(coalesce(d ->> 'level', 'draft_only')) <= send_level_rank(pol.level) then coalesce(d ->> 'level', 'draft_only') else pol.level end;
  if lvl = 'automatic' then lvl := 'one_click'; end if;
  person := aw_find_person(coalesce(d ->> 'person_name', d ->> 'to_name'), null);
  insert into messages (owner_id, type, channel, person_id, to_name, subject, body, created_by, level_at_creation, state)
  values (aw_owner(), pol.type, d ->> 'channel', person, coalesce(d ->> 'to_name', d ->> 'person_name'), d ->> 'subject', d ->> 'body', p_agent, lvl, 'draft')
  returning messages.id into id;
  return jsonb_build_object('outcome', 'created', 'id', id, 'note', format('Saved as a draft at %s.', replace(lvl, '_', ' ')));
end $$;

-- ---------------------------------------------------------------- E2

create function public.agent_write(p_run uuid, p_records jsonb) returns jsonb
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
      res := case when kind in ('call', 'content_draft', 'data_point', 'search_counts', 'a_star_suggestion')
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
            end;
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

-- AGW-1: the same batch twice returns the first result.
create function public.agent_write_once(p_run uuid, p_key text, p_records jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  stored jsonb;
  res jsonb;
begin
  if nullif(p_key, '') is not null then
    select response into stored from agent_requests where run_id = p_run and idempotency_key = p_key;
    if stored is not null then return stored || jsonb_build_object('repeated', true); end if;
  end if;
  res := agent_write(p_run, p_records);
  if nullif(p_key, '') is not null then
    insert into agent_requests (run_id, idempotency_key, response) values (p_run, p_key, res) on conflict do nothing;
  end if;
  return res;
end $$;

-- ---------------------------------------------------------------- grants

revoke execute on function public.agent_key_create(text), public.agent_key_revoke(text), public.request_run(text) from public, anon;
grant execute on function public.agent_key_create(text), public.agent_key_revoke(text), public.request_run(text) to authenticated;

revoke execute on function
  public.agent_authenticate(text, text), public.agent_run_start(text, text, text), public.agent_run_finish(uuid, text, jsonb, text, numeric),
  public.agent_context(text, text[]), public.agent_write(uuid, jsonb), public.agent_write_once(uuid, text, jsonb),
  public.aw_owner(), public.aw_find_person(text, text), public.aw_person_upsert(text, text, text, text, text, text), public.aw_blocked(text, text),
  public.aw_inbox(uuid, text, text, text, jsonb, text, numeric, uuid, text, uuid, text),
  public.aw_job_lead(uuid, text, jsonb), public.aw_wider_lead(uuid, text, jsonb), public.aw_signal(uuid, text, jsonb), public.aw_person(uuid, text, jsonb),
  public.aw_follow_up(uuid, text, jsonb), public.aw_referral(uuid, text, jsonb), public.aw_touch(uuid, text, jsonb), public.aw_inbox_item(uuid, text, jsonb, text),
  public.aw_kpi_event(uuid, text, jsonb), public.aw_calendar_today(uuid, text, jsonb), public.aw_coaching_answers(uuid, text, jsonb), public.aw_message(uuid, text, jsonb)
from public, anon, authenticated;
grant execute on function
  public.agent_authenticate(text, text), public.agent_run_start(text, text, text), public.agent_run_finish(uuid, text, jsonb, text, numeric),
  public.agent_context(text, text[]), public.agent_write(uuid, jsonb), public.agent_write_once(uuid, text, jsonb)
to service_role;
