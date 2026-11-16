-- 0051 Spec and the search workspace (Mia, 16 November 2026):
--  - spec_requests: Jason marks someone he has spoken to as a good candidate
--    and asks for matches. The research agent reads their calls, their
--    profile and their CV where it lives (Spott or the email it came on, or a
--    paste kept only until the job is answered), and answers with skills,
--    the live jobs they fit and the clients to introduce them to. Rule 1
--    holds: the result carries names, skills and links, never the CV.
--  - search_jobs gains kind brief: the brief filled by the agent from Spott
--    and the calls on the search, so the Brief tab is read, not typed.
--  - calls.summary: the agent's own few lines on a call, so the Calls tab
--    gives the context next to the Granola link. Never note text (19.2).

-- ---------------------------------------------------------------- brief jobs

alter table public.search_jobs drop constraint search_jobs_kind_check;
alter table public.search_jobs add constraint search_jobs_kind_check check (kind in ('questions', 'lowdown', 'map', 'brief'));

create or replace function public.request_search_job(p_search uuid, p_kind text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s searches%rowtype;
  jid uuid;
begin
  if app_role() <> 'owner' then raise exception 'Only the owner can do that'; end if;
  if p_kind is null or p_kind not in ('questions', 'lowdown', 'map', 'brief') then raise exception 'A job is questions, lowdown, map or brief'; end if;
  select * into s from searches where id = p_search;
  if s.id is null then raise exception 'No such search'; end if;
  select j.id into jid from search_jobs j where j.search_id = p_search and j.kind = p_kind and j.status in ('waiting', 'working') limit 1;
  if jid is not null then return jid; end if;
  insert into search_jobs (owner_id, search_id, kind) values (s.owner_id, p_search, p_kind) returning search_jobs.id into jid;
  return jid;
end $$;

create or replace function public.aw_search_result(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j search_jobs%rowtype;
  jid uuid;
  st text := d ->> 'status';
  body text := d ->> 'content';
  nid uuid;
  v int;
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

  if d -> 'structured' is null or jsonb_typeof(d -> 'structured') <> 'object' then return aw_reject('invalid', 'structured must be an object.', 'structured'); end if;
  if jsonb_typeof(d -> 'content') is distinct from 'string' or btrim(body) = '' then return aw_reject('invalid', 'content is the readable text and is needed.', 'content'); end if;
  if length(body) >= 60000 then return aw_reject('invalid', 'Keep content under 60,000 characters.', 'content'); end if;
  if j.kind = 'questions' and jsonb_typeof(d -> 'structured' -> 'groups') is distinct from 'array' then return aw_reject('invalid', 'A questions result needs structured.groups, a list.', 'structured'); end if;
  if j.kind = 'map' and jsonb_typeof(d -> 'structured' -> 'tiers') is distinct from 'array' then return aw_reject('invalid', 'A map result needs structured.tiers, a list.', 'structured'); end if;
  if j.kind = 'lowdown' and d -> 'structured' = '{}'::jsonb then return aw_reject('invalid', 'A lowdown result needs something in structured.', 'structured'); end if;
  if j.kind = 'brief' and d -> 'structured' = '{}'::jsonb then return aw_reject('invalid', 'A brief result needs the fields it found in structured.', 'structured'); end if;

  select coalesce(max(n.version), 0) + 1 into v from search_notes n where n.search_id = j.search_id and n.tab = j.kind;
  insert into search_notes (owner_id, search_id, tab, content, structured, version, created_by)
  values (j.owner_id, j.search_id, j.kind, body, d -> 'structured', v, 'agent')
  returning id into nid;
  update search_jobs set status = 'ready', note = nullif(btrim(d ->> 'note'), ''), finished_at = now() where id = j.id;
  return jsonb_build_object('outcome', 'created', 'id', nid, 'note', format('Version %s', v));
end $$;

-- ---------------------------------------------------------------- call summary

alter table public.calls add column summary text check (summary is null or length(summary) <= 600);
comment on column public.calls.summary is 'The agent''s own few lines on the call, in the desk''s words. Never the note text (19.2).';

create or replace function public.aw_call(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  was calls%rowtype;
  pid uuid;
  sid uuid;
  conf text := coalesce(d ->> 'match_confidence', 'none');
  ctype text := coalesce(d ->> 'call_type', 'unknown');
  held timestamptz;
  id uuid;
  tick boolean;
begin
  begin
    held := (d ->> 'held_at')::timestamptz;
  exception when others then held := null; end;
  if held is null then return aw_reject('invalid', 'A call needs held_at.', 'held_at'); end if;
  if ctype not in ('candidate_screen', 'coaching', 'client_update', 'client_intake', 'reference', 'interview_prep', 'debrief', 'internal', 'other', 'unknown') then
    return aw_reject('invalid', 'Unknown call_type.', 'call_type');
  end if;
  if conf not in ('confirmed', 'high', 'low', 'none') then return aw_reject('invalid', 'match_confidence is confirmed, high, low or none.', 'match_confidence'); end if;
  pid := aw_find_person(d ->> 'person_name', d ->> 'company');
  sid := aw_find_search(d);
  if sid is null then conf := 'none'; end if;
  if nullif(d ->> 'granola_ref', '') is not null then
    select * into was from calls where granola_ref = d ->> 'granola_ref';
  end if;
  if was.id is not null then
    -- A second write-up for the same call updates the ticks and the match; it never doubles the row.
    update calls set
      person_id = coalesce(pid, person_id), search_id = coalesce(sid, search_id), match_confidence = case when sid is not null then conf else match_confidence end,
      w_record = w_record or coalesce((d ->> 'w_record')::boolean, false), w_cv = w_cv or coalesce((d ->> 'w_cv')::boolean, false),
      w_note = w_note or coalesce((d ->> 'w_note')::boolean, false), w_on_search = w_on_search or coalesce((d ->> 'w_on_search')::boolean, false),
      w_follow_up = w_follow_up or coalesce((d ->> 'w_follow_up')::boolean, false), cv_requested = cv_requested or coalesce((d ->> 'cv_requested')::boolean, false),
      crm_note_ref = coalesce(d ->> 'crm_note_ref', crm_note_ref), is_new_a_star = is_new_a_star or coalesce((d ->> 'is_new_a_star')::boolean, false),
      skip_reason = coalesce(d ->> 'skip_reason', skip_reason), minutes = coalesce((d ->> 'minutes')::int, minutes), title = coalesce(d ->> 'title', title),
      summary = coalesce(nullif(left(d ->> 'summary', 600), ''), summary)
    where calls.id = was.id;
    return jsonb_build_object('outcome', 'merged', 'id', was.id);
  end if;
  insert into calls (owner_id, granola_ref, granola_url, calendar_ref, title, held_at, minutes, call_type, person_id, search_id, match_confidence,
    w_record, w_cv, w_note, w_on_search, w_follow_up, cv_requested, crm_note_ref, is_new_a_star, skip_reason, summary)
  values (aw_owner(), nullif(d ->> 'granola_ref', ''), d ->> 'granola_url', d ->> 'calendar_ref', d ->> 'title', held, (d ->> 'minutes')::int, ctype, pid, sid, conf,
    coalesce((d ->> 'w_record')::boolean, false), coalesce((d ->> 'w_cv')::boolean, false), coalesce((d ->> 'w_note')::boolean, false), coalesce((d ->> 'w_on_search')::boolean, false),
    coalesce((d ->> 'w_follow_up')::boolean, false), coalesce((d ->> 'cv_requested')::boolean, false), d ->> 'crm_note_ref', coalesce((d ->> 'is_new_a_star')::boolean, false), d ->> 'skip_reason', nullif(left(d ->> 'summary', 600), ''))
  returning calls.id into id;
  -- A call the agent could not place on a search needs confirming (30.5).
  tick := ctype in ('candidate_screen', 'interview_prep', 'debrief') and conf in ('low', 'none');
  if tick then
    perform aw_inbox(p_run, p_agent, 'call_writeup', format('Which search was %s on?', coalesce(d ->> 'person_name', 'this call')),
      jsonb_build_object('why', 'The call notes did not say. Confirm the search so the write-up lands in the right place.', 'suggested_action', 'Confirm', 'company', d ->> 'company', 'source', 'granola', 'source_url', d ->> 'granola_url'),
      format('call_writeup:confirm:%s', id), 30, pid, 'calls', id, null);
  end if;
  return jsonb_build_object('outcome', 'created', 'id', id, 'note', case when tick then 'Needs the search confirming' else null end);
end $$;

-- ---------------------------------------------------------------- spec requests

create table public.spec_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  person_id uuid not null references public.people (id),
  linkedin_url text,
  -- Where the CV lives: spott, email, pasted or none. The agent reads it there.
  cv_where text not null default 'none' check (cv_where in ('spott', 'email', 'pasted', 'none')),
  -- A pasted CV is kept only until the job is answered, then removed (rule 1).
  cv_text text,
  status text not null default 'waiting' check (status in ('waiting', 'working', 'ready', 'failed')),
  note text check (note is null or length(note) <= 280),
  -- { skills: [..], summary: '..', matches: [{ kind: job_lead|search|account, id, name, role, why, fit }] }
  result jsonb,
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts int not null default 0,
  finished_at timestamptz,
  constraint spec_requests_cv_text_only_when_pasted check (cv_text is null or cv_where = 'pasted')
);
create unique index spec_requests_one_open on public.spec_requests (person_id) where status in ('waiting', 'working');
create index spec_requests_person on public.spec_requests (person_id, requested_at desc);

alter table public.spec_requests enable row level security;
-- The browser reads the request but never the pasted CV column.
revoke all on public.spec_requests from anon, authenticated;
grant select (id, owner_id, person_id, linkedin_url, cv_where, status, note, result, requested_at, finished_at) on public.spec_requests to authenticated;
grant all on public.spec_requests to service_role;

-- The owner asks. One open request per person; asking again returns it.
create function public.request_spec(p_person uuid, p_linkedin_url text default null, p_cv_where text default 'none', p_cv_text text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  id uuid;
begin
  if app_role() <> 'owner' then raise exception 'Only the owner can ask for a spec'; end if;
  if not exists (select 1 from people where people.id = p_person) then raise exception 'No such person'; end if;
  if p_cv_where not in ('spott', 'email', 'pasted', 'none') then raise exception 'cv_where is spott, email, pasted or none'; end if;
  if p_cv_where = 'pasted' and nullif(btrim(p_cv_text), '') is null then raise exception 'A pasted CV needs the text'; end if;
  if length(coalesce(p_cv_text, '')) > 40000 then raise exception 'Keep the CV under 40,000 characters'; end if;
  if nullif(btrim(p_linkedin_url), '') is not null then
    update people set linkedin_url = btrim(p_linkedin_url) where people.id = p_person and linkedin_url is distinct from btrim(p_linkedin_url);
  end if;
  update people set warm_spec = true where people.id = p_person and not warm_spec;
  select r.id into id from spec_requests r where r.person_id = p_person and r.status in ('waiting', 'working') limit 1;
  if id is not null then return id; end if;
  insert into spec_requests (owner_id, person_id, linkedin_url, cv_where, cv_text)
  values ((select app_users.id from app_users where role = 'owner' order by created_at limit 1), p_person, nullif(btrim(p_linkedin_url), ''), p_cv_where, case when p_cv_where = 'pasted' then p_cv_text else null end)
  returning spec_requests.id into id;
  return id;
end $$;
revoke execute on function public.request_spec(uuid, text, text, text) from public, anon;
grant execute on function public.request_spec(uuid, text, text, text) to authenticated;

-- The agent claims up to three waiting requests, with the person, their
-- calls, the pasted CV if any, and what there is to match against: live
-- leads, live searches and the group's accounts.
create function public.aw_claim_spec_jobs() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  out jsonb;
begin
  update spec_requests set status = 'failed', note = 'No answer after three tries. Ask again.', finished_at = now(), cv_text = null
  where status = 'working' and claimed_at < now() - interval '60 minutes' and attempts >= 3;

  with pick as (
    select r.id from spec_requests r
    where r.status = 'waiting' or (r.status = 'working' and r.claimed_at < now() - interval '60 minutes')
    order by r.requested_at
    limit 3
    for update skip locked
  ), took as (
    update spec_requests r set status = 'working', claimed_at = now(), attempts = r.attempts + 1
    from pick where r.id = pick.id
    returning r.id, r.person_id, r.linkedin_url, r.cv_where, r.cv_text, r.requested_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'job_id', t.id,
    'person', jsonb_build_object('id', p.id, 'name', p.display_name, 'title', p.display_title, 'company', p.display_company, 'city', p.city, 'crm_url', p.crm_url, 'linkedin_url', coalesce(t.linkedin_url, p.linkedin_url), 'profile_summary', p.profile_summary),
    'cv', jsonb_build_object('where', t.cv_where, 'text', t.cv_text),
    'calls', coalesce((select jsonb_agg(jsonb_build_object('held_at', c.held_at, 'call_type', c.call_type, 'granola_ref', c.granola_ref, 'granola_url', c.granola_url, 'summary', c.summary, 'search_id', c.search_id) order by c.held_at desc)
      from calls c where c.person_id = p.id), '[]'),
    'leads', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'company', l.company, 'role', l.role, 'level', l.level, 'city', l.city, 'fit_reason', l.fit_reason, 'stage', l.stage) order by l.posted_on desc nulls last)
      from job_leads l where l.stage in ('new', 'chased', 'replied', 'meeting_booked') and l.last_seen_on >= current_date - 45), '[]'),
    'searches', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'client', case when s.confidential then 'Confidential' else s.client end, 'role', s.role, 'role_type', s.role_type, 'location', s.location, 'status', s.status))
      from searches s where s.status in ('intake', 'open')), '[]'),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('company', a.company, 'kind', a.kind, 'colleague', a.colleague) order by a.company) from accounts a where a.active), '[]')
  ) order by t.requested_at), '[]') into out
  from took t join people p on p.id = t.person_id;
  return out;
end $$;
revoke execute on function public.aw_claim_spec_jobs() from public, anon, authenticated;

-- spec_result: the answer. ready stores skills, a summary and the matches,
-- and drops any pasted CV; failed closes it with one line.
create function public.aw_spec_result(p_run uuid, p_agent text, d jsonb) returns jsonb
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
  if d::text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' or d::text ~ '\+?\d[\d\s().-]{8,}\d' then
    return aw_reject('invalid', 'The result carries an email address or a phone number. Names, skills and links only.', 'matches');
  end if;

  update spec_requests set status = 'ready', note = nullif(btrim(d ->> 'note'), ''), finished_at = now(), cv_text = null,
    result = jsonb_build_object('skills', d -> 'skills', 'summary', coalesce(d ->> 'summary', ''), 'matches', d -> 'matches')
  where id = r.id;
  return jsonb_build_object('outcome', 'created', 'id', r.id, 'note', format('%s matches', jsonb_array_length(d -> 'matches')));
end $$;
revoke execute on function public.aw_spec_result(uuid, text, jsonb) from public, anon, authenticated;

-- Any pasted CV older than a day goes whatever happened to the job.
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
  update spec_requests set cv_text = null where cv_text is not null and requested_at < now() - interval '1 day';
  result := jsonb_build_object('retention', r, 'sweeps', s, 'checks', c, 'suggestions', g);
  perform write_audit('nightly run', null, null, result);
  return result;
end $$;

-- ---------------------------------------------------------------- the write contract

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
      else '{}'::jsonb end;
  end loop;
  return out;
end $$;
