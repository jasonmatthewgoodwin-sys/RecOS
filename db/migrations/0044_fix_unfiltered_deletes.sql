-- 0044 Two deletes with no WHERE clause. Supabase runs pg_safeupdate, which
-- refuses DELETE without a WHERE, so:
--   aw_calendar_today (0025) rejected every calendar write ("DELETE requires a
--   WHERE clause"), so Calls today was never filled by the A5 calendar run;
--   retention_job (0024) logged an error every night instead of emptying
--   calendar_today.
-- Found on 15 November by the first live A5 calendar run. Bodies are as before
-- except for `where true`.
create or replace function public.aw_calendar_today(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e jsonb;
  n int := 0;
  person uuid;
begin
  if jsonb_typeof(d -> 'events') <> 'array' then return aw_reject('invalid', 'Send the day as a list of events.', 'events'); end if;
  delete from calendar_today where true;
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

  -- calendar_today: emptied every night. The morning refresh fills it again.
  begin
    delete from calendar_today where true;
    get diagnostics n = row_count; counts := counts || jsonb_build_object('calendar_today', n);
  exception when others then errors := errors || jsonb_build_object('calendar_today', sqlerrm); end;

  if errors <> '{}' then counts := counts || jsonb_build_object('errors', errors); end if;
  perform write_audit('retention run', null, null, counts);
  return counts;
end $$;

