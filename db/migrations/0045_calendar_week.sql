-- 0045 Calls for the next seven days (Jason, 15 November 2026: "view his week
-- as well and flick through the calls in each day for the next 7 days").
--
-- calendar_today now holds today and the six days after it. The name stays so
-- nothing that reads it breaks; "today" in the name is historical. Readers that
-- mean today (Home's Calls today number and the day view) filter to the UK day.
--
-- Days are UK days throughout: a day D runs from D 00:00 to D+1 00:00
-- Europe/London.
--
-- aw_calendar_today replaces only the days a batch covers:
--   {"from":"YYYY-MM-DD","to":"YYYY-MM-DD","events":[...]} clears from..to
--     (an empty list clears those days) and keeps only events inside them;
--   {"events":[...]} with no range clears the first to the last day of the
--     events sent; an empty list with no range clears today, as before.
-- A range is at most 14 days. Every delete has a WHERE (pg_safeupdate, 0044).
-- An event already held under the same Outlook reference is updated in place,
-- so a call moved to another day moves rather than being skipped.
--
-- retention_job: only rows that started before today (UK) are removed; the
-- days ahead stay until the next refresh replaces them.

comment on table public.calendar_today is
  'Calendar cache for today and the next six days (0045). The name is historical. Filled by the A5 calendar run through aw_calendar_today, which replaces only the days a batch covers; retention_job removes days before today.';

-- The UK day a moment falls on.
create or replace function public.uk_day(p_at timestamptz) returns date
language sql stable as $$ select (p_at at time zone 'Europe/London')::date $$;

-- The moment a UK day starts.
create or replace function public.uk_day_start(p_day date) returns timestamptz
language sql stable as $$ select (p_day::timestamp) at time zone 'Europe/London' $$;

create or replace function public.aw_calendar_today(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e jsonb;
  n int := 0;
  skipped int := 0;
  person uuid;
  day_from date;
  day_to date;
  t_start timestamptz;
begin
  if jsonb_typeof(d -> 'events') is distinct from 'array' then return aw_reject('invalid', 'Send the days as a list of events.', 'events'); end if;

  if d ? 'from' or d ? 'to' then
    if coalesce(d ->> 'from', '') !~ '^\d{4}-\d{2}-\d{2}$' then return aw_reject('invalid', 'from must be a date, YYYY-MM-DD.', 'from'); end if;
    if coalesce(d ->> 'to', '') !~ '^\d{4}-\d{2}-\d{2}$' then return aw_reject('invalid', 'to must be a date, YYYY-MM-DD.', 'to'); end if;
    begin
      day_from := (d ->> 'from')::date;
      day_to := (d ->> 'to')::date;
    exception when others then
      return aw_reject('invalid', 'from and to must be real dates.', 'from');
    end;
  else
    -- No range: the days the events fall on, or today for an empty list.
    select min(uk_day((x ->> 'starts_at')::timestamptz)), max(uk_day((x ->> 'starts_at')::timestamptz))
      into day_from, day_to
    from jsonb_array_elements(d -> 'events') x
    where nullif(x ->> 'starts_at', '') is not null;
    day_from := coalesce(day_from, uk_day(now()));
    day_to := coalesce(day_to, day_from);
  end if;

  if day_to < day_from then return aw_reject('invalid', 'to is before from.', 'to'); end if;
  if day_to - day_from > 13 then return aw_reject('invalid', 'Send at most 14 days at once.', 'to'); end if;

  delete from calendar_today
  where starts_at >= uk_day_start(day_from) and starts_at < uk_day_start(day_to + 1);

  for e in select * from jsonb_array_elements(d -> 'events') loop
    if nullif(e ->> 'title', '') is null or nullif(e ->> 'starts_at', '') is null then skipped := skipped + 1; continue; end if;
    t_start := (e ->> 'starts_at')::timestamptz;
    if uk_day(t_start) < day_from or uk_day(t_start) > day_to then skipped := skipped + 1; continue; end if;
    person := aw_find_person(e ->> 'person_name', null);
    insert into calendar_today (owner_id, starts_at, ends_at, title, call_type, person_id, person_name, is_external, event_ref)
    values (aw_owner(), t_start, (e ->> 'ends_at')::timestamptz, e ->> 'title',
      case when coalesce(e ->> 'call_type', '') in ('candidate_screen', 'coaching', 'client_update', 'reference', 'internal', 'other') then e ->> 'call_type' else 'other' end,
      person, e ->> 'person_name', coalesce((e ->> 'is_external')::boolean, true), e ->> 'event_ref')
    on conflict (event_ref) do update set
      starts_at = excluded.starts_at, ends_at = excluded.ends_at, title = excluded.title, call_type = excluded.call_type,
      person_id = excluded.person_id, person_name = excluded.person_name, is_external = excluded.is_external;
    n := n + 1;
  end loop;

  return jsonb_build_object('outcome', 'created',
    'note', format('%s events for %s to %s.', n, day_from, day_to) || case when skipped > 0 then format(' %s skipped (no title or start, or outside the days).', skipped) else '' end);
end $$;

-- The agent may now send from and to with the events. Body as in 0040 otherwise.
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
    when 'search_counts' then array['search_id', 'search_client', 'search_role', 'n_sourced', 'n_spoken', 'n_submitted', 'n_first_stage', 'n_later_stage', 'n_offer', 'last_client_contact_on', 'waiting_on']
    when 'a_star_suggestion' then array['name', 'title', 'company', 'city', 'linkedin_url', 'why', 'week']
    when 'data_point' then array['statement', 'value', 'as_of', 'category', 'source_name', 'source_url']
    when 'campaign_step' then array['campaign_id', 'step', 'on', 'note', 'outcome', 'crm_ref', 'crm_url']
    else null end
$$;

-- retention_job: as in 0044 except the calendar_today block.
create or replace function public.retention_job() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  counts jsonb := '{}';
  errors jsonb := '{}';
  n int;
begin
  -- inbox_items: drafts cleared 30 days after closing; rows removed by purge_after.
  begin
    update inbox_items set draft = null, draft_original = null
    where closed_at < now() - interval '30 days' and (draft is not null or draft_original is not null);
    get diagnostics n = row_count; counts := counts || jsonb_build_object('inbox_drafts_cleared', n);
    delete from inbox_items where purge_after < current_date;
    get diagnostics n = row_count; counts := counts || jsonb_build_object('inbox_items', n);
  exception when others then errors := errors || jsonb_build_object('inbox_items', sqlerrm); end;

  -- messages: body, subject, address and variables cleared 30 days after sent or cancelled; removed after 24 months.
  begin
    update messages set body = null, subject = null, to_address = null, variables = '{}'
    where ((state = 'sent' and sent_at < now() - interval '30 days') or (state = 'cancelled' and updated_at < now() - interval '30 days'))
      and (body is not null or subject is not null or to_address is not null or variables <> '{}');
    get diagnostics n = row_count; counts := counts || jsonb_build_object('messages_cleared', n);
    delete from send_log where logged_at < now() - interval '24 months'
      or message_id in (select id from messages where created_at < now() - interval '24 months');
    get diagnostics n = row_count; counts := counts || jsonb_build_object('send_log', n);
    update follow_ups set message_id = null where message_id in (select id from messages where created_at < now() - interval '24 months');
    update signals set message_id = null where message_id in (select id from messages where created_at < now() - interval '24 months');
    update job_leads set spec_message_id = null where spec_message_id in (select id from messages where created_at < now() - interval '24 months');
    update wider_leads set intro_message_id = null where intro_message_id in (select id from messages where created_at < now() - interval '24 months');
    update weekly_reviews set summary_message_id = null where summary_message_id in (select id from messages where created_at < now() - interval '24 months');
    delete from messages where created_at < now() - interval '24 months';
    get diagnostics n = row_count; counts := counts || jsonb_build_object('messages', n);
  exception when others then errors := errors || jsonb_build_object('messages', sqlerrm); end;

  begin
    delete from follow_ups where purge_after < current_date;
    get diagnostics n = row_count; counts := counts || jsonb_build_object('follow_ups', n);
  exception when others then errors := errors || jsonb_build_object('follow_ups', sqlerrm); end;

  -- job_leads: 12 months after going dead, or after last seen if never chased.
  begin
    delete from job_leads
    where purge_after < current_date
       or (chased_on is null and stage = 'new' and last_seen_on < current_date - interval '12 months');
    get diagnostics n = row_count; counts := counts || jsonb_build_object('job_leads', n);
  exception when others then errors := errors || jsonb_build_object('job_leads', sqlerrm); end;

  begin
    delete from signals where purge_after < current_date;
    get diagnostics n = row_count; counts := counts || jsonb_build_object('signals', n);
  exception when others then errors := errors || jsonb_build_object('signals', sqlerrm); end;

  begin
    delete from referrals where purge_after < current_date;
    get diagnostics n = row_count; counts := counts || jsonb_build_object('referrals', n);
  exception when others then errors := errors || jsonb_build_object('referrals', sqlerrm); end;

  begin
    delete from touches where purge_after < current_date;
    get diagnostics n = row_count; counts := counts || jsonb_build_object('touches', n);
  exception when others then errors := errors || jsonb_build_object('touches', sqlerrm); end;

  -- coaching_sessions: the four answers and the advice cleared after 12 months.
  begin
    update coaching_sessions
    set q_interviewed_where = null, q_who_else_looking = null, q_how_they_hire = null, q_events_rated = null, advice_given = null
    where held_at < now() - interval '12 months'
      and (q_interviewed_where is not null or q_who_else_looking is not null or q_how_they_hire is not null or q_events_rated is not null or advice_given is not null);
    get diagnostics n = row_count; counts := counts || jsonb_build_object('coaching_cleared', n);
  exception when others then errors := errors || jsonb_build_object('coaching_sessions', sqlerrm); end;

  -- league_members: 12 months after removal, with history.
  begin
    delete from league_history where member_id in (select id from league_members where purge_after < current_date);
    delete from league_members where purge_after < current_date;
    get diagnostics n = row_count; counts := counts || jsonb_build_object('league_members', n);
  exception when others then errors := errors || jsonb_build_object('league_members', sqlerrm); end;

  -- agent_runs: 90 days. Inbox items keep their text and lose the link to the run.
  begin
    update inbox_items set run_id = null where run_id in (select id from agent_runs where started_at < now() - interval '90 days');
    update agents a set last_run_id = null where last_run_id in (select id from agent_runs where started_at < now() - interval '90 days');
    delete from agent_runs where started_at < now() - interval '90 days';
    get diagnostics n = row_count; counts := counts || jsonb_build_object('agent_runs', n);
  exception when others then errors := errors || jsonb_build_object('agent_runs', sqlerrm); end;

  begin
    delete from audit_log where at < now() - interval '24 months';
    get diagnostics n = row_count; counts := counts || jsonb_build_object('audit_log', n);
  exception when others then errors := errors || jsonb_build_object('audit_log', sqlerrm); end;

  -- people: nothing refers to them and not updated for 12 months.
  begin
    delete from people p
    where p.updated_at < now() - interval '12 months'
      and not exists (select 1 from inbox_items where person_id = p.id)
      and not exists (select 1 from messages where person_id = p.id)
      and not exists (select 1 from follow_ups where person_id = p.id)
      and not exists (select 1 from calendar_today where person_id = p.id)
      and not exists (select 1 from coaching_sessions where person_id = p.id)
      and not exists (select 1 from referrals where referred_person_id = p.id or referred_by_id = p.id)
      and not exists (select 1 from league_members where person_id = p.id)
      and not exists (select 1 from touches where person_id = p.id)
      and not exists (select 1 from signals where person_id = p.id)
      and not exists (select 1 from job_leads where hiring_manager_id = p.id)
      and not exists (select 1 from wider_leads where mentioned_by_id = p.id)
      and not exists (select 1 from target_companies where marketing_lead_id = p.id)
      and not exists (select 1 from do_not_contact where person_id = p.id);
    get diagnostics n = row_count; counts := counts || jsonb_build_object('people', n);
  exception when others then errors := errors || jsonb_build_object('people', sqlerrm); end;

  -- calendar_today (0045): holds the next seven days, so only days before today
  -- (UK) go. The days ahead stay until the next calendar run replaces them.
  begin
    delete from calendar_today where starts_at < uk_day_start(uk_day(now()));
    get diagnostics n = row_count; counts := counts || jsonb_build_object('calendar_today', n);
  exception when others then errors := errors || jsonb_build_object('calendar_today', sqlerrm); end;

  if errors <> '{}' then counts := counts || jsonb_build_object('errors', errors); end if;
  perform write_audit('retention run', null, null, counts);
  return counts;
end $$;

