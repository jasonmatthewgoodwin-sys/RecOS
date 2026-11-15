-- 0040 The campaign runner (Mia, 15 November 2026: Spott runs the email campaigns)
--
-- Add to campaign on an ad and post chaser makes a campaign in RecOS. A new
-- agent, A8 Campaign runner, reads the planned and running campaigns through
-- the context endpoint, enrols the person in the right Spott sequence with
-- Jason's own Spott connector, and reports each step back through
-- agent-write as a campaign_step. RecOS never holds a Spott key, an email
-- address or the sequence's content: the CRM stays the record.
--
-- A campaign_step is enrolled, email_sent, replied, call_booked, done or
-- failed. It moves the campaign's state, ticks the matching step, and keeps
-- the counts Content, Campaigns shows.

-- ---------------------------------------------------------------- the agent
insert into public.agents (code, name, schedule, model_tier, connections)
values ('a8_campaigns', 'Campaign runner', 'Weekdays 09:10 and 15:10', 'light', array['crm', 'claude'])
on conflict (code) do nothing;

-- The Spott sequence or record the campaign lives in: a reference and a link, nothing more.
alter table public.campaigns
  add column crm_ref text,
  add column crm_url text;

-- ---------------------------------------------------------------- the write
create function public.aw_campaign_step(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c campaigns%rowtype;
  step text := d ->> 'step';
  outcome text := nullif(d ->> 'outcome', '');
  note text := nullif(d ->> 'note', '');
  on_date date;
  new_steps jsonb;
  i int;
  ch text;
  done boolean := false;
begin
  if step is null or step not in ('enrolled', 'email_sent', 'replied', 'call_booked', 'done', 'failed') then
    return aw_reject('invalid', 'A step is enrolled, email_sent, replied, call_booked, done or failed.', 'step');
  end if;
  if nullif(d ->> 'campaign_id', '') is null then return aw_reject('invalid', 'campaign_id is needed.', 'campaign_id'); end if;
  begin
    select * into c from campaigns where id = (d ->> 'campaign_id')::uuid;
  exception when others then
    return aw_reject('invalid', 'campaign_id is not an id.', 'campaign_id');
  end;
  if c.id is null then return aw_reject('not_found', 'No such campaign.', 'campaign_id'); end if;
  begin
    on_date := coalesce((d ->> 'on')::date, current_date);
  exception when others then on_date := current_date; end;
  new_steps := coalesce(c.steps, '[]'::jsonb);

  -- Tick the first step of a channel that is not done yet.
  ch := case step when 'email_sent' then 'email' when 'call_booked' then 'phone' else null end;
  if ch is not null and jsonb_typeof(new_steps) = 'array' then
    for i in 0 .. jsonb_array_length(new_steps) - 1 loop
      if not done and new_steps -> i ->> 'channel' = ch and nullif(new_steps -> i ->> 'doneOn', '') is null then
        new_steps := jsonb_set(new_steps, array[i::text, 'doneOn'], to_jsonb(on_date::text));
        done := true;
      end if;
    end loop;
  end if;

  update campaigns set
    status = case when step in ('enrolled', 'email_sent', 'replied', 'call_booked') then (case when status = 'done' then status else 'running' end) when step = 'done' then 'done' else status end,
    started_on = case when step in ('enrolled', 'email_sent') then coalesce(started_on, on_date) else started_on end,
    ended_on = case when step = 'done' then coalesce(ended_on, on_date) else ended_on end,
    steps = new_steps,
    contacted = case when step = 'email_sent' and contacted = 0 then 1 else contacted end,
    replies = case when step = 'replied' then replies + 1 else replies end,
    calls_booked = case when step = 'call_booked' then calls_booked + 1 else calls_booked end,
    crm_ref = coalesce(nullif(d ->> 'crm_ref', ''), crm_ref),
    crm_url = coalesce(nullif(d ->> 'crm_url', ''), crm_url),
    notes = case
      when step = 'failed' then concat_ws(E'\n', notes, format('Spott, %s: %s', on_date, coalesce(note, 'the step failed')))
      when step = 'replied' then concat_ws(E'\n', notes, format('Replied %s%s', on_date, case when outcome is not null then ', ' || outcome else '' end))
      when note is not null then concat_ws(E'\n', notes, note)
      else notes end
  where id = c.id;
  return jsonb_build_object('outcome', 'merged', 'id', c.id, 'note', format('Campaign: %s', step));
end $$;
revoke execute on function public.aw_campaign_step(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.aw_campaign_step(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------- the contract
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
    when 'message' then array['type', 'channel', 'person_name', 'company', 'to_name', 'subject', 'body', 'level', 'variables', 'search_id', 'follow_up_id', 'call_id']
    when 'opt_out' then array['person_name', 'company', 'phrase', 'source_url']
    when 'content_draft' then array['kind', 'run_source', 'angle', 'topic', 'hook', 'body', 'close_line', 'hashtags', 'data_point', 'data_point_url', 'prompted_by', 'prompted_by_url']
    when 'outreach_step' then array['lead_id', 'company', 'role', 'step', 'on', 'note', 'outcome']
    when 'call' then array['granola_ref', 'granola_url', 'calendar_ref', 'title', 'held_at', 'minutes', 'call_type', 'person_name', 'company', 'search_client', 'search_role', 'match_confidence', 'w_record', 'w_cv', 'w_note', 'w_on_search', 'w_follow_up', 'cv_requested', 'crm_note_ref', 'is_new_a_star', 'skip_reason']
    when 'search_counts' then array['search_id', 'search_client', 'search_role', 'n_sourced', 'n_spoken', 'n_submitted', 'n_first_stage', 'n_later_stage', 'n_offer', 'last_client_contact_on', 'waiting_on']
    when 'a_star_suggestion' then array['name', 'title', 'company', 'city', 'linkedin_url', 'why', 'week']
    when 'data_point' then array['statement', 'value', 'as_of', 'category', 'source_name', 'source_url']
    when 'campaign_step' then array['campaign_id', 'step', 'on', 'note', 'outcome', 'crm_ref', 'crm_url']
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
    when 'a6_calls' then array['wider_lead', 'person', 'follow_up', 'message', 'call', 'referral', 'coaching_answers', 'touch', 'search_counts', 'kpi_event', 'opt_out']
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

-- ---------------------------------------------------------------- the context
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
      else '{}'::jsonb end;
  end loop;
  return out;
end $$;
