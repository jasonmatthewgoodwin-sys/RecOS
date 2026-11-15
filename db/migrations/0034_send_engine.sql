-- 0034 Send engine (sections 8.3, 8.4, 12.5, 15.6, 20 and 21.3; tickets
-- P1-26 to P1-29). The only part of RecOS that can cause a message to leave.
--
-- Templates carry versions and approval (12.5). The decision procedure of
-- 20.3 is one function, send_decide, and every hold, downgrade and queue
-- writes a send_log row with the caps at that moment. The queue tick hands
-- queued messages to the sender task (route A of 20.7: the owner's own
-- Outlook through a Claude task, LinkedIn connection notes through the
-- collect-mode browser run) and the sender reports back. The owner's four
-- actions of 15.6 are send_action. Automatic pauses of 20.8 live here too.
--
-- The engine marks its own transactions with recos.engine so the browser
-- guards on messages and templates let its writes through (the owner calls
-- send_action and template_approve from the app, as security definer).

-- ---------------------------------------------------------------- engine mark
create function public.engine_active() returns boolean
language sql stable as $$
  select coalesce(current_setting('recos.engine', true), '') <> ''
$$;

create or replace function public.messages_browser_guard() returns trigger
language plpgsql as $$
begin
  if not is_browser() or engine_active() then
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
     or new.approved_at is distinct from old.approved_at
     or new.attempts is distinct from old.attempts then
    raise exception 'That part of a message is set by the send engine';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- templates (12.5)
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  type text not null references public.send_policies (type),
  name text not null,
  channel text not null check (channel in ('email', 'linkedin')),
  subject text,
  body text not null,
  variables text[] not null default '{}',
  version int not null default 1,
  approved boolean not null default false,
  approved_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, name, version)
);
create index templates_type_active on public.templates (type, active, approved);

alter table public.messages add column run_id uuid references public.agent_runs (id);
alter table public.messages add column approved_at timestamptz;
alter table public.messages add column call_id uuid references public.calls (id);
alter table public.messages add constraint messages_template_fk foreign key (template_id) references public.templates (id);
alter table public.messages add constraint messages_search_fk foreign key (search_id) references public.searches (id);
alter table public.send_policies add column paused_until timestamptz;

-- The send log also records the moment a message is queued (20.3, step 15).
alter table public.send_log drop constraint send_log_outcome_check;
alter table public.send_log add constraint send_log_outcome_check
  check (outcome in ('queued', 'sent', 'failed', 'held', 'skipped', 'cancelled'));

-- 20.4: the only variables a template may use.
create function public.send_variables() returns text[]
language sql immutable as $$
  select array['first_name', 'company', 'role', 'client', 'call_day', 'next_step', 'interview_time', 'my_first_name',
               'week_date', 'kpi_lines', 'output_line', 'followup_line', 'learned_block', 'plan_block']
$$;

create function public.template_variables(p_subject text, p_body text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct m[1] order by m[1]), '{}')
  from regexp_matches(coalesce(p_subject, '') || ' ' || coalesce(p_body, ''), '\{\{\s*([a-z_]+)\s*\}\}', 'g') m
$$;

-- TPL-1, TPL-2, TPL-3 and the channel of the type.
create function public.templates_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pol send_policies%rowtype;
  bad text[];
  nv int;
begin
  select * into pol from send_policies where type = new.type;
  if pol.type is null then raise exception 'Unknown message type %', new.type; end if;
  if pol.channel <> 'either' and new.channel <> pol.channel then
    raise exception 'A % template goes by %', pol.label, pol.channel;
  end if;
  new.variables := template_variables(new.subject, new.body);
  select array_agg(v) into bad from unnest(new.variables) v where v <> all(send_variables());
  if bad is not null then raise exception 'TPL-2: unknown variable %', array_to_string(bad, ', '); end if;
  if new.type = 'linkedin_connect' and length(new.body) > 300 then
    raise exception 'TPL-3: a connection note is 300 characters at most';
  end if;
  if tg_op = 'INSERT' then
    select coalesce(max(version), 0) + 1 into nv from templates where type = new.type and name = new.name;
    new.version := nv;
    new.approved := false;
    new.approved_at := null;
    return new;
  end if;
  if is_browser() and not engine_active() and new.approved is distinct from old.approved then
    raise exception 'A template is approved with template_approve';
  end if;
  -- TPL-1: editing an approved template makes a new, unapproved version.
  if old.approved and (new.body is distinct from old.body or new.subject is distinct from old.subject) then
    insert into templates (owner_id, type, name, channel, subject, body, active)
    values (old.owner_id, old.type, old.name, old.channel, new.subject, new.body, true);
    new.subject := old.subject;
    new.body := old.body;
    new.variables := old.variables;
    new.active := false;
    return new;
  end if;
  return new;
end $$;

create trigger t_rules before insert or update on public.templates for each row execute function public.templates_rules();
create trigger t_upd before update on public.templates for each row execute function public.set_updated_at();
create trigger t_own before insert on public.templates for each row execute function public.set_owner();

revoke all on public.templates from anon;
revoke delete, truncate, references, trigger on public.templates from authenticated;
grant select, insert, update on public.templates to authenticated;
grant all on public.templates to service_role;

-- The template the engine fills: the latest approved, active version for the type and channel.
create function public.approved_template(p_type text, p_channel text) returns public.templates
language sql stable security definer set search_path = public as $$
  select * from templates where type = p_type and channel = p_channel and approved and active
  order by version desc limit 1
$$;

-- Fills {{variables}}. Refuses a text with a variable left unfilled (20.4).
create function public.message_fill(p_text text, p_vars jsonb) returns text
language plpgsql immutable as $$
declare
  k text;
  out text := p_text;
  left_over text[];
begin
  if out is null then return null; end if;
  for k in select jsonb_object_keys(coalesce(p_vars, '{}'::jsonb)) loop
    if nullif(p_vars ->> k, '') is not null then
      out := regexp_replace(out, '\{\{\s*' || k || '\s*\}\}', replace(p_vars ->> k, '\', '\\'), 'g');
    end if;
  end loop;
  left_over := template_variables(null, out);
  if cardinality(left_over) > 0 then
    raise exception 'policy_refused: the variable % is not filled', left_over[1];
  end if;
  return out;
end $$;

-- The variables the engine can fill by itself, under what the agent supplied.
create function public.message_variables(m public.messages) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
      'first_name', split_part(coalesce((select display_name from people where id = m.person_id), m.to_name), ' ', 1),
      'company', (select display_company from people where id = m.person_id),
      'role', (select role from searches where id = m.search_id),
      'client', (select case when confidential then null else client end from searches where id = m.search_id),
      'call_day', (select to_char(held_at at time zone 'Europe/London', 'FMDay') from calls where id = m.call_id),
      'my_first_name', (select split_part(display_name, ' ', 1) from app_users where role = 'owner' order by created_at limit 1)
    )) || coalesce(m.variables, '{}'::jsonb)
$$;

-- ---------------------------------------------------------------- windows (20.5)
create function public.send_tz(p_city text, p_default text) returns text
language sql immutable as $$
  select case p_city
    when 'new_york' then 'America/New_York' when 'boston' then 'America/New_York' when 'washington' then 'America/New_York'
    when 'atlanta' then 'America/New_York' when 'miami' then 'America/New_York' when 'philadelphia' then 'America/New_York'
    when 'chicago' then 'America/Chicago' when 'austin' then 'America/Chicago' when 'dallas' then 'America/Chicago' when 'houston' then 'America/Chicago'
    when 'denver' then 'America/Denver' when 'salt_lake_city' then 'America/Denver'
    when 'san_francisco' then 'America/Los_Angeles' when 'los_angeles' then 'America/Los_Angeles' when 'seattle' then 'America/Los_Angeles' when 'san_diego' then 'America/Los_Angeles'
    when 'london' then 'Europe/London'
    else coalesce(p_default, 'America/New_York') end
$$;

-- The next moment inside the window, Monday to Friday, in the recipient's
-- time. A message already inside the window goes now; one moved to a later
-- window lands 5 to 40 minutes after it opens, so sends do not sit on the hour.
create function public.send_window_next(p_from timestamptz, p_start time, p_end time, p_tz text) returns timestamptz
language plpgsql as $$
declare
  local_ts timestamp := p_from at time zone p_tz;
  d date := local_ts::date;
  t time := local_ts::time;
  start_ts timestamp;
begin
  if extract(isodow from d) <= 5 and t >= p_start and t < p_end then return p_from; end if;
  if extract(isodow from d) <= 5 and t < p_start then start_ts := d + p_start; else start_ts := (d + 1) + p_start; end if;
  while extract(isodow from start_ts::date) > 5 loop start_ts := start_ts + interval '1 day'; end loop;
  return (start_ts at time zone p_tz) + make_interval(mins => 5 + floor(random() * 36)::int);
end $$;

-- ---------------------------------------------------------------- caps and the log
-- LOG-2: the counts and limits at the moment of decision.
create function public.send_caps(p_type text, p_run uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'day', (select count(*) from messages where type = p_type and state in ('queued', 'sending', 'sent')
            and (coalesce(sent_at, send_after, updated_at) at time zone 'Europe/London')::date = (now() at time zone 'Europe/London')::date),
    'week', (select count(*) from messages where type = p_type and state in ('queued', 'sending', 'sent')
             and week_of(coalesce(sent_at, send_after, updated_at)) = week_of(now())),
    'run', case when p_run is null then 0 else (select count(*) from messages where type = p_type and run_id = p_run and state in ('queued', 'sending', 'sent')) end,
    'daily_cap', p.daily_cap, 'weekly_cap', p.weekly_cap, 'per_run_cap', p.per_run_cap)
  from send_policies p where p.type = p_type
$$;

create function public.send_log_write(m public.messages, p_outcome text, p_detail text, p_level text, p_snapshot jsonb) returns void
language sql security definer set search_path = public as $$
  -- clock_timestamp so rows written in one transaction keep their order.
  insert into send_log (owner_id, message_id, type, channel, to_name, level, outcome, detail, caps_snapshot, logged_at)
  values (m.owner_id, m.id, m.type, m.channel, m.to_name, p_level, p_outcome, left(p_detail, 300), p_snapshot, clock_timestamp())
$$;

create function public.send_effective_level(m public.messages) returns text
language sql stable security definer set search_path = public as $$
  select case when send_level_rank(p.level) <= send_level_rank(m.level_at_creation) then p.level else m.level_at_creation end
  from send_policies p where p.type = m.type
$$;

create function public.send_hold(m public.messages, p_level text, p_reason text, p_snapshot jsonb, p_until timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update messages set state = 'held', hold_reason = p_reason, send_after = coalesce(p_until, send_after) where id = m.id;
  perform send_log_write(m, 'held', p_reason, p_level, p_snapshot);
  return jsonb_build_object('state', 'held', 'note', p_reason);
end $$;

create function public.send_draft(m public.messages, p_level text, p_note text, p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update messages set state = 'draft', hold_reason = p_note where id = m.id;
  perform send_log_write(m, 'skipped', coalesce(p_note, 'Draft'), p_level, p_snapshot);
  return jsonb_build_object('state', 'draft', 'note', coalesce(p_note, 'Left as a draft'));
end $$;

-- ---------------------------------------------------------------- the decision (20.3)
create function public.send_decide_inner(p_message uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m messages%rowtype;
  pol send_policies%rowtype;
  tpl templates%rowtype;
  all_off boolean;
  eff text;
  vars jsonb;
  snap jsonb;
  tz text;
  after timestamptz;
  ready timestamptz;
  in_run int;
  today date := (now() at time zone 'Europe/London')::date;
begin
  select * into m from messages where id = p_message for update;
  if m.id is null then raise exception 'not_found: no such message'; end if;
  if m.state not in ('draft', 'held', 'queued') then
    return jsonb_build_object('state', m.state, 'note', 'Nothing to decide');
  end if;
  -- 1
  select * into pol from send_policies where type = m.type;
  eff := send_effective_level(m);
  snap := send_caps(m.type, m.run_id);
  -- 2
  select all_sending_paused into all_off from app_settings;
  if all_off then return send_hold(m, eff, 'Sending is off', snap); end if;
  -- 3
  if pol.paused and (pol.paused_until is null or pol.paused_until > now()) then
    return send_hold(m, eff, coalesce(pol.paused_reason, 'Paused'), snap);
  end if;
  -- 4, 5
  if eff = 'draft_only' then return send_draft(m, eff, null, snap); end if;
  -- 6
  if pol.requires_template then
    if m.template_id is not null then select * into tpl from templates where id = m.template_id; end if;
    -- TPL-1: an approved version that has been edited stands aside until the new one is approved.
    if tpl.id is null or not tpl.approved or not tpl.active then
      tpl := approved_template(m.type, m.channel);
      if tpl.id is null then return send_draft(m, eff, 'Template needs approval', snap); end if;
      update messages set template_id = tpl.id, template_version = tpl.version where id = m.id;
      m.template_id := tpl.id;
      m.template_version := tpl.version;
    end if;
    vars := message_variables(m);
    begin
      if vars ? 'next_step' then
        if length(vars ->> 'next_step') > 140 or vars ->> 'next_step' ~* '(https?://|www\.)' then
          raise exception 'policy_refused: next_step is too long or has a link';
        end if;
        if exists (select 1 from searches where confidential and position(lower(client) in lower(vars ->> 'next_step')) > 0) then
          raise exception 'policy_refused: next_step names a confidential client';
        end if;
      end if;
      update messages set subject = message_fill(tpl.subject, vars), body = message_fill(tpl.body, vars), variables = vars where id = m.id;
    exception when others then
      return send_draft(m, eff, regexp_replace(sqlerrm, '^[a-z_]+: ', ''), snap);
    end;
    select * into m from messages where id = m.id;
  end if;
  -- 7
  if m.person_id is not null and not may_contact(m.person_id, (select company_key from people where id = m.person_id)) then
    update messages set state = 'cancelled', hold_reason = 'On the do-not-contact list' where id = m.id;
    perform send_log_write(m, 'cancelled', 'On the do-not-contact list', eff, snap);
    return jsonb_build_object('state', 'cancelled', 'note', 'On the do-not-contact list');
  end if;
  -- 8: the sender fills an email address at send time from the CRM (MSG-1), so only a message with nobody behind it stops here.
  if m.channel = 'email' and m.to_address is null and m.person_id is null then return send_draft(m, eff, 'No address found', snap); end if;
  if m.channel = 'linkedin' and m.to_profile_url is null
     and coalesce((select linkedin_url from people where id = m.person_id), '') = '' then
    return send_draft(m, eff, 'No profile found', snap);
  end if;
  -- 9
  if m.person_id is not null and exists (
      select 1 from messages x where x.person_id = m.person_id and x.type = m.type and x.id <> m.id
        and x.state = 'sent' and x.sent_at > now() - make_interval(days => pol.min_days_between_same_person)) then
    return send_hold(m, eff, 'Already sent recently', snap);
  end if;
  tz := send_tz((select city from people where id = m.person_id), pol.recipient_tz_default);
  -- 10
  if m.person_id is not null and exists (
      select 1 from messages x where x.person_id = m.person_id and x.id <> m.id
        and ((x.state in ('queued', 'sending') and (x.send_after at time zone 'Europe/London')::date = today)
          or (x.state = 'sent' and (x.sent_at at time zone 'Europe/London')::date = today))) then
    return send_hold(m, eff, 'Another message today', snap,
      send_window_next(((now() at time zone tz)::date + 1 + pol.send_window_start) at time zone tz, pol.send_window_start, pol.send_window_end, tz));
  end if;
  -- 11
  if m.search_id is not null and (select status from searches where id = m.search_id) = 'offer'
     and m.type not in ('submitted_confirmation', 'interview_confirmation', 'prep_pack') then
    return send_draft(m, eff, 'The search is at offer', snap);
  end if;
  -- 12
  if (pol.daily_cap is not null and (snap ->> 'day')::int >= pol.daily_cap)
     or (pol.weekly_cap is not null and (snap ->> 'week')::int >= pol.weekly_cap)
     or (pol.per_run_cap is not null and (snap ->> 'run')::int >= pol.per_run_cap) then
    return send_hold(m, eff, 'Cap reached', snap);
  end if;
  -- 20.8: an agent proposing more than twice the daily cap in one run has gone wrong.
  if m.run_id is not null and pol.daily_cap is not null then
    select count(*) into in_run from messages where run_id = m.run_id and type = m.type;
    if in_run > 2 * pol.daily_cap then
      update messages set state = 'held', hold_reason = 'Too many in one run'
      where run_id = m.run_id and type = m.type and id <> m.id and state in ('queued', 'draft') and level_at_creation <> 'draft_only';
      perform raise_system_notice('run_cap:' || m.type, format('%s held: too many in one run', pol.label),
        format('An agent proposed %s of them in one run, more than twice the daily cap of %s. They are held until you look.', in_run, pol.daily_cap));
      return send_hold(m, eff, 'Too many in one run', snap);
    end if;
  end if;
  -- 13
  if eff = 'one_click' and m.approved_at is null then
    update messages set state = 'draft', hold_reason = null where id = m.id;
    return jsonb_build_object('state', 'draft', 'note', 'Waiting for Send');
  end if;
  -- 14: thanks_after_call waits 45 minutes after the call ends.
  ready := now();
  if m.type = 'thanks_after_call' then
    ready := greatest(now(), coalesce(
      (select held_at + make_interval(mins => coalesce(minutes, 30)) + interval '45 minutes' from calls where id = m.call_id),
      m.created_at + interval '45 minutes'));
  end if;
  after := send_window_next(ready, pol.send_window_start, pol.send_window_end, tz);
  update messages set state = 'queued', hold_reason = null, send_after = after where id = m.id;
  -- 15
  perform send_log_write(m, 'queued', format('Sends at %s %s', to_char(after at time zone tz, 'HH24:MI on Dy DD Mon'), tz), eff, snap);
  return jsonb_build_object('state', 'queued', 'send_after', after,
    'note', format('Sends at %s, %s time', to_char(after at time zone tz, 'HH24:MI on Dy DD Mon'), replace(split_part(tz, '/', 2), '_', ' ')));
end $$;

create function public.send_decide(p_message uuid, p_run uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  res jsonb;
begin
  if is_browser() and app_role() <> 'owner' then raise exception 'not_allowed: Only the owner or the engine decides'; end if;
  perform set_config('recos.engine', 'engine', true);
  if p_run is not null then update messages set run_id = p_run where id = p_message and run_id is null; end if;
  res := send_decide_inner(p_message);
  perform set_config('recos.engine', '', true);
  return res;
end $$;

-- ---------------------------------------------------------------- templates: approve (12.5, 32.4)
create function public.template_approve(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  t templates%rowtype;
  r record;
  n int := 0;
begin
  if is_browser() and app_role() <> 'owner' then raise exception 'not_allowed: Only the owner approves templates'; end if;
  select * into t from templates where id = p_id;
  if t.id is null then raise exception 'not_found: no such template'; end if;
  perform set_config('recos.engine', 'engine', true);
  update templates set approved = true, approved_at = now(), active = true where id = p_id;
  update templates set active = false where type = t.type and name = t.name and id <> p_id and active;
  perform write_audit('template approved', 'templates', p_id, jsonb_build_object('type', t.type, 'version', t.version));
  -- Messages waiting on this template take another run through the engine.
  for r in select id from messages where type = t.type and channel = t.channel and state = 'draft'
           and hold_reason = 'Template needs approval' and level_at_creation <> 'draft_only' order by created_at loop
    update messages set template_id = p_id, template_version = t.version where id = r.id;
    perform send_decide_inner(r.id);
    n := n + 1;
  end loop;
  perform set_config('recos.engine', '', true);
  return n;
end $$;

-- The starter templates of Appendix A, unapproved, once.
create function public.templates_seed() returns int
language plpgsql security definer set search_path = public as $$
declare
  o uuid := aw_owner();
  n int := 0;
begin
  if is_browser() and app_role() <> 'owner' then raise exception 'not_allowed: Only the owner adds templates'; end if;
  if o is null then return 0; end if;
  insert into templates (owner_id, type, name, channel, subject, body)
  select o, s.type, s.name, s.channel, s.subject, s.body
  from (values
    ('thanks_after_call', 'Starter', 'email', 'Good to speak today',
     E'Hi {{first_name}},\n\nThanks for your time on {{call_day}}. Good to hear about what you have been doing at {{company}}.\n\n{{next_step}}\n\nSpeak soon,\n{{my_first_name}}'),
    ('cv_request', 'Starter', 'email', 'Your resume',
     E'Hi {{first_name}},\n\nWhen you get a minute, could you send over your latest resume? It means I can get you in front of the right people quickly.\n\nThanks,\n{{my_first_name}}'),
    ('submitted_confirmation', 'Starter', 'email', 'You are with the client',
     E'Hi {{first_name}},\n\nQuick one to say I have put you forward for the {{role}} role today. I will chase for feedback and come back to you as soon as I hear, and by the end of the week either way.\n\n{{my_first_name}}'),
    ('coaching_followup', 'Starter', 'email', 'Following up on our chat',
     E'Hi {{first_name}},\n\nGood to talk on {{call_day}}. {{next_step}}\n\nYou mentioned a couple of people who might get something from the same conversation. If you are happy to connect us, I would be glad to help them.\n\n{{my_first_name}}'),
    ('linkedin_connect', 'Starter', 'linkedin', null,
     'Hi {{first_name}}, I recruit product marketers and nothing else, mostly for B2B software teams in the US. Saw you are hiring. Would be good to connect.')
  ) as s (type, name, channel, subject, body)
  where not exists (select 1 from templates t where t.type = s.type and t.name = s.name);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- the queue (20.6)
create function public.send_tick(p_channel text default null, p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r messages%rowtype;
  h record;
  pol send_policies%rowtype;
  all_off boolean;
  snap jsonb;
  eff text;
  hold text;
  out jsonb := '[]'::jsonb;
begin
  if is_browser() then raise exception 'not_allowed: the tick runs from the server'; end if;
  perform set_config('recos.engine', 'engine', true);
  -- A timed pause that has run its course lifts itself.
  update send_policies set paused = false, paused_reason = null, paused_until = null
  where paused and paused_until is not null and paused_until <= now();
  -- Held messages whose reason may have cleared take another run through the engine.
  for h in select id from messages where state = 'held' and hold_reason in ('Another message today', 'Cap reached')
           and (send_after is null or send_after <= now()) order by created_at limit 50 loop
    perform send_decide_inner(h.id);
  end loop;
  select all_sending_paused into all_off from app_settings;
  for r in select * from messages where state = 'queued' and send_after <= now() and (p_channel is null or channel = p_channel)
           order by send_after for update skip locked limit p_limit loop
    select * into pol from send_policies where type = r.type;
    eff := send_effective_level(r);
    snap := send_caps(r.type, r.run_id);
    -- Steps 2, 3, 7 and 12 again: settings may have changed since queuing. The row counts itself here.
    hold := case
      when all_off then 'Sending is off'
      when pol.paused and (pol.paused_until is null or pol.paused_until > now()) then coalesce(pol.paused_reason, 'Paused')
      when r.person_id is not null and not may_contact(r.person_id, (select company_key from people where id = r.person_id)) then 'On the do-not-contact list'
      when (pol.daily_cap is not null and (snap ->> 'day')::int > pol.daily_cap)
        or (pol.weekly_cap is not null and (snap ->> 'week')::int > pol.weekly_cap) then 'Cap reached'
      else null end;
    if hold = 'On the do-not-contact list' then
      update messages set state = 'cancelled', hold_reason = hold where id = r.id;
      perform send_log_write(r, 'cancelled', hold, eff, snap);
    elsif hold is not null then
      update messages set state = 'held', hold_reason = hold where id = r.id;
      perform send_log_write(r, 'held', hold, eff, snap);
    else
      update messages set state = 'sending' where id = r.id;
      out := out || jsonb_build_object(
        'message_id', r.id, 'type', r.type, 'channel', r.channel, 'level', eff,
        'to_name', r.to_name, 'to_address', r.to_address,
        'to_profile_url', coalesce(r.to_profile_url, (select linkedin_url from people where id = r.person_id)),
        'subject', r.subject, 'body', r.body, 'person_id', r.person_id,
        'crm_url', (select crm_url from people where id = r.person_id),
        'attempt', r.attempts + 1);
    end if;
  end loop;
  perform set_config('recos.engine', '', true);
  return jsonb_build_object('messages', out, 'count', jsonb_array_length(out));
end $$;

-- The sender's report on one message it was handed (20.6 steps 5 and 6, 20.8).
create function public.send_report(p_message uuid, p_ok boolean, p_ref text default null, p_error text default null, p_to_address text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m messages%rowtype;
  pol send_policies%rowtype;
  eff text;
  snap jsonb;
  first_auto boolean;
  streak int;
  st text;
begin
  if is_browser() then raise exception 'not_allowed: only the sender reports'; end if;
  select * into m from messages where id = p_message for update;
  if m.id is null then raise exception 'not_found: no such message'; end if;
  if m.state <> 'sending' then raise exception 'wrong_state: that message is %, not sending', m.state; end if;
  perform set_config('recos.engine', 'engine', true);
  select * into pol from send_policies where type = m.type;
  eff := send_effective_level(m);
  snap := send_caps(m.type, m.run_id);
  if p_ok then
    first_auto := eff = 'automatic' and not exists (select 1 from send_log where type = m.type and outcome = 'sent' and level = 'automatic');
    update messages set state = 'sent', sent_at = now(), external_ref = left(p_ref, 200), to_address = coalesce(p_to_address, to_address),
      last_error = null, purge_after = current_date + 30 where id = m.id;
    select * into m from messages where id = m.id;
    perform send_log_write(m, 'sent', case when eff = 'automatic' then 'Auto' else 'Sent' end, eff, snap);
    update follow_ups set status = 'sent' where message_id = m.id and status in ('open', 'snoozed');
    insert into inbox_items (owner_id, type, agent, title, person_id, why, suggested_action, ref_table, ref_id, dedup_key, rank, status, actioned_at, closed_at, purge_after)
    values (m.owner_id, 'auto_sent', coalesce(m.created_by, 'engine'), format('%s to %s', pol.label, m.to_name), m.person_id,
      case when eff = 'automatic' then 'Sent for you' else 'Sent' end, 'None', 'messages', m.id, 'auto_sent:' || m.id, 0, 'done', now(), now(), current_date + 7)
    on conflict do nothing;
    if first_auto then
      perform raise_system_notice('first_auto:' || m.type, format('%s now sends by itself', pol.label),
        format('The first %s went out automatically, to %s. After this one, silence.', lower(pol.label), m.to_name));
    end if;
    perform set_config('recos.engine', '', true);
    return jsonb_build_object('state', 'sent');
  end if;
  update messages set attempts = attempts + 1, last_error = left(p_error, 500) where id = m.id returning * into m;
  if m.attempts >= 3 then
    update messages set state = 'draft', hold_reason = 'Three sends failed' where id = m.id;
    perform send_log_write(m, 'failed', format('Try %s failed: %s. Back in drafts', m.attempts, coalesce(left(p_error, 200), 'unknown')), eff, snap);
    perform raise_system_notice('send_failed:' || m.id, format('%s to %s could not be sent', pol.label, m.to_name),
      format('Three tries failed. The last error: %s. It is back in your drafts.', coalesce(left(p_error, 200), 'unknown')));
  else
    update messages set state = 'queued', send_after = now() + case when m.attempts = 1 then interval '15 minutes' else interval '1 hour' end where id = m.id;
    perform send_log_write(m, 'failed', format('Try %s failed: %s', m.attempts, coalesce(left(p_error, 200), 'unknown')), eff, snap);
  end if;
  -- 20.8: three email sends failing in a row pause automatic email for two hours.
  if m.channel = 'email' then
    select count(*) into streak from (
      select outcome from send_log where channel = 'email' and outcome in ('sent', 'failed') order by logged_at desc limit 3) x
    where outcome = 'failed';
    if streak >= 3 then
      update send_policies set paused = true, paused_until = now() + interval '2 hours',
        paused_reason = 'Three email sends failed in a row. Paused for two hours, then it tries again'
      where channel in ('email', 'either') and level = 'automatic' and not paused;
      perform raise_system_notice('email_pause', 'Automatic email paused for two hours',
        'Three email sends failed in a row. Automatic email types are paused for two hours and then try again. Check Outlook is signed in.');
    end if;
  end if;
  select state into st from messages where id = m.id;
  perform set_config('recos.engine', '', true);
  return jsonb_build_object('state', st, 'attempts', m.attempts);
end $$;

-- ---------------------------------------------------------------- the owner's actions (15.6)
create function public.send_action(p_message uuid, p_action text, p_outlook_url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m messages%rowtype;
  pol send_policies%rowtype;
  eff text;
  res jsonb;
begin
  if app_role() <> 'owner' then raise exception 'not_allowed: Only the owner can act on a message'; end if;
  select * into m from messages where id = p_message for update;
  if m.id is null then raise exception 'not_found: no such message'; end if;
  select * into pol from send_policies where type = m.type;
  eff := send_effective_level(m);
  perform set_config('recos.engine', 'engine', true);
  case p_action
    when 'approve' then
      if m.state <> 'draft' then raise exception 'wrong_state: only a draft can be approved'; end if;
      if eff = 'draft_only' then raise exception 'policy_refused: % is draft only. Open it in Outlook or copy it', pol.label; end if;
      update messages set approved_at = now() where id = m.id;
      res := send_decide_inner(m.id);
    when 'open_draft' then
      if m.state <> 'draft' then raise exception 'wrong_state: only a draft opens in Outlook'; end if;
      if p_outlook_url is not null then update messages set outlook_draft_url = left(p_outlook_url, 2000) where id = m.id; end if;
      res := jsonb_build_object('state', 'draft', 'subject', m.subject, 'body', m.body, 'to_address', m.to_address, 'to_name', m.to_name,
        'outlook_draft_url', coalesce(p_outlook_url, m.outlook_draft_url));
    when 'mark_sent' then
      if m.state <> 'draft' then raise exception 'wrong_state: only a draft is marked as sent'; end if;
      update messages set state = 'sent', sent_at = now(), purge_after = current_date + 30 where id = m.id;
      perform send_log_write(m, 'sent', 'manual', eff, null);
      update follow_ups set status = 'sent' where message_id = m.id and status in ('open', 'snoozed');
      res := jsonb_build_object('state', 'sent', 'note', 'Marked as sent by hand');
    when 'cancel' then
      if m.state not in ('draft', 'queued', 'held') then raise exception 'wrong_state: a % message cannot be cancelled', m.state; end if;
      update messages set state = 'cancelled' where id = m.id;
      perform send_log_write(m, 'cancelled', 'Cancelled by the owner', eff, null);
      res := jsonb_build_object('state', 'cancelled');
    else
      raise exception 'invalid: unknown action %', p_action;
  end case;
  perform set_config('recos.engine', '', true);
  return res;
end $$;

-- ---------------------------------------------------------------- automatic pauses (20.8)
create function public.send_linkedin_warning(p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if is_browser() then raise exception 'not_allowed: an agent reports a LinkedIn warning'; end if;
  perform set_config('recos.engine', 'engine', true);
  update send_policies set paused = true, paused_until = null, paused_reason = left('LinkedIn warning seen: ' || coalesce(p_reason, 'no detail'), 200)
  where channel in ('linkedin', 'either') and not paused;
  update messages set state = 'held', hold_reason = 'LinkedIn warning' where channel = 'linkedin' and state = 'queued';
  get diagnostics n = row_count;
  perform raise_system_notice('linkedin_warning', 'LinkedIn sending paused',
    format('An agent saw a LinkedIn warning: %s. Every LinkedIn type is paused until you resume it in Settings, Send rules.', coalesce(p_reason, 'no detail')));
  perform set_config('recos.engine', '', true);
  return n;
end $$;

-- An opt-out phrase in a reply: the person goes on the do-not-contact list,
-- which cancels their queued messages and closes their follow-ups (0021).
create function public.aw_opt_out(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  person uuid;
  nm text;
begin
  if nullif(d ->> 'person_name', '') is null then return aw_reject('invalid', 'Who asked to be left alone.', 'person_name'); end if;
  person := aw_find_person(d ->> 'person_name', d ->> 'company');
  if person is null then return aw_reject('not_found', 'No person by that name.', 'person_name'); end if;
  select display_name into nm from people where id = person;
  perform set_config('recos.engine', 'engine', true);
  update people set do_not_contact = true where id = person and not do_not_contact;
  insert into do_not_contact (owner_id, person_id, name, scope, reason)
  values (aw_owner(), person, nm, 'person', left('Asked in a reply: ' || coalesce(d ->> 'phrase', ''), 200));
  perform raise_system_notice('opt_out:' || person, format('%s asked not to be contacted', nm),
    format('A reply said "%s". They are on the do-not-contact list; their queued messages are cancelled and their follow-ups closed.', coalesce(left(d ->> 'phrase', 120), 'please stop')));
  perform set_config('recos.engine', '', true);
  return jsonb_build_object('outcome', 'created', 'id', person, 'note', 'Added to do-not-contact.');
end $$;

-- ---------------------------------------------------------------- the write kind message, now with the engine
create or replace function public.aw_message(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pol send_policies%rowtype;
  tpl templates%rowtype;
  person uuid;
  id uuid;
  lvl text;
  want text;
  res jsonb;
  note text;
begin
  select * into pol from send_policies where type = d ->> 'type';
  if pol.type is null then return aw_reject('invalid', 'Unknown message type.', 'type'); end if;
  if coalesce(d ->> 'channel', '') not in ('email', 'linkedin') then return aw_reject('invalid', 'Channel is email or linkedin.', 'channel'); end if;
  if nullif(d ->> 'to_name', '') is null and nullif(d ->> 'person_name', '') is null then return aw_reject('invalid', 'A message needs who it is to.', 'to_name'); end if;
  if d ? 'variables' and jsonb_typeof(d -> 'variables') <> 'object' then return aw_reject('invalid', 'variables is an object.', 'variables'); end if;
  want := coalesce(d ->> 'level', 'draft_only');
  if want not in ('automatic', 'one_click', 'draft_only') then return aw_reject('invalid', 'level is automatic, one_click or draft_only.', 'level'); end if;
  -- The requested level is capped at the policy's level. Automatic needs an approved template (MSG-3).
  lvl := case when send_level_rank(want) <= send_level_rank(pol.level) then want else pol.level end;
  if lvl = 'automatic' then
    tpl := approved_template(pol.type, d ->> 'channel');
    if tpl.id is null then
      lvl := 'one_click';
      note := 'No approved template yet, so it waits for Send.';
    end if;
  end if;
  person := aw_find_person(coalesce(d ->> 'person_name', d ->> 'to_name'), d ->> 'company');
  insert into messages (owner_id, type, channel, person_id, to_name, subject, body, template_id, template_version, variables, search_id, call_id, run_id, created_by, level_at_creation, state)
  values (aw_owner(), pol.type, d ->> 'channel', person, coalesce(d ->> 'to_name', d ->> 'person_name'), d ->> 'subject', d ->> 'body',
    tpl.id, tpl.version, coalesce(d -> 'variables', '{}'::jsonb),
    case when (d ->> 'search_id') ~ '^[0-9a-f-]{36}$' then (d ->> 'search_id')::uuid end,
    case when (d ->> 'call_id') ~ '^[0-9a-f-]{36}$' then (d ->> 'call_id')::uuid end,
    p_run, p_agent, lvl, 'draft')
  returning messages.id into id;
  if (d ->> 'follow_up_id') ~ '^[0-9a-f-]{36}$' then
    update follow_ups set message_id = id where follow_ups.id = (d ->> 'follow_up_id')::uuid and message_id is null;
  end if;
  if lvl = 'draft_only' then
    return jsonb_build_object('outcome', 'created', 'id', id, 'state', 'draft', 'note', 'Saved as a draft.');
  end if;
  res := send_decide(id, p_run);
  return jsonb_build_object('outcome', 'created', 'id', id, 'state', res ->> 'state', 'note', coalesce(note || ' ', '') || coalesce(res ->> 'note', ''));
end $$;

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


-- ---------------------------------------------------------------- grants
revoke execute on function public.send_decide(uuid, uuid) from public, anon;
revoke execute on function public.send_decide_inner(uuid) from public, anon, authenticated;
revoke execute on function public.send_tick(text, int) from public, anon, authenticated;
revoke execute on function public.send_report(uuid, boolean, text, text, text) from public, anon, authenticated;
revoke execute on function public.send_linkedin_warning(text) from public, anon, authenticated;
revoke execute on function public.send_hold(public.messages, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function public.send_draft(public.messages, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.send_log_write(public.messages, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.aw_opt_out(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.templates_seed() from public, anon;
revoke execute on function public.template_approve(uuid) from public, anon;
revoke execute on function public.send_action(uuid, text, text) from public, anon;
-- The engine itself runs as the service role (strict projects grant it nothing by default).
grant execute on function public.send_decide(uuid, uuid), public.send_decide_inner(uuid), public.send_tick(text, int),
  public.send_report(uuid, boolean, text, text, text), public.send_linkedin_warning(text),
  public.send_hold(public.messages, text, text, jsonb, timestamptz), public.send_draft(public.messages, text, text, jsonb),
  public.send_log_write(public.messages, text, text, text, jsonb), public.aw_opt_out(uuid, text, jsonb),
  public.templates_seed(), public.template_approve(uuid), public.send_action(uuid, text, text) to service_role;
grant execute on function public.send_action(uuid, text, text) to authenticated;
grant execute on function public.template_approve(uuid) to authenticated;
grant execute on function public.templates_seed() to authenticated;
grant execute on function public.send_decide(uuid, uuid) to authenticated;
grant execute on function public.send_variables() to authenticated;
grant execute on function public.template_variables(text, text) to authenticated;
grant execute on function public.message_fill(text, jsonb) to authenticated;
grant execute on function public.send_window_next(timestamptz, time, time, text) to authenticated;
grant execute on function public.send_tz(text, text) to authenticated;
grant execute on function public.approved_template(text, text) to authenticated;
