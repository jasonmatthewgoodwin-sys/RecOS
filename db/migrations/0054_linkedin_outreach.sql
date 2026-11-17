-- 0054 LinkedIn outreach on job leads, through the send engine (Jason and
-- Mia, 17 November 2026).
--
-- What was found: no agent has ever sent a LinkedIn connection request. The
-- jobs agent's prompt forbids LinkedIn (it runs in the cloud with no
-- browser), and the seven leads marked "connection sent" on 16 November were
-- ticked by hand. So the ladder is built here, and every step that reaches a
-- person goes through the send engine: the cap, the sending window, the
-- do-not-contact list, the stop switch and the send log.
--
--   1. A new LinkedIn lead posted in the last 21 days, with a poster, gets a
--      connection request queued for it (type linkedin_connect, automatic,
--      10 a day and 20 a week). Nothing goes until the owner approves the
--      connection note's wording in Settings, Templates (TPL-1).
--   2. The LinkedIn sender, a routine on the owner's own machine with
--      Claude in Chrome, takes queued requests from /send/tick, sends them
--      and reports. A sent request moves the lead to connection_sent.
--   3. The same routine checks pending requests (/send/linkedin-pending) and
--      reports who accepted (/send/linkedin-status). Connected makes a first
--      LinkedIn message as a draft (linkedin_message is draft only): the
--      owner copies it into LinkedIn and marks it sent, which moves the lead
--      to messaged.
--   4. Add to campaign (0040) stays as it is: Spott runs the sequence.
--
-- Also: the on-your-behalf log (views/on_your_behalf_view.sql), and the
-- tasks view ranks job leads by how recently they were posted.

alter table public.job_leads
  add column connect_message_id uuid references public.messages (id),
  add column li_message_id uuid references public.messages (id),
  add column outreach_checked_at timestamptz;

-- The starter connection note in Jason's words of 17 November, while it is
-- still unapproved. An approved note is never touched here.
update public.templates
set body = 'Hi {{first_name}}, I''m a product marketing headhunter working with US tech teams. Saw you''re hiring and thought it would be worth us connecting. Thanks, {{my_first_name}}'
where type = 'linkedin_connect' and name = 'Starter' and not approved
  and body like 'Hi {{first_name}}, I recruit product marketers and nothing else%';

-- ---------------------------------------------------------------- the owner's first name

-- Found on 17 November: the owner's display name is empty on the project, so
-- {{my_first_name}} could not be filled and every template that signs off
-- with it stayed a draft. The first name falls back to the part of the
-- sign-in email before the first dot or @ (jason@... gives Jason).
create or replace function public.message_variables(m public.messages) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
      'first_name', split_part(coalesce((select display_name from people where id = m.person_id), m.to_name), ' ', 1),
      'company', (select display_company from people where id = m.person_id),
      'role', (select role from searches where id = m.search_id),
      'client', (select case when confidential then null else client end from searches where id = m.search_id),
      'call_day', (select to_char(held_at at time zone 'Europe/London', 'FMDay') from calls where id = m.call_id),
      'my_first_name', (select coalesce(nullif(split_part(display_name, ' ', 1), ''), nullif(initcap(split_part(split_part(email, '@', 1), '.', 1)), ''))
                        from app_users where role = 'owner' order by created_at limit 1)
    )) || coalesce(m.variables, '{}'::jsonb)
$$;

-- ---------------------------------------------------------------- queue one request

create function public.lead_queue_connect(p_lead uuid, p_by text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l job_leads%rowtype;
  pol send_policies%rowtype;
  tpl templates%rowtype;
  mid uuid;
  st text;
  m messages%rowtype;
  res jsonb;
begin
  select * into l from job_leads where id = p_lead for update;
  if l.id is null then raise exception 'not_found: no such lead'; end if;
  if l.connect_message_id is not null then
    select state into st from messages where id = l.connect_message_id;
    if st in ('draft', 'held', 'queued', 'sending', 'sent') then
      return jsonb_build_object('state', st, 'message_id', l.connect_message_id, 'note', 'Already asked for');
    end if;
  end if;
  if l.outreach_stage <> 'found' then return jsonb_build_object('state', 'none', 'note', 'Already past the connection step'); end if;
  if l.hiring_manager_id is null then return jsonb_build_object('state', 'none', 'note', 'Nobody to connect with on this lead'); end if;
  if coalesce(l.poster_profile_url, (select linkedin_url from people where id = l.hiring_manager_id), '') = '' then
    return jsonb_build_object('state', 'none', 'note', 'No LinkedIn profile on this lead');
  end if;
  select * into pol from send_policies where type = 'linkedin_connect';
  -- An automatic message names its template from the start (0008). The
  -- active note, approved or not: the engine holds it until it is approved.
  select * into tpl from templates where type = 'linkedin_connect' and active order by approved desc, version desc limit 1;
  insert into messages (owner_id, type, channel, person_id, to_name, to_profile_url, body, template_id, template_version, created_by, level_at_creation, state)
  values (l.owner_id, 'linkedin_connect', 'linkedin', l.hiring_manager_id, coalesce(l.poster_name, 'The poster'),
    coalesce(l.poster_profile_url, (select linkedin_url from people where id = l.hiring_manager_id)),
    -- The owner's own press is one click, approved by the press itself; a
    -- message from the app is never automatic (0034).
    '', tpl.id, tpl.version, p_by,
    case when p_by = 'owner' or (tpl.id is null and pol.level = 'automatic') then 'one_click' else pol.level end, 'draft')
  returning id into mid;
  -- The words shown until the engine fills them from the approved note.
  select * into m from messages where id = mid;
  if tpl.id is not null then
    begin
      update messages set body = left(message_fill(tpl.body, message_variables(m)), 300) where id = mid;
    exception when others then
      -- A preview that cannot be filled is no reason to lose the request: the
      -- engine fills it again at send time and says what is missing.
      update messages set body = left(tpl.body, 300) where id = mid;
    end;
  end if;
  update job_leads set connect_message_id = mid where id = l.id;
  if p_by = 'owner' then
    res := send_action(mid, 'approve');
  else
    res := send_decide(mid, null);
  end if;
  return res || jsonb_build_object('message_id', mid);
end $$;
revoke execute on function public.lead_queue_connect(uuid, text) from public, anon, authenticated;

-- The owner asks for one by hand: Connect on LinkedIn on a task or a lead.
create function public.lead_connect(p_lead uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if app_role() <> 'owner' then raise exception 'not_allowed: Only the owner can connect'; end if;
  return lead_queue_connect(p_lead, 'owner');
end $$;
revoke execute on function public.lead_connect(uuid) from public, anon;
grant execute on function public.lead_connect(uuid) to authenticated;

-- A fresh lead with a poster queues its own request (Jason: once the report
-- is built, add each of those people on LinkedIn). Fresh is 21 days: an older
-- post is left for the owner to decide.
create function public.job_leads_auto_connect() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.outreach_stage = 'found' and new.connect_message_id is null and new.hiring_manager_id is not null
     and coalesce(new.posted_on, new.first_seen_on, current_date) >= current_date - 21
     and not coalesce(new.existing_client, false)
     and coalesce(new.stage, 'new') not in ('dead', 'job_won', 'passed')
     and coalesce(new.poster_profile_url, '') <> '' then
    perform lead_queue_connect(new.id, 'a3_jobs');
  end if;
  return null;
end $$;
create trigger t_auto_connect after insert or update of hiring_manager_id, poster_profile_url on public.job_leads
  for each row execute function public.job_leads_auto_connect();

-- ---------------------------------------------------------------- the ladder moves itself

-- The first message once connected: a draft in plain words, never sent by
-- RecOS (linkedin_message is draft only). Wording to be agreed with Jason.
create function public.lead_first_message(l public.job_leads) returns text
language sql stable as $$
  select format(
    E'Thanks for connecting, %s. I saw %s is hiring for a %s. I only recruit product marketers, mostly for US tech teams, so I speak to people who fit that kind of brief most weeks.\n\nIf it would help, I can share a few profiles or what we are seeing on pay and hiring speed right now. Either way, good to be connected.\n\n%s',
    coalesce(split_part(l.poster_name, ' ', 1), 'there'), l.company, l.role,
    coalesce((select coalesce(nullif(split_part(display_name, ' ', 1), ''), nullif(initcap(split_part(split_part(email, '@', 1), '.', 1)), '')) from app_users where role = 'owner' order by created_at limit 1), 'Jason'))
$$;

create function public.lead_on_connected(p_lead uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  l job_leads%rowtype;
  mid uuid;
begin
  select * into l from job_leads where id = p_lead for update;
  if l.id is null then return; end if;
  if l.outreach_stage in ('found', 'connection_sent') then
    update job_leads set outreach_stage = 'connected' where id = l.id;
  end if;
  if l.li_message_id is null and l.hiring_manager_id is not null then
    insert into messages (owner_id, type, channel, person_id, to_name, to_profile_url, body, created_by, level_at_creation, state)
    values (l.owner_id, 'linkedin_message', 'linkedin', l.hiring_manager_id, coalesce(l.poster_name, 'The poster'), l.poster_profile_url,
      lead_first_message(l), 'system', 'draft_only', 'draft')
    returning id into mid;
    update job_leads set li_message_id = mid, first_message = coalesce(first_message, lead_first_message(l)) where id = l.id;
  end if;
  -- A task already done comes back: there is a message to send now.
  update inbox_items set status = 'new', actioned_at = null, closed_at = null, purge_after = null
  where ref_table = 'job_leads' and ref_id = l.id and type = 'job_lead' and status = 'done';
end $$;
revoke execute on function public.lead_on_connected(uuid) from public, anon, authenticated;

-- A sent request or message moves the lead. The sender reports
-- external_ref 'already_connected' when the profile was a first connection.
create function public.messages_move_lead() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lid uuid;
begin
  if new.state = 'sent' and old.state is distinct from 'sent' then
    if new.type = 'linkedin_connect' then
      select id into lid from job_leads where connect_message_id = new.id;
      if lid is not null then
        if new.external_ref = 'already_connected' then
          perform lead_on_connected(lid);
        else
          update job_leads set outreach_stage = 'connection_sent', connection_note = new.body
          where id = lid and outreach_stage = 'found';
        end if;
      end if;
    elsif new.type = 'linkedin_message' then
      update job_leads set outreach_stage = 'messaged' where li_message_id = new.id and outreach_stage = 'connected';
    end if;
  end if;
  return null;
end $$;
create trigger t_move_lead after update of state on public.messages
  for each row execute function public.messages_move_lead();

-- Approving the note releases the requests waiting for it: template_approve
-- (0034) already runs each waiting draft through the engine again.

-- ---------------------------------------------------------------- the LinkedIn sender's sweep

-- Who is still waiting to accept: oldest check first, each lead looked at
-- once in a run. Names and profile links only.
create function public.send_linkedin_pending(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  out jsonb;
begin
  if is_browser() then raise exception 'not_allowed: the sweep runs from the server'; end if;
  with pick as (
    select id from job_leads
    where outreach_stage = 'connection_sent' and coalesce(poster_profile_url, '') <> ''
      and (outreach_checked_at is null or outreach_checked_at < now() - interval '12 hours')
    order by outreach_checked_at nulls first, outreach_connection_on
    limit least(greatest(coalesce(p_limit, 20), 1), 40)
    for update skip locked
  ), took as (
    update job_leads l set outreach_checked_at = now() from pick where l.id = pick.id
    returning l.id, l.poster_name, l.poster_profile_url, l.company, l.outreach_connection_on
  )
  select coalesce(jsonb_agg(jsonb_build_object('lead_id', id, 'name', poster_name, 'profile_url', poster_profile_url,
    'company', company, 'requested_on', outreach_connection_on) order by outreach_connection_on), '[]') into out
  from took;
  return jsonb_build_object('pending', out, 'count', jsonb_array_length(out));
end $$;
revoke execute on function public.send_linkedin_pending(int) from public, anon, authenticated;

create function public.send_linkedin_status(p_lead uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l job_leads%rowtype;
begin
  if is_browser() then raise exception 'not_allowed: only the sender reports'; end if;
  if p_status not in ('connected', 'pending', 'withdrawn') then raise exception 'invalid: status is connected, pending or withdrawn'; end if;
  select * into l from job_leads where id = p_lead;
  if l.id is null then raise exception 'not_found: no such lead'; end if;
  if p_status = 'connected' then
    perform lead_on_connected(l.id);
    insert into audit_log (actor, action, target_table, target_id, detail)
    values ('sender', 'linkedin connected', 'job_leads', l.id, jsonb_build_object('name', l.poster_name, 'company', l.company));
  elsif p_status = 'withdrawn' then
    update job_leads set outreach_note = left(coalesce(outreach_note || ' ', '') || 'The request was withdrawn or the profile has gone.', 280) where id = l.id;
    insert into audit_log (actor, action, target_table, target_id, detail)
    values ('sender', 'linkedin request gone', 'job_leads', l.id, jsonb_build_object('name', l.poster_name, 'company', l.company));
  end if;
  return jsonb_build_object('lead_id', l.id, 'stage', (select outreach_stage from job_leads where id = l.id));
end $$;
revoke execute on function public.send_linkedin_status(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- the old why text

-- The import of 14 November put "Reported in the LinkedIn PMM hiring report
-- of <date>. Post:" in front of every lead's why. That is the agent's own
-- bookkeeping, not something Jason needs: keep the post's words only.
update public.inbox_items
set why = nullif(btrim(regexp_replace(why, '^Reported in the LinkedIn PMM hiring report of [0-9-]+\.\s*(Post:\s*)?', '')), '')
where type = 'job_lead' and why like 'Reported in the LinkedIn PMM hiring report of %';

-- ---------------------------------------------------------------- fresh leads already in

-- The 21-day rule, once, for leads that came in before this migration.
-- Newest first; the caps pace what actually goes.
do $$
declare
  r record;
begin
  for r in select id from job_leads
           where outreach_stage = 'found' and connect_message_id is null and hiring_manager_id is not null
             and coalesce(posted_on, first_seen_on) >= current_date - 21
             and not coalesce(existing_client, false) and coalesce(stage, 'new') not in ('dead', 'job_won', 'passed')
             and coalesce(poster_profile_url, '') <> ''
           order by coalesce(posted_on, first_seen_on) desc loop
    perform lead_queue_connect(r.id, 'a3_jobs');
  end loop;
end $$;

-- The engine and the sweep run as the service role (strict projects grant it
-- nothing by default).
grant execute on function public.lead_queue_connect(uuid, text), public.lead_on_connected(uuid),
  public.send_linkedin_pending(int), public.send_linkedin_status(uuid, text), public.lead_first_message(public.job_leads) to service_role;
