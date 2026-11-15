-- 0032 Business development (Jason's notes of 14 November 2026, written up
-- in docs/business-development-brief.md; Pending in docs/decisions.md).
-- 1. The outreach ladder on a job lead: Found, Connection sent, Connected,
--    Messaged, Replied, with a date for each step, the two staged messages,
--    and the write kind outreach_step so the jobs agent records each step
--    through agent-write. Nothing here sends anything.
-- 2. Referrals and leads: the three call questions on a referral, and one
--    step to turn a company lead into a job lead.
-- 3. UK to US: a flag on job leads and signals that the agents may set.
-- 4. Accounts: the group's clients and the owner's own accounts, thin
--    references the agents read so they can watch for hiring.
-- 5. Agents carry the connections they use and plain criteria the owner
--    edits, and run-start hands both to the agent.

-- ---------------------------------------------------------------- 1. the ladder

alter table public.job_leads
  add column outreach_stage text not null default 'found' check (outreach_stage in ('found', 'connection_sent', 'connected', 'messaged', 'replied')),
  add column outreach_connection_on date,
  add column outreach_connected_on date,
  add column outreach_messaged_on date,
  add column outreach_replied_on date,
  add column reply_outcome text check (reply_outcome is null or reply_outcome in ('interested', 'not_interested', 'no_answer')),
  add column connection_note text,
  add column first_message text,
  add column uk_to_us boolean not null default false;
create index job_leads_outreach on public.job_leads (outreach_stage);
create index job_leads_uk_to_us on public.job_leads (uk_to_us) where uk_to_us;

create function public.job_leads_outreach_dates() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.outreach_stage is distinct from old.outreach_stage then
    if new.outreach_stage = 'connection_sent' then new.outreach_connection_on := coalesce(new.outreach_connection_on, current_date);
    elsif new.outreach_stage = 'connected' then new.outreach_connected_on := coalesce(new.outreach_connected_on, current_date);
    elsif new.outreach_stage = 'messaged' then new.outreach_messaged_on := coalesce(new.outreach_messaged_on, current_date);
    elsif new.outreach_stage = 'replied' then new.outreach_replied_on := coalesce(new.outreach_replied_on, current_date);
    end if;
  end if;
  return new;
end $$;
create trigger t_outreach before update on public.job_leads for each row execute function public.job_leads_outreach_dates();

create function public.aw_outreach_step(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  lead job_leads%rowtype;
  step text := d ->> 'step';
  outcome text := d ->> 'outcome';
  on_date date;
begin
  if step is null or step not in ('connection_sent', 'connected', 'messaged', 'replied') then
    return aw_reject('invalid', 'A step is connection_sent, connected, messaged or replied.', 'step');
  end if;
  if outcome is not null and outcome not in ('interested', 'not_interested', 'no_answer') then
    return aw_reject('invalid', 'An outcome is interested, not_interested or no_answer.', 'outcome');
  end if;
  if nullif(d ->> 'lead_id', '') is not null then
    select * into lead from job_leads where id = (d ->> 'lead_id')::uuid;
  end if;
  if lead.id is null and norm_company(d ->> 'company') is not null then
    select * into lead from job_leads
    where company_key = norm_company(d ->> 'company')
      and (nullif(d ->> 'role', '') is null or role_key = norm_role(d ->> 'role'))
      and stage not in ('dead', 'passed')
    order by created_at desc limit 1;
  end if;
  if lead.id is null then return aw_reject('not_found', 'No open lead for that company.', 'company'); end if;
  begin
    on_date := coalesce((d ->> 'on')::date, current_date);
  exception when others then on_date := current_date; end;
  update job_leads set
    outreach_stage = step,
    outreach_connection_on = case when step = 'connection_sent' then coalesce(outreach_connection_on, on_date) else outreach_connection_on end,
    outreach_connected_on = case when step = 'connected' then coalesce(outreach_connected_on, on_date) else outreach_connected_on end,
    outreach_messaged_on = case when step = 'messaged' then coalesce(outreach_messaged_on, on_date) else outreach_messaged_on end,
    outreach_replied_on = case when step = 'replied' then coalesce(outreach_replied_on, on_date) else outreach_replied_on end,
    connection_note = case when step = 'connection_sent' then coalesce(nullif(d ->> 'note', ''), connection_note) else connection_note end,
    first_message = case when step = 'messaged' then coalesce(nullif(d ->> 'note', ''), first_message) else first_message end,
    reply_outcome = case when step = 'replied' then coalesce(outcome, reply_outcome) else reply_outcome end
  where id = lead.id;
  return jsonb_build_object('outcome', 'merged', 'id', lead.id, 'note', format('Outreach: %s', step));
end $$;
revoke execute on function public.aw_outreach_step(uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. referrals and leads

alter table public.referrals
  add column hiring_manager_name text,
  add column hiring_manager_url text,
  add column sourced_via text check (sourced_via is null or sourced_via in ('recruiter', 'direct', 'unknown')),
  add column job_open text check (job_open is null or job_open in ('yes', 'no', 'unknown')),
  add column job_lead_id uuid references public.job_leads (id);

create function public.referral_to_job_lead(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r referrals%rowtype;
  lead uuid;
begin
  if app_role() <> 'owner' then raise exception 'Only the owner can do that'; end if;
  select * into r from referrals where id = p_id;
  if r.id is null then raise exception 'No such referral'; end if;
  if r.job_lead_id is not null then return r.job_lead_id; end if;
  if nullif(btrim(coalesce(r.referred_company, '')), '') is null then raise exception 'The referral needs a company first'; end if;
  insert into job_leads (owner_id, company, company_key, role, role_key, sources, source_urls, poster_name, poster_profile_url)
  values (r.owner_id, r.referred_company, norm_company(r.referred_company), 'Product marketing hire', norm_role('Product marketing hire'), array['referral'],
    case when nullif(r.hiring_manager_url, '') is not null then array[r.hiring_manager_url] else '{}'::text[] end, r.hiring_manager_name, r.hiring_manager_url)
  returning id into lead;
  update referrals set job_lead_id = lead where id = p_id;
  perform write_audit('referral to job lead', 'referrals', p_id, jsonb_build_object('job_lead_id', lead));
  return lead;
end $$;
revoke execute on function public.referral_to_job_lead(uuid) from public, anon;
grant execute on function public.referral_to_job_lead(uuid) to authenticated;

-- ---------------------------------------------------------------- 3. UK to US

alter table public.signals add column uk_to_us boolean not null default false;
create index signals_uk_to_us on public.signals (uk_to_us) where uk_to_us;

-- ---------------------------------------------------------------- 4. accounts

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  company text not null,
  company_key text not null,
  kind text not null check (kind in ('group_client', 'my_account')),
  -- The colleague who owns the relationship, where it is not the owner's own.
  colleague text,
  contact_name text,
  contact_title text,
  functions text[] not null default '{}',
  crm_url text,
  notes text,
  active boolean not null default true,
  introduced_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_key, kind)
);
create trigger t_own before insert on public.accounts for each row execute function public.set_owner();
create trigger t_upd before update on public.accounts for each row execute function public.set_updated_at();
revoke all on public.accounts from anon;
revoke delete, truncate, references, trigger on public.accounts from authenticated;
grant select, insert, update on public.accounts to authenticated;

alter table public.wider_leads add column account_id uuid references public.accounts (id);

-- ---------------------------------------------------------------- 5. agents

alter table public.agents
  add column connections text[] not null default '{}',
  add column criteria jsonb not null default '{}';

-- The owner edits these two columns from the agent window; the rest of the row stays the migrations' and the functions'.
grant select (connections, criteria), update (connections, criteria) on public.agents to authenticated;

update public.agents set connections = array['claude'] where code = 'a1_review';
update public.agents set connections = array['linkedin_read', 'claude'], criteria = '{"posts_a_week": 2}' where code = 'a2_content';
update public.agents set connections = array['linkedin_scraper', 'outlook_mail', 'claude'], criteria = '{"lookback_days": 7, "icp": "B2B software, US, product marketing"}' where code = 'a3_jobs';
update public.agents set connections = array['linkedin_read', 'claude'], criteria = '{"lookback_days": 7, "uk_to_us": true}' where code = 'a4_signals';
update public.agents set connections = array['outlook_mail', 'outlook_calendar', 'claude'] where code = 'a5_followups';
update public.agents set connections = array['granola', 'crm', 'claude'] where code = 'a6_calls';
update public.agents set connections = array['granola', 'claude'] where code = 'a7_events';

-- ---------------------------------------------------------------- the contract, extended

create or replace function public.aw_may_send(p_agent text, p_kind text) returns boolean
language sql immutable as $$
  select p_kind = any(case p_agent
    when 'a1_review' then array['inbox_item', 'message', 'kpi_event']
    when 'a2_content' then array['content_draft', 'data_point']
    when 'a3_jobs' then array['job_lead', 'wider_lead', 'person', 'message', 'a_star_suggestion', 'outreach_step']
    when 'a4_signals' then array['signal', 'person', 'message']
    when 'a5_followups' then array['person', 'follow_up', 'message', 'touch', 'calendar_today', 'kpi_event']
    when 'a6_calls' then array['wider_lead', 'person', 'follow_up', 'message', 'call', 'referral', 'coaching_answers', 'touch', 'search_counts', 'kpi_event']
    when 'a7_events' then array['inbox_item', 'event_idea']
    else array[]::text[] end)
$$;

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
    'requests', reqs,
    'connections', to_jsonb(a.connections),
    'criteria', a.criteria
  );
end $$;
