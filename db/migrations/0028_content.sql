-- 0028 Content (sections 12.1 to 12.3, 16.7 to 16.10, 17.3, 31.2, P1-44):
-- content_items, content_sources and data_points, the format check, the
-- rank, the KPI triggers, and the two write-contract kinds A2 sends.
--
-- searches arrive in phase 2, so search_id is a plain uuid for now.

-- ---------------------------------------------------------------- tables

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  kind text not null check (kind in ('linkedin_post', 'job_post', 'blog', 'testimonial', 'case_study', 'idea')),
  run_source text check (run_source in ('calls', 'pmm_community', 'recruiting_news', 'event', 'manual')),
  run_id uuid references public.agent_runs (id),
  angle text check (angle in ('hiring_manager', 'talent_market', 'candidate')),
  topic text not null,
  topic_key text not null,
  hook text,
  body text,
  close_line text,
  hashtags text[] not null default '{}',
  draft_original text,
  data_point text,
  data_point_url text,
  prompted_by text,
  prompted_by_url text,
  word_count int,
  format_ok boolean not null default false,
  format_reason text,
  rank numeric(6,2) not null default 0,
  status text not null default 'draft' check (status in ('idea', 'draft', 'approved', 'planned', 'posted', 'held', 'binned')),
  held_reason text,
  planned_for date,
  posted_on date,
  post_url text,
  impressions int,
  comments int,
  inbound_messages int,
  search_id uuid,
  person_id uuid references public.people (id),
  requested_on date,
  received_on date,
  used_where text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- CON-3: posted needs a date. Planned needs a day.
  constraint content_posted_needs_date check (status <> 'posted' or posted_on is not null),
  constraint content_planned_needs_day check (status <> 'planned' or planned_for is not null)
);
create index content_topic on public.content_items (owner_id, topic_key, created_at desc);
create index content_status on public.content_items (status, rank desc);
create index content_planned on public.content_items (planned_for);
create index content_run on public.content_items (run_id);
create index content_person on public.content_items (person_id);

create table public.content_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  run_source text not null check (run_source in ('pmm_community', 'recruiting_news')),
  name text not null,
  url text not null,
  kind text not null check (kind in ('articles', 'community', 'data', 'news')),
  active boolean not null default true,
  last_ok_on date,
  failed_runs int not null default 0,
  notes text
);

create table public.data_points (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  run_id uuid references public.agent_runs (id),
  statement text not null,
  value text not null,
  as_of date,
  category text check (category in ('job_postings', 'salary_bands', 'survey', 'hiring_market', 'funding', 'desk')),
  source_name text not null,
  -- DAT-1: a data point with no link is refused.
  source_url text not null check (length(btrim(source_url)) > 0),
  found_on date not null default current_date,
  used_in uuid references public.content_items (id),
  created_at timestamptz not null default now()
);
create index data_points_run on public.data_points (run_id);
create index data_points_used on public.data_points (used_in);

create trigger t_upd before update on public.content_items for each row execute function public.set_updated_at();
create trigger t_own before insert on public.content_items for each row execute function public.set_owner();
create trigger t_own before insert on public.content_sources for each row execute function public.set_owner();
create trigger t_own before insert on public.data_points for each row execute function public.set_owner();

revoke all on public.content_items, public.content_sources, public.data_points from anon;
revoke delete, truncate, references, trigger on public.content_items, public.content_sources, public.data_points from authenticated;
grant select, insert, update on public.content_items, public.content_sources to authenticated;
grant select on public.data_points to authenticated;

-- ---------------------------------------------------------------- format (16.9)

-- hook: one line, 15 words or fewer. body: 40 to 90 words, no line over 14
-- words. close: one line. tags: 0 to 2. No emoji, no em dash, no exclamation.
create function public.content_format_check(p_hook text, p_body text, p_close text, p_tags text[])
returns table (ok boolean, reason text)
language plpgsql immutable as $$
declare
  words int;
  line text;
  problems text[] := '{}';
  all_text text := coalesce(p_hook, '') || ' ' || coalesce(p_body, '') || ' ' || coalesce(p_close, '');
begin
  if nullif(btrim(coalesce(p_hook, '')), '') is null then problems := array_append(problems, 'no hook');
  elsif p_hook ~ E'\n' then problems := array_append(problems, 'hook on more than one line');
  elsif array_length(regexp_split_to_array(btrim(p_hook), E'\\s+'), 1) > 15 then problems := array_append(problems, 'hook over 15 words');
  end if;
  if nullif(btrim(coalesce(p_body, '')), '') is null then
    problems := array_append(problems, 'no body');
  else
    words := array_length(regexp_split_to_array(btrim(p_body), E'\\s+'), 1);
    if words < 40 then problems := problems || format('body %s words, under 40', words); end if;
    if words > 90 then problems := problems || format('body %s words, over 90', words); end if;
    foreach line in array regexp_split_to_array(p_body, E'\n') loop
      if nullif(btrim(line), '') is not null and array_length(regexp_split_to_array(btrim(line), E'\\s+'), 1) > 14 then
        problems := array_append(problems, 'a line over 14 words');
        exit;
      end if;
    end loop;
  end if;
  if nullif(btrim(coalesce(p_close, '')), '') is null then problems := array_append(problems, 'no close');
  elsif p_close ~ E'\n' then problems := array_append(problems, 'close on more than one line');
  end if;
  if coalesce(array_length(p_tags, 1), 0) > 2 then problems := array_append(problems, 'more than 2 tags'); end if;
  if all_text ~ '!' then problems := array_append(problems, 'an exclamation mark'); end if;
  if all_text ~ E'—' then problems := array_append(problems, 'an em dash'); end if;
  if all_text ~ '[\U0001F300-\U0001FAFF☀-➿]' then problems := array_append(problems, 'an emoji'); end if;
  ok := coalesce(array_length(problems, 1), 0) = 0;
  reason := case when ok then null else array_to_string(problems, ', ') end;
  return next;
end $$;

-- Rank (17.3): so drafts from all three runs sort together.
create function public.content_rank(p_has_link boolean, p_angle text, p_format_ok boolean, p_from_calls boolean, p_topic_fresh boolean) returns numeric
language sql immutable as $$
  select (case when p_has_link then 30 else 0 end)
       + (case p_angle when 'hiring_manager' then 20 when 'talent_market' then 15 when 'candidate' then 10 else 0 end)
       + (case when p_format_ok then 20 else 0 end)
       + (case when p_from_calls then 15 else 0 end)
       + (case when p_topic_fresh then 10 else 0 end)
$$;

-- ---------------------------------------------------------------- rules (CON-3, CON-4)

create function public.content_items_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'posted' and (tg_op = 'INSERT' or old.status <> 'posted') then
    new.posted_on := coalesce(new.posted_on, current_date);
    if new.kind in ('linkedin_post', 'job_post') then
      insert into kpi_events (owner_id, kpi, happened_at, source_table, source_id, label, is_pmm)
      values (new.owner_id, 'linkedin_posts', new.posted_on::timestamp at time zone 'Europe/London', 'content_items', new.id, left('Posted: ' || new.topic, 120), true)
      on conflict (kpi, source_table, source_id) do nothing;
    elsif new.kind = 'blog' then
      insert into kpi_events (owner_id, kpi, happened_at, source_table, source_id, label, is_pmm)
      values (new.owner_id, 'blogs_published', new.posted_on::timestamp at time zone 'Europe/London', 'content_items', new.id, left('Published: ' || new.topic, 120), true)
      on conflict (kpi, source_table, source_id) do nothing;
    end if;
  end if;
  if new.kind = 'testimonial' and new.received_on is not null and (tg_op = 'INSERT' or old.received_on is null) then
    insert into kpi_events (owner_id, kpi, happened_at, source_table, source_id, label, is_pmm)
    values (new.owner_id, 'testimonials', new.received_on::timestamp at time zone 'Europe/London', 'content_items', new.id, 'Testimonial received', true)
    on conflict (kpi, source_table, source_id) do nothing;
  end if;
  if new.status = 'planned' and tg_op = 'UPDATE' and old.status <> 'planned' and new.planned_for is null then
    raise exception 'A planned post needs a day';
  end if;
  return new;
end $$;

create trigger t_rules before insert or update on public.content_items for each row execute function public.content_items_rules();

-- ---------------------------------------------------------------- the write contract (16.7 to 16.10)

create or replace function public.aw_allowed_fields(p_kind text) returns text[]
language sql immutable as $$
  select case p_kind
    when 'inbox_item' then array['type', 'title', 'why', 'suggested_action', 'draft', 'source', 'source_url', 'links', 'rank', 'company', 'role', 'location', 'person_name']
    when 'job_lead' then array['company', 'role', 'function', 'level', 'location', 'city', 'country', 'source', 'source_url', 'poster_name', 'poster_title', 'poster_profile_url', 'company_size', 'fit_score', 'fit_reason', 'existing_client', 'spec_draft', 'why', 'matched']
    when 'wider_lead' then array['company', 'role', 'function', 'country', 'location', 'source', 'mentioned_by_name', 'existing_client', 'notes', 'why']
    when 'signal' then array['person_name', 'company', 'title', 'city', 'signal_type', 'strength', 'detail', 'source', 'source_url', 'seen_on', 'in_icp', 'draft']
    when 'person' then array['display_name', 'display_title', 'display_company', 'city', 'kind', 'crm', 'crm_ref', 'crm_url', 'linkedin_url', 'email', 'in_crm']
    when 'follow_up' then array['person_name', 'company', 'kind', 'reason', 'source', 'source_url', 'direction', 'due_on', 'call_ref', 'thread_ref', 'draft']
    when 'referral' then array['referred_name', 'referred_company', 'referred_title', 'referred_by_name', 'context', 'kind', 'call_ref']
    when 'touch' then array['person_name', 'company', 'touched_on', 'channel', 'kind', 'source', 'source_url', 'note']
    when 'event_idea' then array['title', 'why', 'source', 'source_url']
    when 'kpi_event' then array['kpi', 'source_table', 'source_ref', 'label', 'is_pmm', 'happened_at']
    when 'calendar_today' then array['events']
    when 'coaching_answers' then array['person_name', 'held_at', 'q_interviewed_where', 'q_who_else_looking', 'q_how_they_hire', 'q_events_rated', 'advice_given', 'referrals_count', 'leads_count']
    when 'message' then array['type', 'channel', 'person_name', 'to_name', 'subject', 'body', 'level']
    when 'content_draft' then array['kind', 'run_source', 'angle', 'topic', 'hook', 'body', 'close_line', 'hashtags', 'data_point', 'data_point_url', 'prompted_by', 'prompted_by_url']
    when 'data_point' then array['statement', 'value', 'as_of', 'category', 'source_name', 'source_url']
    else null end
$$;

-- 16.8: a draft must not name a client, a company at stage chased or later,
-- or a person RecOS holds. Returns the offending word, or null.
create function public.content_names_someone(p_text text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  t text := ' ' || coalesce(norm_text(p_text), '') || ' ';
  hit text;
begin
  select p.display_name into hit from people p
  where length(p.name_key) >= 5 and t like '% ' || p.name_key || ' %' limit 1;
  if hit is not null then return hit; end if;
  select j.company into hit from job_leads j
  where j.stage in ('chased', 'replied', 'meeting_booked', 'job_won') and length(j.company_key) >= 4 and t like '% ' || j.company_key || ' %' limit 1;
  return hit;
end $$;

create function public.aw_content_draft(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k text := coalesce(d ->> 'kind', 'linkedin_post');
  src text := d ->> 'run_source';
  tk text := norm_text(d ->> 'topic');
  tags text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(d -> 'hashtags', '[]')) x), '{}');
  fmt record;
  earlier content_items%rowtype;
  named text;
  st text := 'draft';
  held text;
  fresh boolean;
  id uuid;
  item uuid;
  words int;
begin
  if k not in ('linkedin_post', 'job_post', 'blog') then return aw_reject('invalid', 'A draft is a linkedin_post, job_post or blog.', 'kind'); end if;
  if src is null or src not in ('calls', 'pmm_community', 'recruiting_news', 'event') then return aw_reject('invalid', 'Say which run it came from.', 'run_source'); end if;
  if tk is null then return aw_reject('invalid', 'A draft needs a topic.', 'topic'); end if;
  if coalesce(d ->> 'angle', '') not in ('hiring_manager', 'talent_market', 'candidate') then return aw_reject('invalid', 'A draft needs an angle.', 'angle'); end if;
  if nullif(d ->> 'hook', '') is null or nullif(d ->> 'body', '') is null or nullif(d ->> 'close_line', '') is null then
    return aw_reject('invalid', 'A draft needs a hook, a body and a close.', 'body');
  end if;
  if src in ('pmm_community', 'recruiting_news') and nullif(d ->> 'data_point', '') is null then
    return aw_reject('invalid', 'A research draft needs a data point and its link.', 'data_point');
  end if;

  -- CON-2: the same topic within 56 days is a duplicate, and the agent picks another.
  select * into earlier from content_items
  where topic_key = tk and status <> 'binned' and created_at >= now() - interval '56 days'
  order by created_at desc limit 1;
  if earlier.id is not null then
    return jsonb_build_object('outcome', 'rejected', 'code', 'duplicate', 'id', earlier.id, 'field', 'topic',
      'message', format('That topic was drafted on %s. Pick another.', to_char(earlier.created_at, 'DD Month')));
  end if;

  -- 16.8: the confidentiality check.
  named := content_names_someone((d ->> 'hook') || ' ' || (d ->> 'body') || ' ' || (d ->> 'close_line'));
  if named is not null then
    return aw_reject('policy_refused', format('The draft names %s. Leave people and clients out.', named), 'body');
  end if;

  select * into fmt from content_format_check(d ->> 'hook', d ->> 'body', d ->> 'close_line', tags);
  words := array_length(regexp_split_to_array(btrim(d ->> 'body'), E'\\s+'), 1);
  -- CON-1: a research draft with no link is held, not shown as ready.
  if src in ('pmm_community', 'recruiting_news') and nullif(d ->> 'data_point_url', '') is null then
    st := 'held';
    held := 'The data point has no link';
  end if;
  fresh := not exists (select 1 from content_items where topic_key = tk and created_at >= now() - interval '12 weeks');

  insert into content_items (owner_id, kind, run_source, run_id, angle, topic, topic_key, hook, body, close_line, hashtags, draft_original,
    data_point, data_point_url, prompted_by, prompted_by_url, word_count, format_ok, format_reason, rank, status, held_reason)
  values (aw_owner(), k, src, p_run, d ->> 'angle', d ->> 'topic', tk, d ->> 'hook', d ->> 'body', d ->> 'close_line', tags,
    (d ->> 'hook') || E'\n\n' || (d ->> 'body') || E'\n\n' || (d ->> 'close_line'),
    d ->> 'data_point', d ->> 'data_point_url', d ->> 'prompted_by', d ->> 'prompted_by_url', words, fmt.ok, fmt.reason,
    content_rank(nullif(d ->> 'data_point_url', '') is not null, d ->> 'angle', fmt.ok, src = 'calls', fresh), st, held)
  returning content_items.id into id;

  if st = 'held' then
    item := aw_inbox(p_run, p_agent, 'content_draft', format('A draft is held: %s', d ->> 'topic'),
      jsonb_build_object('why', held || '. Find the source, or bin it.', 'suggested_action', 'Review'), format('content_draft:held:%s', id), 20, null, 'content_items', id, null);
  end if;
  return jsonb_build_object('outcome', 'created', 'id', id, 'inbox_item_id', item, 'note', case when st = 'held' then 'Held: ' || held else case when fmt.ok then null else 'Needs tidying: ' || fmt.reason end end);
end $$;

create function public.aw_data_point(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  id uuid;
  as_of date;
begin
  if nullif(d ->> 'statement', '') is null or nullif(d ->> 'value', '') is null then return aw_reject('invalid', 'A data point needs a statement and a value.', 'statement'); end if;
  if nullif(d ->> 'source_name', '') is null or nullif(d ->> 'source_url', '') is null then return aw_reject('invalid', 'A data point needs a source and its link.', 'source_url'); end if;
  if d ->> 'category' is not null and d ->> 'category' not in ('job_postings', 'salary_bands', 'survey', 'hiring_market', 'funding', 'desk') then
    return aw_reject('invalid', 'Unknown category.', 'category');
  end if;
  begin
    as_of := (d ->> 'as_of')::date;
  exception when others then as_of := null; end;
  if as_of is not null and as_of < current_date - 30 then return aw_reject('invalid', 'Older than 30 days. Find something newer.', 'as_of'); end if;
  insert into data_points (owner_id, run_id, statement, value, as_of, category, source_name, source_url)
  values (aw_owner(), p_run, d ->> 'statement', d ->> 'value', as_of, d ->> 'category', d ->> 'source_name', d ->> 'source_url')
  returning data_points.id into id;
  return jsonb_build_object('outcome', 'created', 'id', id);
end $$;

-- agent_write with the two new kinds in its dispatch.
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
            end;
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

-- The context A2 reads (15.5): the topic keys of the last 56 days and the active sources.
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
    when 'a3_jobs' then array['pool', 'job_keys', 'dnc']
    when 'a4_signals' then array['league', 'dnc']
    when 'a5_followups' then array['searches', 'league', 'offline', 'dnc']
    when 'a6_calls' then array['searches', 'dnc']
    when 'a7_events' then array['dnc']
    else array[]::text[] end;
  foreach w in array coalesce(p_want, array[]::text[]) loop
    if w <> all(allowed) then
      raise exception 'not_allowed: % may not ask for %', p_agent, w;
    end if;
    out := out || case w
      when 'searches' then jsonb_build_object('searches', '[]'::jsonb)
      when 'pool' then jsonb_build_object('pool', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'name', display_name, 'title', display_title, 'company', display_company, 'city', city, 'crm_url', crm_url))
        from people where kind = 'candidate' and not do_not_contact), '[]'))
      when 'league' then jsonb_build_object('league', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'title', p.display_title, 'company', p.display_company, 'tier', m.tier, 'last_touch_on', m.last_touch_on))
        from league_members m join people p on p.id = m.person_id where m.active), '[]'))
      when 'job_keys' then jsonb_build_object('job_keys', coalesce((
        select jsonb_agg(jsonb_build_object('company_key', company_key, 'role_key', role_key))
        from job_leads where last_seen_on >= current_date - 45), '[]'))
      when 'topic_keys' then jsonb_build_object('topic_keys', coalesce((
        select jsonb_agg(distinct topic_key) from content_items where status <> 'binned' and created_at >= now() - interval '56 days'), '[]'))
      when 'sources' then jsonb_build_object('sources', coalesce((
        select jsonb_agg(jsonb_build_object('run_source', run_source, 'name', name, 'url', url, 'kind', kind))
        from content_sources where active), '[]'))
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
      else '{}'::jsonb end;
  end loop;
  return out;
end $$;

revoke execute on function public.content_names_someone(text), public.aw_content_draft(uuid, text, jsonb), public.aw_data_point(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.content_format_check(text, text, text, text[]), public.content_rank(boolean, text, boolean, boolean, boolean) to authenticated;
