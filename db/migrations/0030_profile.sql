-- 0030 The profile summary (Mia, 14 November 2026, Pending Jason in
-- docs/decisions.md): every person keeps a link to their LinkedIn profile,
-- and a short description pulled in from it by the signals agent on request.
-- LinkedIn has no profile API and the browser never scrapes, so the owner
-- asks from the person card, the request is queued for A4, and A4 writes the
-- summary back through agent-write like any other person record. The summary
-- is 600 characters at most and carries no email address or phone number:
-- the CRM stays the record (rule 1).

alter table public.people
  add column profile_summary text check (profile_summary is null or length(profile_summary) <= 600),
  add column profile_pulled_at timestamptz;

-- A run request can carry a note, such as profile:<person id>, which the
-- agent reads at run-start. Requests with a note are not folded into one.
alter table public.run_requests add column note text;

create function public.request_run(p_agent text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  id uuid;
begin
  if app_role() <> 'owner' then
    raise exception 'Only the owner can ask for a run';
  end if;
  if nullif(btrim(p_note), '') is null then
    return request_run(p_agent);
  end if;
  if exists (select 1 from run_requests where agent = p_agent and taken_at is null and note = p_note) then
    select r.id into id from run_requests r where r.agent = p_agent and r.taken_at is null and r.note = p_note limit 1;
    return id;
  end if;
  insert into run_requests (agent, requested_by, note) values (p_agent, coalesce(auth.jwt() ->> 'email', 'owner'), p_note) returning run_requests.id into id;
  return id;
end $$;
revoke execute on function public.request_run(text, text) from public, anon;
grant execute on function public.request_run(text, text) to authenticated;

create or replace function public.agent_run_start(p_agent text, p_trigger text, p_mode text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  reqs jsonb;
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
  -- The notes of the requests this run takes, such as profile:<person id>.
  select coalesce(jsonb_agg(note) filter (where note is not null), '[]') into reqs from run_requests where agent = p_agent and taken_at is null;
  update run_requests set taken_at = now() where agent = p_agent and taken_at is null;

  return jsonb_build_object(
    'run_id', run_id,
    'enabled', true,
    'prompt', case when prompt.id is null then null else jsonb_build_object('version', prompt.version, 'body', prompt.body, 'blocks', blocks) end,
    'settings', jsonb_build_object('lookback_from', coalesce(lookback, current_date - 7), 'per_run_caps', caps),
    'paused', jsonb_build_object('all_sending', paused),
    'requests', reqs
  );
end $$;


create or replace function public.aw_allowed_fields(p_kind text) returns text[]
language sql immutable as $$
  select case p_kind
    when 'inbox_item' then array['type', 'title', 'why', 'suggested_action', 'draft', 'source', 'source_url', 'links', 'rank', 'company', 'role', 'location', 'person_name']
    when 'job_lead' then array['company', 'role', 'function', 'level', 'location', 'city', 'country', 'source', 'source_url', 'poster_name', 'poster_title', 'poster_profile_url', 'company_size', 'fit_score', 'fit_reason', 'existing_client', 'spec_draft', 'why', 'matched']
    when 'wider_lead' then array['company', 'role', 'function', 'country', 'location', 'source', 'mentioned_by_name', 'existing_client', 'notes', 'why']
    when 'signal' then array['person_name', 'company', 'title', 'city', 'signal_type', 'strength', 'detail', 'source', 'source_url', 'seen_on', 'in_icp', 'draft']
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
    when 'data_point' then array['statement', 'value', 'as_of', 'category', 'source_name', 'source_url']
    else null end
$$;


create or replace function public.aw_person(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  id uuid;
  was uuid;
begin
  if norm_text(d ->> 'display_name') is null then return aw_reject('invalid', 'A person needs a name.', 'display_name'); end if;
  if coalesce((d ->> 'in_crm')::boolean, false) and nullif(d ->> 'email', '') is not null then
    return aw_reject('invalid', 'A person in the CRM carries no email here.', 'email');
  end if;
  if length(coalesce(d ->> 'profile_summary', '')) > 600 then
    return aw_reject('invalid', 'A profile summary is 600 characters at most.', 'profile_summary');
  end if;
  if coalesce(d ->> 'profile_summary', '') ~* '(@|\+?\d[\d ().-]{8,}\d)' then
    return aw_reject('policy_refused', 'A profile summary carries no email address or phone number.', 'profile_summary');
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
      profile_summary = coalesce(nullif(btrim(d ->> 'profile_summary'), ''), profile_summary),
      profile_pulled_at = case when nullif(btrim(d ->> 'profile_summary'), '') is not null then now() else profile_pulled_at end,
      in_crm = in_crm or coalesce((d ->> 'in_crm')::boolean, false),
      email = case when in_crm or coalesce((d ->> 'in_crm')::boolean, false) then null else coalesce(d ->> 'email', email) end,
      refreshed_on = current_date
    where people.id = was;
    return jsonb_build_object('outcome', 'merged', 'id', was);
  end if;
  insert into people (owner_id, display_name, name_key, display_title, display_company, company_key, city, kind, crm, crm_ref, crm_url, linkedin_url, email, in_crm, refreshed_on, profile_summary, profile_pulled_at)
  values (aw_owner(), btrim(d ->> 'display_name'), norm_text(d ->> 'display_name'), d ->> 'display_title', d ->> 'display_company', norm_company(d ->> 'display_company'),
    d ->> 'city', coalesce(d ->> 'kind', 'unknown'), d ->> 'crm', d ->> 'crm_ref', d ->> 'crm_url', d ->> 'linkedin_url', nullif(d ->> 'email', ''), coalesce((d ->> 'in_crm')::boolean, false), current_date,
    nullif(btrim(d ->> 'profile_summary'), ''), case when nullif(btrim(d ->> 'profile_summary'), '') is not null then now() end)
  returning people.id into id;
  return jsonb_build_object('outcome', 'created', 'id', id);
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

