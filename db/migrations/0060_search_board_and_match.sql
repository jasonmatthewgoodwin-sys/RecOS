-- 0060 The search as one workflow (Jason, 18 November 2026).
--
--  1. Pipeline stages are Jason's, as in Spott: application, sourced,
--     longlist, shortlist, interview_1 to interview_4, offer, placed, and
--     rejected or withdrew. Existing rows map: spoken to longlist, submitted
--     to shortlist, first_stage to interview_1, later_stage to interview_2.
--     The board in the workspace replaces the grouped list. The search's
--     n_ counters keep their meaning: spoken is longlist and beyond,
--     submitted is shortlist and beyond, first stage is interview_1, later
--     stage is interview_2 to 4, offer is offer. Moving to shortlist still
--     needs "agreed to be put forward". Someone at offer makes a live search
--     offer, as the counts already do (0053).
--  2. Role type takes Jason's own words ("Head of Product Marketing") as well
--     as the seven codes, and he saves it and the job description himself
--     through two owner-only functions. Text only: the file never leaves
--     the browser.
--  3. search_jobs gains kind match and an instruction: his answers to "what
--     does a good candidate look like?". A match job carries a pool of the
--     people he knows (calls, spec requests, pipelines), at most 300, with
--     names, titles, companies, links and the agent's own short summaries.
--     No addresses, no CV text, no pay. The answer lands in search_notes,
--     tab match, as a list of people already in people.
--
-- After this file, views/tasks_view.sql must be applied again: its feedback
-- chase reads stage shortlist now.

-- ---------------------------------------------------------------- 1. stages

alter table public.search_candidates drop constraint search_candidates_stage_check;

-- Map the old words without firing the rules: no KPI rows, no follow-ups,
-- and the days in stage and the last change stay as they were.
alter table public.search_candidates disable trigger t_rules;
alter table public.search_candidates disable trigger t_upd;
update public.search_candidates set stage = case stage
    when 'spoken' then 'longlist'
    when 'submitted' then 'shortlist'
    when 'first_stage' then 'interview_1'
    when 'later_stage' then 'interview_2'
    else stage end
  where stage in ('spoken', 'submitted', 'first_stage', 'later_stage');
alter table public.search_candidates enable trigger t_upd;
alter table public.search_candidates enable trigger t_rules;

alter table public.search_candidates add constraint search_candidates_stage_check
  check (stage in ('application', 'sourced', 'longlist', 'shortlist', 'interview_1', 'interview_2', 'interview_3', 'interview_4', 'offer', 'placed', 'rejected', 'withdrew'));

-- CAN-1 to CAN-4 and the offer accepted path (30.7), in the new words.
create or replace function public.search_candidates_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s searches%rowtype;
  who text;
  put_forward constant text[] := array['shortlist', 'interview_1', 'interview_2', 'interview_3', 'interview_4', 'offer', 'placed'];
begin
  select * into s from searches where id = new.search_id;
  if new.stage = 'shortlist' and not new.consent_to_submit then
    raise exception 'Agreed to be put forward must be on first';
  end if;
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    new.stage_changed_on := current_date;
  end if;
  if new.consent_to_submit and new.consent_on is null then new.consent_on := current_date; end if;
  -- Put forward: on the shortlist, or moved past it on the board.
  if new.stage = any (put_forward) and new.submitted_on is null and (tg_op = 'INSERT' or old.stage is distinct from new.stage) then
    new.submitted_on := current_date;
  end if;
  if new.submitted_on is not null and (tg_op = 'INSERT' or old.submitted_on is null) then
    update searches set first_submission_on = coalesce(first_submission_on, new.submitted_on) where id = new.search_id;
  end if;
  if new.stage = 'interview_1' and (tg_op = 'INSERT' or old.stage <> 'interview_1') then
    perform kpi_once(new.owner_id, 'first_interviews', now(), 'search_candidates', new.id, 'First interview: ' || s.role, s.function = 'pmm');
  end if;
  if new.stage = 'offer' and (tg_op = 'INSERT' or old.stage <> 'offer') then
    perform kpi_once(new.owner_id, 'offers', now(), 'search_candidates', new.id, 'Offer: ' || s.role, s.function = 'pmm');
    new.offer_status := coalesce(new.offer_status, 'expected');
    -- Someone at offer makes the search offer (0053, from the board as from the counts).
    update searches set status = 'offer' where id = new.search_id and status in ('intake', 'open');
  end if;
  -- Someone on the longlist or beyond opens a search still at intake (0053).
  if new.stage in ('longlist', 'shortlist', 'interview_1', 'interview_2', 'interview_3', 'interview_4') and (tg_op = 'INSERT' or old.stage is distinct from new.stage) then
    update searches set status = 'open' where id = new.search_id and status = 'intake';
  end if;
  if new.offer_status = 'accepted' and (tg_op = 'INSERT' or old.offer_status is distinct from 'accepted') then
    new.stage := 'placed';
  end if;
  if new.stage = 'placed' and (tg_op = 'INSERT' or old.stage <> 'placed') then
    new.aftercare_on := coalesce(new.aftercare_on, coalesce(new.start_on, current_date) + 30);
    update searches set status = 'placed' where id = new.search_id and status <> 'placed';
  end if;
  if new.stage in ('rejected', 'withdrew') and (tg_op = 'INSERT' or old.stage not in ('rejected', 'withdrew')) then
    select display_name into who from people where id = new.person_id;
    insert into follow_ups (owner_id, person_id, person_name, company, kind, reason, source, direction, due_on, dedup_key)
    values (new.owner_id, new.person_id, coalesce(who, 'The candidate'), case when s.confidential then null else s.client end, 'rejection',
      case when new.stage = 'rejected' then 'Tell them it is a no, kindly' else 'Thank them and keep the door open' end || coalesce(': ' || new.outcome_reason, ''),
      'rule', 'owed', add_working_days(current_date, 1), 'rejection:' || new.id::text)
    on conflict (dedup_key) do nothing;
  end if;
  return new;
end $$;

-- The standing rules (0049), with "still at spoken" now "still on the longlist".
create or replace function public.raise_suggestions() returns int
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

  -- A candidate on the longlist more than five working days with no decision.
  for r in
    select c.id, c.person_id, p.display_name, s.role, s.client
    from search_candidates c
    join people p on p.id = c.person_id
    join searches s on s.id = c.search_id
    where c.stage = 'longlist' and s.status in ('open', 'intake')
      and public.working_days(c.stage_changed_on, current_date) >= 5
  loop
    n := n + public.suggest(o, format('Decide on %s for %s', r.display_name, r.client),
      format('On the longlist for the %s search for over a week. Shortlist them, or let them know.', r.role),
      'Shortlist them, or close the loop', format('rule:decide:%s', r.id), 20, current_date,
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

-- ---------------------------------------------------------------- 2. role type and job description

alter table public.searches drop constraint searches_role_type_check;
alter table public.searches add constraint searches_role_type_check
  check (role_type is null or length(btrim(role_type)) between 1 and 80);

-- As 0048, less the fixed list of role types.
create or replace function public.start_search(p_client text, p_role text, p_role_type text default null, p_jd_text text default null, p_brief_due_on date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  jd text := nullif(btrim(coalesce(p_jd_text, '')), '');
  rt text := nullif(btrim(coalesce(p_role_type, '')), '');
begin
  if app_role() <> 'owner' then raise exception 'Only the owner can do that'; end if;
  if norm_text(p_client) is null then raise exception 'A search needs a client'; end if;
  if nullif(btrim(coalesce(p_role, '')), '') is null then raise exception 'A search needs a role, however rough'; end if;
  if length(coalesce(rt, '')) > 80 then raise exception 'Keep the role type to 80 characters'; end if;
  if length(coalesce(jd, '')) > 60000 then raise exception 'That job description is too long. Keep it under 60,000 characters'; end if;
  insert into searches (owner_id, client, client_key, role, function, status, role_type, jd_text, brief_due_on)
  values (auth.uid(), btrim(p_client), coalesce(norm_company(p_client), norm_text(p_client)), btrim(p_role), 'pmm', 'intake', rt, jd, p_brief_due_on)
  returning id into sid;
  return sid;
end $$;

-- One of the seven codes, or his own words. Blank clears it.
create function public.set_search_role_type(p_search uuid, p_role_type text) returns text
language plpgsql security definer set search_path = public as $$
declare
  rt text := nullif(btrim(coalesce(p_role_type, '')), '');
begin
  if app_role() <> 'owner' then raise exception 'Only the owner can do that'; end if;
  if length(coalesce(rt, '')) > 80 then raise exception 'Keep the role type to 80 characters'; end if;
  update searches set role_type = rt where id = p_search;
  if not found then raise exception 'No such search'; end if;
  return rt;
end $$;
revoke execute on function public.set_search_role_type(uuid, text) from public, anon;
grant execute on function public.set_search_role_type(uuid, text) to authenticated;

-- The job description as text, pasted or read from a file in the browser. Blank clears it.
create function public.set_search_jd(p_search uuid, p_jd_text text) returns int
language plpgsql security definer set search_path = public as $$
declare
  jd text := nullif(btrim(coalesce(p_jd_text, '')), '');
begin
  if app_role() <> 'owner' then raise exception 'Only the owner can do that'; end if;
  if length(coalesce(jd, '')) > 60000 then raise exception 'That job description is too long. Keep it under 60,000 characters'; end if;
  update searches set jd_text = jd where id = p_search;
  if not found then raise exception 'No such search'; end if;
  return coalesce(length(jd), 0);
end $$;
revoke execute on function public.set_search_jd(uuid, text) from public, anon;
grant execute on function public.set_search_jd(uuid, text) to authenticated;

-- ---------------------------------------------------------------- 3. recommended candidates

alter table public.search_jobs drop constraint search_jobs_kind_check;
alter table public.search_jobs add constraint search_jobs_kind_check check (kind in ('questions', 'lowdown', 'map', 'brief', 'match'));
alter table public.search_jobs add column instruction jsonb
  check (instruction is null or (jsonb_typeof(instruction) = 'object' and length(instruction::text) <= 8000));

alter table public.search_notes drop constraint search_notes_tab_check;
alter table public.search_notes add constraint search_notes_tab_check
  check (tab in ('brief', 'map', 'calibration', 'client_updates', 'interviews', 'offer', 'close_out', 'questions', 'lowdown', 'match'));

-- The owner asks. A match job needs his answers: must_haves, nice_to_haves,
-- target_backgrounds, deal_breakers and level_and_location, each one short
-- text. A second ask while one waits takes the newer answers.
drop function public.request_search_job(uuid, text);
create function public.request_search_job(p_search uuid, p_kind text, p_instruction jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s searches%rowtype;
  jid uuid;
  k text;
  v jsonb;
  ins jsonb := '{}';
  allowed constant text[] := array['must_haves', 'nice_to_haves', 'target_backgrounds', 'deal_breakers', 'level_and_location'];
begin
  if app_role() <> 'owner' then raise exception 'Only the owner can do that'; end if;
  if p_kind is null or p_kind not in ('questions', 'lowdown', 'map', 'brief', 'match') then raise exception 'A job is questions, lowdown, map, brief or match'; end if;
  select * into s from searches where id = p_search;
  if s.id is null then raise exception 'No such search'; end if;

  if p_kind = 'match' then
    if p_instruction is null or jsonb_typeof(p_instruction) <> 'object' then raise exception 'Say what a good candidate looks like first'; end if;
    for k, v in select * from jsonb_each(p_instruction) loop
      if not k = any (allowed) then raise exception 'Unknown answer: %', k; end if;
      if jsonb_typeof(v) not in ('string', 'null') then raise exception 'Each answer is text'; end if;
      if length(coalesce(v #>> '{}', '')) > 1000 then raise exception 'Keep each answer under 1,000 characters'; end if;
      if nullif(btrim(coalesce(v #>> '{}', '')), '') is not null then ins := ins || jsonb_build_object(k, btrim(v #>> '{}')); end if;
    end loop;
    if ins = '{}'::jsonb then raise exception 'Say what a good candidate looks like first'; end if;
  elsif p_instruction is not null then
    raise exception 'Only a match job takes answers';
  end if;

  select j.id into jid from search_jobs j where j.search_id = p_search and j.kind = p_kind and j.status in ('waiting', 'working') limit 1;
  if jid is not null then
    if p_kind = 'match' then update search_jobs set instruction = ins where id = jid and status = 'waiting'; end if;
    return jid;
  end if;
  insert into search_jobs (owner_id, search_id, kind, instruction)
  values (s.owner_id, p_search, p_kind, case when p_kind = 'match' then ins end)
  returning search_jobs.id into jid;
  return jid;
end $$;
revoke execute on function public.request_search_job(uuid, text, jsonb) from public, anon;
grant execute on function public.request_search_job(uuid, text, jsonb) to authenticated;

-- The people he knows, for a match job: anyone with a call, a spec request
-- or a place on a pipeline, newest contact first, at most 300. Names, titles,
-- companies, links and the agent's own short summaries only.
create function public.match_pool() returns jsonb
language sql stable security definer set search_path = public as $$
  with touched as (
    select person_id, max(held_at) as at from calls where person_id is not null group by person_id
    union all
    select person_id, max(requested_at) from spec_requests group by person_id
    union all
    select person_id, max(updated_at) from search_candidates group by person_id
  ), known as (
    select person_id, max(at) as last_contact from touched group by person_id
    order by max(at) desc nulls last
    limit 300
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id', p.id,
    'name', p.display_name,
    'title', p.display_title,
    'company', p.display_company,
    'crm_url', p.crm_url,
    'linkedin_url', p.linkedin_url,
    'last_call_on', (select max(c.held_at)::date from calls c where c.person_id = p.id),
    'last_call_summary', (select c.summary from calls c where c.person_id = p.id and c.summary is not null order by c.held_at desc limit 1),
    'spec_skills', (select r.result -> 'skills' from spec_requests r where r.person_id = p.id and r.status = 'ready' and r.result is not null order by r.requested_at desc limit 1),
    'spec_summary', (select r.result ->> 'summary' from spec_requests r where r.person_id = p.id and r.status = 'ready' and r.result is not null order by r.requested_at desc limit 1)
  ) order by k.last_contact desc nulls last), '[]')
  from known k join people p on p.id = k.person_id
$$;
revoke execute on function public.match_pool() from public, anon, authenticated;

-- As 0054, plus each job's instruction, and for a match job the pool, the
-- people already on this search and those he said are not for this one.
create or replace function public.aw_claim_search_jobs() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  out jsonb;
begin
  update search_jobs set status = 'failed', note = 'No answer after three tries. Ask again.', finished_at = now()
  where status = 'working' and claimed_at < now() - interval '60 minutes' and attempts >= 3;

  with pick as (
    select j.id from search_jobs j
    where j.status = 'waiting' or (j.status = 'working' and j.claimed_at < now() - interval '60 minutes')
    order by j.requested_at
    limit 3
    for update skip locked
  ), took as (
    update search_jobs j set status = 'working', claimed_at = now(), attempts = j.attempts + 1
    from pick where j.id = pick.id
    returning j.id, j.kind, j.search_id, j.requested_at, j.instruction
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'job_id', t.id, 'kind', t.kind,
    'search', jsonb_build_object('id', s.id, 'client', s.client, 'confidential', s.confidential, 'role', s.role, 'role_type', s.role_type, 'jd_text', s.jd_text, 'location', s.location),
    'brief', (select n.structured from search_notes n where n.search_id = s.id and n.tab = 'brief' order by n.version desc limit 1),
    'previous', case when t.kind = 'map' then (select n.structured from search_notes n where n.search_id = s.id and n.tab = 'map' order by n.version desc limit 1) end,
    'instruction', t.instruction,
    'pool', case when t.kind = 'match' then match_pool() end,
    'on_this_search', case when t.kind = 'match' then (select coalesce(jsonb_agg(c.person_id), '[]') from search_candidates c where c.search_id = s.id) end,
    'not_for_this_one', case when t.kind = 'match' then (
      select coalesce(jsonb_agg(distinct d.value), '[]')
      from search_notes n cross join lateral jsonb_array_elements_text(coalesce(n.structured -> 'dismissed', '[]')) d
      where n.search_id = s.id and n.tab = 'match' and jsonb_typeof(n.structured -> 'dismissed') = 'array') end
  ) order by t.requested_at), '[]') into out
  from took t join searches s on s.id = t.search_id;
  return out;
end $$;
revoke execute on function public.aw_claim_search_jobs() from public, anon, authenticated;

-- As 0051, plus kind match: structured.candidates, each rebuilt from people
-- so only the allowed fields land. A candidate whose person_id is not in
-- people, or whose fit is not strong, good or maybe, is left out and counted.
create or replace function public.aw_search_result(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j search_jobs%rowtype;
  jid uuid;
  st text := d ->> 'status';
  body text := d ->> 'content';
  nid uuid;
  v int;
  structured jsonb := d -> 'structured';
  item jsonb;
  pid uuid;
  p people%rowtype;
  kept jsonb := '[]';
  left_out int := 0;
begin
  begin
    jid := (d ->> 'job_id')::uuid;
  exception when others then jid := null; end;
  if jid is null then return aw_reject('invalid', 'A search_result needs job_id.', 'job_id'); end if;
  if st is null or st not in ('ready', 'failed') then return aw_reject('invalid', 'status is ready or failed.', 'status'); end if;
  if length(coalesce(d ->> 'note', '')) > 280 then return aw_reject('invalid', 'Keep note to one line of 280 characters.', 'note'); end if;
  select * into j from search_jobs where id = jid for update;
  if j.id is null then return aw_reject('not_found', 'No such job.', 'job_id'); end if;
  if j.status in ('ready', 'failed') then return aw_reject('wrong_state', 'That job is already closed.', 'job_id'); end if;

  if st = 'failed' then
    update search_jobs set status = 'failed', note = coalesce(nullif(btrim(d ->> 'note'), ''), 'It could not be done this time.'), finished_at = now() where id = j.id;
    return jsonb_build_object('outcome', 'merged', 'id', j.id, 'note', 'Job closed as failed');
  end if;

  if structured is null or jsonb_typeof(structured) <> 'object' then return aw_reject('invalid', 'structured must be an object.', 'structured'); end if;
  if jsonb_typeof(d -> 'content') is distinct from 'string' or btrim(body) = '' then return aw_reject('invalid', 'content is the readable text and is needed.', 'content'); end if;
  if length(body) >= 60000 then return aw_reject('invalid', 'Keep content under 60,000 characters.', 'content'); end if;
  if j.kind = 'questions' and jsonb_typeof(structured -> 'groups') is distinct from 'array' then return aw_reject('invalid', 'A questions result needs structured.groups, a list.', 'structured'); end if;
  if j.kind = 'map' and jsonb_typeof(structured -> 'tiers') is distinct from 'array' then return aw_reject('invalid', 'A map result needs structured.tiers, a list.', 'structured'); end if;
  if j.kind = 'lowdown' and structured = '{}'::jsonb then return aw_reject('invalid', 'A lowdown result needs something in structured.', 'structured'); end if;
  if j.kind = 'brief' and structured = '{}'::jsonb then return aw_reject('invalid', 'A brief result needs the fields it found in structured.', 'structured'); end if;

  if j.kind = 'match' then
    if jsonb_typeof(structured -> 'candidates') is distinct from 'array' then return aw_reject('invalid', 'A match result needs structured.candidates, a list.', 'structured'); end if;
    if jsonb_array_length(structured -> 'candidates') > 50 then return aw_reject('invalid', 'Send at most 50 candidates.', 'structured'); end if;
    for item in select * from jsonb_array_elements(structured -> 'candidates') loop
      begin
        pid := (item ->> 'person_id')::uuid;
      exception when others then pid := null; end;
      -- No row (or no id) leaves every field of p null.
      select * into p from people where id = pid;
      if p.id is null or coalesce(item ->> 'fit', '') not in ('strong', 'good', 'maybe') then
        left_out := left_out + 1;
        continue;
      end if;
      kept := kept || jsonb_build_array(jsonb_build_object(
        'person_id', p.id,
        'name', p.display_name,
        'title', coalesce(nullif(left(btrim(item ->> 'title'), 160), ''), p.display_title),
        'company', coalesce(nullif(left(btrim(item ->> 'company'), 160), ''), p.display_company),
        'fit', item ->> 'fit',
        'why', left(coalesce(btrim(item ->> 'why'), ''), 280),
        'gaps', left(coalesce(btrim(item ->> 'gaps'), ''), 280)));
    end loop;
    structured := jsonb_build_object('candidates', kept, 'left_out', left_out);
  end if;

  select coalesce(max(n.version), 0) + 1 into v from search_notes n where n.search_id = j.search_id and n.tab = j.kind;
  insert into search_notes (owner_id, search_id, tab, content, structured, version, created_by)
  values (j.owner_id, j.search_id, j.kind, body, structured, v, 'agent')
  returning id into nid;
  update search_jobs set status = 'ready', note = nullif(btrim(d ->> 'note'), ''), finished_at = now() where id = j.id;
  return jsonb_build_object('outcome', 'created', 'id', nid,
    'note', format('Version %s', v) || case when left_out > 0 then format(', %s left out: not in people or no fit', left_out) else '' end);
end $$;
revoke execute on function public.aw_search_result(uuid, text, jsonb) from public, anon, authenticated;

comment on table public.search_jobs is
  'Research the owner has asked for on a search (0048, 0060): brief questions, client lowdown, market map, brief, and recommended candidates (match, with his answers in instruction). Rows are added by request_search_job, claimed by a6_calls through agent_context(search_jobs) and closed by the search_result write kind. The browser reads only.';
