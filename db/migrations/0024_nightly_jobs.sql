-- 0024 The nightly job (sections 33.8, 34.5, 13.4, 21, P1-47): retention,
-- the sweeps that move rows on by date, and the monitoring checks that raise
-- a system notice. One function, nightly(), runs the three in order and
-- writes one audit row with the counts. It is scheduled by db/jobs/schedule.sql
-- (pg_cron, 02:00) and can be run by hand with select nightly().
--
-- Nothing here is callable by a browser role. The functions run with the
-- definer's rights and are granted to service_role only.

-- 34.5. Each rule is its own step; a step that fails is recorded under
-- "errors" and the rest still run, so one bad row cannot stop the night.
create function public.retention_job() returns jsonb
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
    delete from calendar_today;
    get diagnostics n = row_count; counts := counts || jsonb_build_object('calendar_today', n);
  exception when others then errors := errors || jsonb_build_object('calendar_today', sqlerrm); end;

  if errors <> '{}' then counts := counts || jsonb_build_object('errors', errors); end if;
  perform write_audit('retention run', null, null, counts);
  return counts;
end $$;

-- The sweeps that move rows on by date (INB stale, follow-up snoozes, league
-- cycles, signal expiry, runs that never finished).
create function public.nightly_sweeps() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  counts jsonb := '{}';
  n int;
  stale_days int;
begin
  select stale_after_days into stale_days from app_settings;

  update inbox_items set status = 'stale'
  where status = 'new' and created_at < now() - make_interval(days => coalesce(stale_days, 14));
  get diagnostics n = row_count; counts := counts || jsonb_build_object('inbox_stale', n);

  update inbox_items set status = 'new', snoozed_until = null
  where status = 'snoozed' and snoozed_until <= current_date;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('inbox_woken', n);

  update follow_ups set status = 'open'
  where status = 'snoozed' and snoozed_until <= current_date;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('follow_ups_reopened', n);

  counts := counts || jsonb_build_object('league_missed_cycles', league_missed_cycles());
  counts := counts || jsonb_build_object('signals_expired', signals_expire());

  -- AGT-2: a run with no finish record after 30 minutes.
  update agent_runs set status = 'timed_out', finished_at = now()
  where status = 'running' and started_at < now() - interval '30 minutes';
  get diagnostics n = row_count; counts := counts || jsonb_build_object('runs_timed_out', n);

  return counts;
end $$;

-- A system notice in the Inbox, once per check per day (33.8).
create function public.raise_system_notice(p_key text, p_title text, p_why text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  select id into owner from app_users where role = 'owner' order by created_at limit 1;
  if owner is null then return false; end if;
  insert into inbox_items (owner_id, type, agent, title, why, suggested_action, source, dedup_key, rank, status)
  values (owner, 'system_notice', 'system', p_title, p_why, 'Fix', 'nightly checks', 'system:' || p_key || ':' || current_date, 100, 'new')
  on conflict do nothing;
  return found;
end $$;

-- The checks a monitoring tool would make (33.8). The bridge sheet and the
-- platform's backups are not visible from the database and are left out.
create function public.monitoring_checks(p_retention jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  raised jsonb := '[]';
  a record;
  n int;
begin
  -- Agents ran: an enabled agent with no finished run for 8 days, or two
  -- failures running (AGT-3).
  for a in
    select ag.code, ag.name, ag.consecutive_failures,
           (select max(finished_at) from agent_runs r where r.agent = ag.code and r.status in ('ok', 'partial')) as last_ok
    from agents ag where ag.enabled
  loop
    if a.consecutive_failures >= 2 then
      if raise_system_notice('agent-failed:' || a.code, format('The %s agent did not run', lower(a.name)),
           format('It has failed %s times running. Last worked on %s.', a.consecutive_failures,
                  coalesce(to_char(a.last_ok at time zone 'Europe/London', 'FMDay'), 'never'))) then
        raised := raised || to_jsonb(('agent-failed:' || a.code)::text);
      end if;
    elsif a.last_ok is not null and a.last_ok < now() - interval '8 days' then
      if raise_system_notice('agent-quiet:' || a.code, format('The %s agent has not run for a week', lower(a.name)),
           format('Last worked on %s. Check its scheduled task.', to_char(a.last_ok at time zone 'Europe/London', 'FMDay DD Month'))) then
        raised := raised || to_jsonb(('agent-quiet:' || a.code)::text);
      end if;
    end if;
  end loop;

  -- Send queue: anything queued for more than 24 hours.
  select count(*) into n from messages where state = 'queued' and updated_at < now() - interval '24 hours';
  if n > 0 then
    if raise_system_notice('send-queue', format('%s %s waited in the send queue for more than a day', n, case when n = 1 then 'message has' else 'messages have' end),
         'The send engine may not be running. Nothing has been sent twice.') then
      raised := raised || to_jsonb(('send-queue')::text);
    end if;
  end if;

  -- Stale runs: marked timed out by the sweep tonight.
  select count(*) into n from agent_runs where status = 'timed_out' and finished_at > now() - interval '1 day';
  if n > 0 then
    if raise_system_notice('stale-runs', format('%s agent %s timed out', n, case when n = 1 then 'run' else 'runs' end),
         'A run went more than 30 minutes without finishing. Its items, if any, were kept.') then
      raised := raised || to_jsonb(('stale-runs')::text);
    end if;
  end if;

  -- Retention: tonight's run had an error, or last night's never happened.
  if p_retention ? 'errors' then
    if raise_system_notice('retention', 'The retention job did not finish', 'One or more steps failed. The rest ran. See the audit log.') then
      raised := raised || to_jsonb(('retention')::text);
    end if;
  end if;

  return jsonb_build_object('raised', raised);
end $$;

-- The whole night in order. Safe to run by hand: select nightly().
create function public.nightly() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  s jsonb;
  c jsonb;
  result jsonb;
begin
  r := retention_job();
  s := nightly_sweeps();
  c := monitoring_checks(r);
  result := jsonb_build_object('retention', r, 'sweeps', s, 'checks', c);
  perform write_audit('nightly run', null, null, result);
  return result;
end $$;

revoke execute on function public.retention_job() from public, anon, authenticated;
revoke execute on function public.nightly_sweeps() from public, anon, authenticated;
revoke execute on function public.raise_system_notice(text, text, text) from public, anon, authenticated;
revoke execute on function public.monitoring_checks(jsonb) from public, anon, authenticated;
revoke execute on function public.nightly() from public, anon, authenticated;
grant execute on function public.retention_job(), public.nightly_sweeps(), public.monitoring_checks(jsonb), public.nightly() to service_role;
