-- 0022 Settings (sections 13.2, 13.4, 20.9, 32.4). Three functions so that a
-- change the owner makes from Settings is one transaction, and the stop
-- switch's effect on the queue.
--
-- Each function runs with the definer's rights so it can write the audit
-- log, and checks for the owner itself. Nothing here is reachable by the
-- reviewer, an anonymous caller or an agent.

-- A target changed on any day takes effect from the next Monday (T-SET-4).
-- The current row is closed the day before; a row already waiting for that
-- Monday is replaced. Returns the Monday the new target starts.
create function public.set_target(p_kpi text, p_period text, p_target numeric) returns date
language plpgsql security definer set search_path = public as $$
declare
  from_monday date := week_of(now()) + 7;
  owner uuid;
begin
  if app_role() <> 'owner' then
    raise exception 'Only the owner can change a target';
  end if;
  if p_period not in ('week', 'quarter', 'year') then
    raise exception 'Unknown period';
  end if;
  if p_target is null or p_target < 0 then
    raise exception 'A target is a number, 0 or more';
  end if;
  select id into owner from app_users where role = 'owner' order by created_at limit 1;

  -- Close whatever applies today.
  update targets
  set valid_to = from_monday - 1
  where kpi = p_kpi and period = p_period
    and valid_from < from_monday
    and (valid_to is null or valid_to >= from_monday);

  -- Replace a row already waiting for that Monday, or add one.
  update targets
  set target = p_target
  where kpi = p_kpi and period = p_period and valid_from = from_monday;
  if not found then
    insert into targets (owner_id, kpi, period, target, valid_from)
    values (owner, p_kpi, p_period, p_target, from_monday);
  end if;

  perform write_audit('target changed', 'targets', null,
    jsonb_build_object('kpi', p_kpi, 'period', p_period, 'target', p_target, 'from', from_monday));
  return from_monday;
end $$;

-- Save as new version (32.4): the next version number, made active, with the
-- previous version deactivated in the same transaction (AGT-1).
create function public.save_agent_prompt(p_agent text, p_body text, p_note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v int;
begin
  if app_role() <> 'owner' then
    raise exception 'Only the owner can change a prompt';
  end if;
  if nullif(btrim(p_body), '') is null then
    raise exception 'A prompt needs some text';
  end if;
  select coalesce(max(version), 0) + 1 into v from agent_prompts where agent = p_agent;
  update agent_prompts set active = false where agent = p_agent and active;
  insert into agent_prompts (agent, version, body, active, note)
  values (p_agent, v, p_body, true, nullif(btrim(p_note), ''));
  perform write_audit('prompt version activated', 'agent_prompts', null,
    jsonb_build_object('agent', p_agent, 'version', v));
  return v;
end $$;

-- Make an earlier version active again (AGT-1).
create function public.activate_agent_prompt(p_agent text, p_version int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if app_role() <> 'owner' then
    raise exception 'Only the owner can change a prompt';
  end if;
  if not exists (select 1 from agent_prompts where agent = p_agent and version = p_version) then
    raise exception 'No such version';
  end if;
  update agent_prompts set active = false where agent = p_agent and active;
  update agent_prompts set active = true where agent = p_agent and version = p_version;
  perform write_audit('prompt version activated', 'agent_prompts', null,
    jsonb_build_object('agent', p_agent, 'version', p_version));
end $$;

-- The stop switch (20.9, T-SET-1): turning sending off holds everything in
-- the queue at once, with the reason in plain words.
--
-- The messages guard (MSG-4) lets only the send engine move a message to
-- held. This trigger acts for the engine, so the guard is replaced with one
-- that also stands aside for a transaction-local flag the trigger sets just
-- before its one update and clears straight after. The flag is set by
-- set_config, which the browser's data API cannot call, so the browser
-- cannot raise it itself.
create or replace function public.messages_browser_guard() returns trigger
language plpgsql as $$
begin
  if not is_browser() or current_setting('recos.engine', true) = 'stop_switch' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.state <> 'draft' or new.level_at_creation = 'automatic' then
      raise exception 'A message from the app starts as a draft and is never automatic';
    end if;
    return new;
  end if;
  if new.state is distinct from old.state and new.state <> 'cancelled' then
    raise exception 'Only the send engine can move a message to %', new.state;
  end if;
  if old.state <> 'draft' and (new.body is distinct from old.body or new.subject is distinct from old.subject) then
    raise exception 'A message can only be edited while it is a draft';
  end if;
  if new.type is distinct from old.type
     or new.level_at_creation is distinct from old.level_at_creation
     or new.template_id is distinct from old.template_id
     or new.to_address is distinct from old.to_address
     or new.send_after is distinct from old.send_after
     or new.sent_at is distinct from old.sent_at
     or new.attempts is distinct from old.attempts then
    raise exception 'That part of a message is set by the send engine';
  end if;
  return new;
end $$;

create function public.app_settings_stop_switch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.all_sending_paused and not old.all_sending_paused then
    perform set_config('recos.engine', 'stop_switch', true);
    update messages
    set state = 'held', hold_reason = 'Sending is off'
    where state = 'queued';
    perform set_config('recos.engine', '', true);
  end if;
  return new;
end $$;

create trigger t_stop_switch after update on public.app_settings
for each row execute function public.app_settings_stop_switch();

revoke execute on function public.set_target(text, text, numeric) from public, anon;
revoke execute on function public.save_agent_prompt(text, text, text) from public, anon;
revoke execute on function public.activate_agent_prompt(text, int) from public, anon;
grant execute on function public.set_target(text, text, numeric) to authenticated;
grant execute on function public.save_agent_prompt(text, text, text) to authenticated;
grant execute on function public.activate_agent_prompt(text, int) to authenticated;
