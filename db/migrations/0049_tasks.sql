-- 0049 Tasks: the owner's edits to a task, the standing rules that raise
-- suggestions, and write-up runs after each call. The queue itself is a view
-- (views/tasks_view.sql) over the tables the agents and triggers already
-- write, so the owner never types a task in. Built for the Tasks tab, which
-- replaces the Inbox (docs/decisions.md, 16 November).

-- Suggestions are inbox items raised by rules, not agents. A new type so the
-- page can show the word Suggested and the owner can bin one.
alter table public.inbox_items drop constraint inbox_items_type_check;
alter table public.inbox_items add constraint inbox_items_type_check check (type in (
  'job_lead', 'signal', 'content_draft', 'event_idea', 'call_writeup',
  'follow_up', 'referral', 'client_nudge', 'wider_lead', 'auto_sent', 'system_notice', 'suggestion'));

-- ------------------------------------------------------------ task_overrides

-- One row per task the owner has changed by hand: a new title, notes, a due
-- day, a place in the order, or a status for a task that has no row of its
-- own (a quiet search, a call to prepare for). The agent's own text is never
-- overwritten; the view shows the override beside it.
create table public.task_overrides (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  -- source:id, for example inbox_items:<uuid> or search_health:<uuid>.
  task_key text not null unique,
  title text,
  notes text,
  due_on date,
  -- Lower comes first. Null means "where the rank puts it".
  sort_order int,
  status text check (status in ('open', 'done', 'binned', 'snoozed')),
  snoozed_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger t_upd before update on public.task_overrides for each row execute function public.set_updated_at();
create trigger t_own before insert on public.task_overrides for each row execute function public.set_owner();

revoke all on public.task_overrides from anon, authenticated;
grant select, insert, update on public.task_overrides to authenticated;
grant all on public.task_overrides to service_role;

-- A list of {label, url} links with the empty ones left out, for the view.
create function public.compact_links(variadic items jsonb[]) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(i), '[]'::jsonb) from unnest(items) i where i is not null and i <> 'null'::jsonb
$$;

-- -------------------------------------------------------------- suggestions

-- Raise one suggestion unless a row with that key already exists, binned or
-- not: a suggestion the owner binned is never raised again. Returns 1 or 0.
create function public.suggest(
  o uuid, title text, why text, action text, key text, rank numeric, due date,
  ref_table text default null, ref_id uuid default null, person_id uuid default null
) returns int
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from inbox_items where dedup_key = key) then return 0; end if;
  insert into inbox_items (owner_id, type, agent, title, why, suggested_action, dedup_key, rank, due_on, source, ref_table, ref_id, person_id)
  values (o, 'suggestion', 'system', title, why, action, key, rank, due, 'rules', ref_table, ref_id, person_id);
  return 1;
end $$;

revoke all on function public.suggest(uuid, text, text, text, text, numeric, date, text, uuid, uuid) from public, anon, authenticated;

-- Standing rules that propose an action from what is already in the
-- database. Each is an inbox item of type suggestion with a stable dedup key,
-- so running the rules twice changes nothing. Returns how many were raised.
-- Runs nightly, and when the Tasks page opens.
create function public.raise_suggestions() returns int
language plpgsql security definer set search_path = public as $$
declare
  o uuid;
  n int := 0;
  r record;
  monday date := public.week_of(now());
begin
  select id into o from public.app_users where role = 'owner' order by created_at limit 1;
  if o is null then return 0; end if;

  -- No post planned or published this week, and it is Wednesday or later.
  if extract(isodow from now() at time zone 'Europe/London') >= 3
     and not exists (select 1 from content_items where (status = 'posted' and posted_on >= monday) or (status = 'planned' and planned_for >= monday and planned_for < monday + 7)) then
    n := n + public.suggest(o, 'Nothing planned to post this week',
      'No post is planned or published since Monday. The weekly target is two.',
      'Pick a draft to approve, or write a short one from this week''s calls',
      format('rule:no_post:%s', monday), 15, monday + 4);
  end if;

  -- A candidate spoken to more than five working days ago with no decision.
  for r in
    select c.id, c.person_id, p.display_name, s.role, s.client
    from search_candidates c
    join people p on p.id = c.person_id
    join searches s on s.id = c.search_id
    where c.stage = 'spoken' and s.status in ('open', 'intake')
      and public.working_days(c.stage_changed_on, current_date) >= 5
  loop
    n := n + public.suggest(o, format('Decide on %s for %s', r.display_name, r.client),
      format('Spoken to over a week ago on the %s search and still at spoken. Submit, or let them know.', r.role),
      'Submit them, or close the loop', format('rule:decide:%s', r.id), 20, current_date,
      'search_candidates', r.id, r.person_id);
  end loop;

  -- A search whose own next step date has passed.
  for r in
    select id, client, role, next_step, next_step_on from searches
    where status in ('open', 'intake', 'offer') and next_step is not null and next_step_on < current_date
  loop
    n := n + public.suggest(o, format('%s: %s', r.client, r.next_step),
      format('The next step on the %s search was due %s.', r.role, to_char(r.next_step_on, 'FMDay DD Month')),
      r.next_step, format('rule:next_step:%s:%s', r.id, r.next_step_on), 25, r.next_step_on, 'searches', r.id);
  end loop;

  return n;
end $$;

revoke all on function public.raise_suggestions() from public, anon;
grant execute on function public.raise_suggestions() to authenticated, service_role;

-- The night also raises the suggestions (0024's nightly, plus one step).
create or replace function public.nightly() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  s jsonb;
  c jsonb;
  g int;
  result jsonb;
begin
  r := retention_job();
  s := nightly_sweeps();
  c := monitoring_checks(r);
  g := raise_suggestions();
  update task_overrides set status = 'open', snoozed_until = null where status = 'snoozed' and snoozed_until <= current_date;
  result := jsonb_build_object('retention', r, 'sweeps', s, 'checks', c, 'suggestions', g);
  perform write_audit('nightly run', null, null, result);
  return result;
end $$;

-- --------------------------------------------- write-ups after each call

-- A request can wait for a moment: the calendar asks for a write-up ten
-- minutes after each external call ends. The agent's scheduled task takes
-- the requests that are due at run-start and leaves the rest.
alter table public.run_requests add column run_after timestamptz not null default now();
alter table public.run_requests add column calendar_ref text;
create unique index run_requests_one_per_call on public.run_requests (agent, calendar_ref) where calendar_ref is not null;

create function public.request_writeup_after_call() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_external and new.event_ref is not null then
    insert into run_requests (agent, requested_by, run_after, calendar_ref, note)
    values ('a6_calls', 'calendar', coalesce(new.ends_at, new.starts_at + interval '45 minutes') + interval '10 minutes', new.event_ref,
      format('Write up: %s', new.title))
    on conflict (agent, calendar_ref) where calendar_ref is not null do update
      set run_after = excluded.run_after, note = excluded.note
      where run_requests.taken_at is null;
  end if;
  return new;
end $$;

create trigger t_writeup after insert or update of starts_at, ends_at on public.calendar_today
  for each row execute function public.request_writeup_after_call();

-- agent_run_start (0025, 0030, 0032) now takes only the requests that are
-- due, so the write-up agent can stop at once when no call has ended, and a
-- run taken for a call is marked after_call.
create or replace function public.agent_run_start(p_agent text, p_trigger text, p_mode text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  reqs jsonb;
  refs jsonb;
  from_calendar boolean;
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

  -- The notes of the requests this run takes, such as profile:<person id> or
  -- Write up: <call>, and the calendar references of the calls behind them.
  -- A request whose time has not come stays for a later run.
  select coalesce(jsonb_agg(note) filter (where note is not null), '[]'),
         coalesce(jsonb_agg(calendar_ref) filter (where calendar_ref is not null), '[]'),
         bool_or(requested_by = 'calendar')
  into reqs, refs, from_calendar
  from run_requests where agent = p_agent and taken_at is null and run_after <= now();

  insert into agent_runs (agent, trigger, mode, prompt_version)
  values (p_agent, case when coalesce(from_calendar, false) and p_trigger = 'schedule' then 'after_call' else p_trigger end, p_mode, prompt.version)
  returning id into run_id;
  update agents set last_run_id = run_id where code = p_agent;
  update run_requests set taken_at = now() where agent = p_agent and taken_at is null and run_after <= now();

  return jsonb_build_object(
    'run_id', run_id,
    'enabled', true,
    'prompt', case when prompt.id is null then null else jsonb_build_object('version', prompt.version, 'body', prompt.body, 'blocks', blocks) end,
    'settings', jsonb_build_object('lookback_from', coalesce(lookback, current_date - 7), 'per_run_caps', caps),
    'paused', jsonb_build_object('all_sending', paused),
    'requests', reqs,
    'calendar_refs', refs,
    'connections', to_jsonb(a.connections),
    'criteria', a.criteria
  );
end $$;
