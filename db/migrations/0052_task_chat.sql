-- 0052 A chat on every task (Jason, 16 November 2026): he can ask whether
-- a task is still relevant against his mail, change what it is for, or hand
-- it to an agent to do. The task assistant (a9_tasks) runs as a Claude
-- routine with his connectors, reads the task, its chat, the thread and the
-- calls, replies in the chat, and either closes the task or does the work
-- through the write contract (a message, a follow-up, a touch). Never a
-- send: sending stays with the send engine.

insert into public.agents (code, name, schedule, model_tier)
values ('a9_tasks', 'Task assistant', 'Every 15 minutes, weekdays 08:00 to 20:00', 'standard')
on conflict (code) do nothing;

-- ---------------------------------------------------------------- task_chat

create table public.task_chat (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  task_key text not null,
  author text not null check (author in ('owner', 'agent')),
  kind text not null default 'note' check (kind in ('note', 'check', 'change', 'do', 'answer')),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index task_chat_task on public.task_chat (task_key, created_at);
create trigger t_own before insert on public.task_chat for each row execute function public.set_owner();

alter table public.task_chat enable row level security;
revoke all on public.task_chat from anon, authenticated;
grant select, insert on public.task_chat to authenticated;
grant all on public.task_chat to service_role;

-- ---------------------------------------------------------------- task_jobs

create table public.task_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  task_key text not null,
  kind text not null check (kind in ('check', 'change', 'do')),
  instruction text check (instruction is null or length(instruction) <= 4000),
  status text not null default 'waiting' check (status in ('waiting', 'working', 'ready', 'failed')),
  note text check (note is null or length(note) <= 280),
  result jsonb,
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts int not null default 0,
  finished_at timestamptz
);
create unique index task_jobs_one_open on public.task_jobs (task_key) where status in ('waiting', 'working');
create index task_jobs_task on public.task_jobs (task_key, requested_at desc);
create trigger t_own before insert on public.task_jobs for each row execute function public.set_owner();

alter table public.task_jobs enable row level security;
revoke all on public.task_jobs from anon, authenticated;
grant select on public.task_jobs to authenticated;
grant all on public.task_jobs to service_role;

-- The owner asks, in the chat: check (is this still relevant), change (a new
-- directive in his words), do (hand it over). One open job per task.
create function public.request_task_job(p_task_key text, p_kind text, p_instruction text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o uuid;
  jid uuid;
  words text;
begin
  if app_role() <> 'owner' then raise exception 'Only the owner can ask'; end if;
  if p_kind not in ('check', 'change', 'do') then raise exception 'kind is check, change or do'; end if;
  if p_kind = 'change' and nullif(btrim(p_instruction), '') is null then raise exception 'Say what should change'; end if;
  if length(coalesce(p_instruction, '')) > 4000 then raise exception 'Keep it under 4,000 characters'; end if;
  select app_users.id into o from app_users where role = 'owner' order by created_at limit 1;
  words := coalesce(nullif(btrim(p_instruction), ''), case p_kind when 'check' then 'Is this still relevant?' when 'do' then 'Do this for me.' else '' end);
  insert into task_chat (owner_id, task_key, author, kind, body) values (o, p_task_key, 'owner', p_kind, words);
  select j.id into jid from task_jobs j where j.task_key = p_task_key and j.status in ('waiting', 'working') limit 1;
  if jid is not null then
    update task_jobs set kind = p_kind, instruction = nullif(btrim(p_instruction), '') where task_jobs.id = jid and status = 'waiting';
    return jid;
  end if;
  insert into task_jobs (owner_id, task_key, kind, instruction) values (o, p_task_key, p_kind, nullif(btrim(p_instruction), '')) returning task_jobs.id into jid;
  return jid;
end $$;
revoke execute on function public.request_task_job(text, text, text) from public, anon;
grant execute on function public.request_task_job(text, text, text) to authenticated;

-- The agent claims up to five jobs with everything it needs: the task as the
-- board shows it, the chat so far, the draft message, the person and where
-- the task came from.
create function public.aw_claim_task_jobs() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  out jsonb;
begin
  update task_jobs set status = 'failed', note = 'No answer after three tries. Ask again.', finished_at = now()
  where status = 'working' and claimed_at < now() - interval '60 minutes' and attempts >= 3;

  with pick as (
    select j.id from task_jobs j
    where j.status = 'waiting' or (j.status = 'working' and j.claimed_at < now() - interval '60 minutes')
    order by j.requested_at
    limit 5
    for update skip locked
  ), took as (
    update task_jobs j set status = 'working', claimed_at = now(), attempts = j.attempts + 1
    from pick where j.id = pick.id
    returning j.id, j.task_key, j.kind, j.instruction, j.requested_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'job_id', t.id, 'kind', t.kind, 'instruction', t.instruction, 'task_key', t.task_key,
    'task', (select jsonb_build_object('kind', v.kind, 'title', coalesce(v.o_title, v.title), 'why', v.why, 'notes', v.o_notes, 'due_on', coalesce(v.o_due_on, v.due_on),
      'person_name', v.person_name, 'company', v.company, 'waiting_on', v.waiting_on, 'source_url', v.source_url, 'links', v.links, 'agent', v.agent,
      'message', case when v.message_id is null then null else jsonb_build_object('id', v.message_id, 'state', v.message_state, 'subject', v.subject, 'body', v.draft) end)
      from tasks_view v where v.task_key = t.task_key),
    'chat', coalesce((select jsonb_agg(jsonb_build_object('author', c.author, 'kind', c.kind, 'body', c.body, 'at', c.created_at) order by c.created_at) from task_chat c where c.task_key = t.task_key), '[]'),
    'person', (select jsonb_build_object('id', p.id, 'name', p.display_name, 'title', p.display_title, 'company', p.display_company, 'crm_url', p.crm_url, 'linkedin_url', p.linkedin_url)
      from tasks_view v join follow_ups f on v.source = 'follow_ups' and f.id = v.source_id join people p on p.id = f.person_id where v.task_key = t.task_key limit 1),
    'calls', coalesce((select jsonb_agg(jsonb_build_object('held_at', c.held_at, 'granola_url', c.granola_url, 'summary', c.summary) order by c.held_at desc)
      from tasks_view v join follow_ups f on v.source = 'follow_ups' and f.id = v.source_id join calls c on c.person_id = f.person_id where v.task_key = t.task_key), '[]')
  ) order by t.requested_at), '[]') into out
  from took t;
  return out;
end $$;
revoke execute on function public.aw_claim_task_jobs() from public, anon, authenticated;

-- Close a task from the agent's side: inbox items and follow-ups through
-- their own rows, derived tasks through the override.
create function public.task_close(p_task_key text, p_how text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  src text := split_part(p_task_key, ':', 1);
  sid uuid;
begin
  begin
    sid := split_part(p_task_key, ':', 2)::uuid;
  exception when others then sid := null; end;
  if src = 'inbox_items' and sid is not null then
    update inbox_items set status = case when p_how = 'done' then 'done' else 'binned' end, bin_reason = case when p_how = 'done' then null else p_reason end,
      actioned_at = now(), closed_at = now(), purge_after = current_date + 365 where id = sid;
  elsif src = 'follow_ups' and sid is not null then
    update follow_ups set status = case when p_how = 'done' then 'done' else 'closed' end where id = sid and status in ('open', 'snoozed');
  else
    insert into task_overrides (owner_id, task_key, status, notes)
    values ((select id from app_users where role = 'owner' order by created_at limit 1), p_task_key, case when p_how = 'done' then 'done' else 'binned' end, p_reason)
    on conflict (task_key) do update set status = excluded.status, notes = coalesce(excluded.notes, task_overrides.notes);
  end if;
end $$;
revoke execute on function public.task_close(text, text, text) from public, anon, authenticated;

-- task_result: the agent's answer. reply lands in the chat; relevant false
-- closes the task as no longer relevant; done true closes it as done; draft
-- updates the message's words while it is a draft (or makes the message);
-- actions are kept with the job for the record.
create function public.aw_task_result(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j task_jobs%rowtype;
  jid uuid;
  st text := d ->> 'status';
  v record;
  mid uuid;
  fid uuid;
  how text;
begin
  begin
    jid := (d ->> 'job_id')::uuid;
  exception when others then jid := null; end;
  if jid is null then return aw_reject('invalid', 'A task_result needs job_id.', 'job_id'); end if;
  if st is null or st not in ('ready', 'failed') then return aw_reject('invalid', 'status is ready or failed.', 'status'); end if;
  if length(coalesce(d ->> 'note', '')) > 280 then return aw_reject('invalid', 'Keep note to one line of 280 characters.', 'note'); end if;
  if length(coalesce(d ->> 'reply', '')) > 4000 then return aw_reject('invalid', 'Keep reply under 4,000 characters.', 'reply'); end if;
  select * into j from task_jobs where id = jid for update;
  if j.id is null then return aw_reject('not_found', 'No such job.', 'job_id'); end if;
  if j.status in ('ready', 'failed') then return aw_reject('wrong_state', 'That job is already closed.', 'job_id'); end if;
  -- Rule 1 for the chat too: no address, number or pay in what is kept.
  if coalesce(d ->> 'reply', '') ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' or coalesce(d ->> 'reply', '') ~ '\+?\d[\d\s().-]{8,}\d' then
    return aw_reject('invalid', 'The reply carries an email address or a phone number. Say it without them.', 'reply');
  end if;

  if st = 'failed' then
    update task_jobs set status = 'failed', note = coalesce(nullif(btrim(d ->> 'note'), ''), 'It could not be done this time.'), finished_at = now() where id = j.id;
    insert into task_chat (owner_id, task_key, author, kind, body) values (j.owner_id, j.task_key, 'agent', 'answer', coalesce(nullif(btrim(d ->> 'reply'), ''), coalesce(nullif(btrim(d ->> 'note'), ''), 'I could not do this one. Try again or say more.')));
    return jsonb_build_object('outcome', 'merged', 'id', j.id, 'note', 'Job closed as failed');
  end if;

  if nullif(btrim(d ->> 'reply'), '') is null then return aw_reject('invalid', 'A ready result needs a reply for the chat.', 'reply'); end if;
  select * into v from tasks_view where task_key = j.task_key;

  -- The draft: update the message while it is a draft, or make one for a follow-up.
  if jsonb_typeof(d -> 'draft') = 'object' then
    mid := v.message_id;
    if mid is null and v.source = 'follow_ups' then
      select f.id, f.person_id into fid, mid from follow_ups f where f.id = v.source_id;
      insert into messages (owner_id, type, channel, person_id, to_name, subject, body, created_by, level_at_creation, state)
      values (j.owner_id, 'email_reply', 'email', (select person_id from follow_ups where id = v.source_id), coalesce(v.person_name, v.title), d -> 'draft' ->> 'subject', d -> 'draft' ->> 'body', p_agent, 'draft_only', 'draft')
      returning id into mid;
      update follow_ups set message_id = mid where id = v.source_id;
    elsif mid is not null then
      perform set_config('recos.engine', 'engine', true);
      update messages set subject = coalesce(d -> 'draft' ->> 'subject', subject), body = coalesce(d -> 'draft' ->> 'body', body) where id = mid and state = 'draft';
      perform set_config('recos.engine', '', true);
    end if;
  end if;

  insert into task_chat (owner_id, task_key, author, kind, body) values (j.owner_id, j.task_key, 'agent', 'answer', btrim(d ->> 'reply'));

  how := null;
  if (d ->> 'relevant') = 'false' then how := 'gone';
  elsif (d ->> 'done') = 'true' then how := 'done';
  end if;
  if how is not null then
    perform task_close(j.task_key, how, case when how = 'done' then 'Done by the task assistant' else 'No longer relevant, says the task assistant' end);
  end if;

  update task_jobs set status = 'ready', note = nullif(btrim(d ->> 'note'), ''), finished_at = now(),
    result = jsonb_build_object('relevant', d -> 'relevant', 'done', coalesce(d -> 'done', 'false'::jsonb), 'actions', coalesce(d -> 'actions', '[]'::jsonb), 'closed', how)
  where id = j.id;
  return jsonb_build_object('outcome', 'created', 'id', j.id, 'note', coalesce(how, 'replied'));
end $$;
revoke execute on function public.aw_task_result(uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- the write contract

-- aw_spec_result again: ids are stripped before the address and number check,
-- so a uuid whose digits happen to run together is not refused as a phone number.
create or replace function public.aw_spec_result(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r spec_requests%rowtype;
  jid uuid;
  st text := d ->> 'status';
  m jsonb;
begin
  begin
    jid := (d ->> 'job_id')::uuid;
  exception when others then jid := null; end;
  if jid is null then return aw_reject('invalid', 'A spec_result needs job_id.', 'job_id'); end if;
  if st is null or st not in ('ready', 'failed') then return aw_reject('invalid', 'status is ready or failed.', 'status'); end if;
  if length(coalesce(d ->> 'note', '')) > 280 then return aw_reject('invalid', 'Keep note to one line of 280 characters.', 'note'); end if;
  select * into r from spec_requests where id = jid for update;
  if r.id is null then return aw_reject('not_found', 'No such job.', 'job_id'); end if;
  if r.status in ('ready', 'failed') then return aw_reject('wrong_state', 'That job is already closed.', 'job_id'); end if;

  if st = 'failed' then
    update spec_requests set status = 'failed', note = coalesce(nullif(btrim(d ->> 'note'), ''), 'It could not be done this time.'), finished_at = now(), cv_text = null where id = r.id;
    return jsonb_build_object('outcome', 'merged', 'id', r.id, 'note', 'Job closed as failed');
  end if;

  if jsonb_typeof(d -> 'skills') is distinct from 'array' then return aw_reject('invalid', 'skills is a list of words.', 'skills'); end if;
  if jsonb_typeof(d -> 'matches') is distinct from 'array' then return aw_reject('invalid', 'matches is a list.', 'matches'); end if;
  if length(coalesce(d ->> 'summary', '')) > 1200 then return aw_reject('invalid', 'Keep summary under 1,200 characters.', 'summary'); end if;
  for m in select * from jsonb_array_elements(d -> 'matches') loop
    if m ->> 'kind' not in ('job_lead', 'search', 'account') then return aw_reject('invalid', 'A match kind is job_lead, search or account.', 'matches'); end if;
    if coalesce(m ->> 'why', '') = '' then return aw_reject('invalid', 'Every match says why.', 'matches'); end if;
  end loop;
  -- Rule 1: no address, number or pay in the stored result.
  -- The ids are stripped first: a run of digits inside a uuid is not a number to call.
  if regexp_replace(d::text, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '', 'gi') ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
     or regexp_replace(d::text, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '', 'gi') ~ '\+?\d[\d\s().-]{8,}\d' then
    return aw_reject('invalid', 'The result carries an email address or a phone number. Names, skills and links only.', 'matches');
  end if;

  update spec_requests set status = 'ready', note = nullif(btrim(d ->> 'note'), ''), finished_at = now(), cv_text = null,
    result = jsonb_build_object('skills', d -> 'skills', 'summary', coalesce(d ->> 'summary', ''), 'matches', d -> 'matches')
  where id = r.id;
  return jsonb_build_object('outcome', 'created', 'id', r.id, 'note', format('%s matches', jsonb_array_length(d -> 'matches')));
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
    when 'calendar_today' then array['events', 'from', 'to']
    when 'coaching_answers' then array['person_name', 'held_at', 'q_interviewed_where', 'q_who_else_looking', 'q_how_they_hire', 'q_events_rated', 'advice_given', 'referrals_count', 'leads_count']
    when 'message' then array['type', 'channel', 'person_name', 'company', 'to_name', 'subject', 'body', 'level', 'variables', 'search_id', 'follow_up_id', 'call_id']
    when 'opt_out' then array['person_name', 'company', 'phrase', 'source_url']
    when 'content_draft' then array['kind', 'run_source', 'angle', 'topic', 'hook', 'body', 'close_line', 'hashtags', 'data_point', 'data_point_url', 'prompted_by', 'prompted_by_url']
    when 'outreach_step' then array['lead_id', 'company', 'role', 'step', 'on', 'note', 'outcome']
    when 'call' then array['granola_ref', 'granola_url', 'calendar_ref', 'title', 'held_at', 'minutes', 'call_type', 'person_name', 'company', 'search_client', 'search_role', 'match_confidence', 'w_record', 'w_cv', 'w_note', 'w_on_search', 'w_follow_up', 'cv_requested', 'crm_note_ref', 'is_new_a_star', 'skip_reason', 'summary']
    when 'search_counts' then array['search_id', 'search_client', 'search_role', 'n_sourced', 'n_spoken', 'n_submitted', 'n_first_stage', 'n_later_stage', 'n_offer', 'last_client_contact_on', 'waiting_on', 'health', 'health_reason', 'next_step', 'next_step_on']
    when 'a_star_suggestion' then array['name', 'title', 'company', 'city', 'linkedin_url', 'why', 'week']
    when 'data_point' then array['statement', 'value', 'as_of', 'category', 'source_name', 'source_url']
    when 'campaign_step' then array['campaign_id', 'step', 'on', 'note', 'outcome', 'crm_ref', 'crm_url']
    when 'search_result' then array['job_id', 'status', 'note', 'content', 'structured']
    when 'spec_result' then array['job_id', 'status', 'note', 'skills', 'summary', 'matches']
    when 'task_result' then array['job_id', 'status', 'note', 'reply', 'relevant', 'done', 'draft', 'actions']
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
    when 'a6_calls' then array['wider_lead', 'person', 'follow_up', 'message', 'call', 'referral', 'coaching_answers', 'touch', 'search_counts', 'kpi_event', 'opt_out', 'search_result', 'spec_result']
    when 'a7_events' then array['inbox_item', 'event_idea']
    when 'a8_campaigns' then array['campaign_step', 'outreach_step']
    when 'a9_tasks' then array['task_result', 'message', 'follow_up', 'touch', 'opt_out']
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
            when 'search_result' then aw_search_result(p_run, r.agent, d)
            when 'spec_result' then aw_spec_result(p_run, r.agent, d)
            when 'task_result' then aw_task_result(p_run, r.agent, d)
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
    when 'a6_calls' then array['searches', 'dnc', 'search_jobs', 'spec_jobs']
    when 'a7_events' then array['dnc']
    when 'a8_campaigns' then array['campaigns', 'dnc']
    when 'a9_tasks' then array['task_jobs', 'dnc']
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
      when 'search_jobs' then jsonb_build_object('search_jobs', aw_claim_search_jobs())
      when 'spec_jobs' then jsonb_build_object('spec_jobs', aw_claim_spec_jobs())
      when 'task_jobs' then jsonb_build_object('task_jobs', aw_claim_task_jobs())
      else '{}'::jsonb end;
  end loop;
  return out;
end $$;
