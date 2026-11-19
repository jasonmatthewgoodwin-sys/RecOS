-- 0061 The senior network: LinkedIn profile, how you know them, last contact
-- and a contact rhythm (Jason, 19 November 2026). And call write-ups linked to
-- the person they were with.
--
--   1. A LinkedIn profile link on a person, saved by the owner through
--      set_person_linkedin. Saving one queues the person for the LinkedIn
--      reader (the laptop task "RecOS LinkedIn sender") unless they were read
--      in the last 30 days. The reader claims up to 10 at a time
--      (linkedin_profiles_claim, released after 2 hours) and reports what the
--      profile's top card says (linkedin_profile_report): headline, title,
--      company, location and country. Never an email address or a phone
--      number: a value that looks like either is refused.
--   2. Hand edits win. people.hand_edited names the fields the owner typed
--      himself (title, company, city, country, headline); the reader never
--      overwrites those. Clearing a field by hand hands it back to the reader.
--   3. How you know them: people.how_we_know, 500 characters.
--   4. A contact rhythm per list member: every 30, 60 or 90 days, or none.
--      Senior network members start at 60. The last contact itself is worked
--      out in views/last_contact_view.sql from every source RecOS has, and the
--      status (on track, due, overdue) in views/league_due_view.sql.
--   5. aw_call finds or creates the person behind a call write-up and keeps
--      the name, and link_call_people() links the calls already held.

-- ---------------------------------------------------------------- 1. people

alter table public.people
  add column country text check (country is null or length(country) <= 80),
  add column linkedin_headline text check (linkedin_headline is null or length(linkedin_headline) <= 220),
  add column how_we_know text check (how_we_know is null or length(how_we_know) <= 500),
  add column hand_edited text[] not null default '{}'
    check (hand_edited <@ array['title', 'company', 'city', 'country', 'headline']::text[]),
  add column linkedin_queued_at timestamptz,
  add column linkedin_claimed_at timestamptz,
  add column linkedin_read_at timestamptz,
  add column linkedin_read_error text check (linkedin_read_error is null or length(linkedin_read_error) <= 200);

comment on column public.people.hand_edited is 'Profile fields the owner typed by hand. The LinkedIn reader never overwrites these.';
comment on column public.people.how_we_know is 'How the owner knows them, in his words. Never contact details.';

create index people_linkedin_queue on public.people (linkedin_queued_at) where linkedin_queued_at is not null;

-- A linkedin.com/in/ profile link, tidied to https://www.linkedin.com/in/<name>.
-- Null when the text is not one.
create function public.linkedin_profile_url(p text) returns text
language sql immutable as $$
  select case when btrim(coalesce(p, '')) ~* '^(https?://)?([a-z]{2,3}\.)?(www\.)?linkedin\.com/in/[A-Za-z0-9%_.-]+/?([?#].*)?$'
    then 'https://www.linkedin.com/in/' || (regexp_match(btrim(p), 'linkedin\.com/in/([A-Za-z0-9%_.-]+)', 'i'))[1]
    end
$$;

-- True when the text holds something that looks like an email address or a
-- phone number (a run of 9 to 15 digits with the usual separators). Year
-- ranges such as 2018-2023 are not phone numbers.
create function public.looks_like_contact(p text) returns boolean
language plpgsql immutable as $$
declare
  m text[];
  digits int;
begin
  if p is null then return false; end if;
  if p ~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}' then return true; end if;
  for m in select regexp_matches(p, '\+?\d[\d\s().-]*\d', 'g') loop
    digits := length(regexp_replace(m[1], '[^0-9]', '', 'g'));
    if digits >= 9 and digits <= 15 then return true; end if;
  end loop;
  return false;
end $$;

-- The owner saves or clears the link. A new link, or one not read in the
-- last 30 days, joins the reader's queue.
create function public.set_person_linkedin(p_person uuid, p_url text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  raw text := nullif(btrim(coalesce(p_url, '')), '');
  url text;
  p people%rowtype;
  queue boolean;
begin
  if app_role() <> 'owner' then raise exception 'Only the owner can do that'; end if;
  if raw is not null then
    url := linkedin_profile_url(raw);
    if url is null then raise exception 'That is not a LinkedIn profile link. Paste one with linkedin.com/in/ in it'; end if;
  end if;
  select * into p from people where id = p_person for update;
  if p.id is null then raise exception 'No such person'; end if;
  queue := url is not null and (url is distinct from p.linkedin_url or p.linkedin_read_at is null or p.linkedin_read_at < now() - interval '30 days');
  update people set
    linkedin_url = url,
    linkedin_queued_at = case when url is null then null when queue then coalesce(linkedin_queued_at, now()) else linkedin_queued_at end,
    linkedin_claimed_at = case when url is null then null else linkedin_claimed_at end,
    linkedin_read_error = case when queue or url is null then null else linkedin_read_error end
  where id = p_person;
  return jsonb_build_object('linkedin_url', url, 'queued', (select linkedin_queued_at is not null from people where id = p_person));
end $$;
revoke execute on function public.set_person_linkedin(uuid, text) from public, anon;
grant execute on function public.set_person_linkedin(uuid, text) to authenticated;

-- How you know them, in a few lines. Blank clears it.
create function public.set_person_how_known(p_person uuid, p_text text) returns text
language plpgsql security definer set search_path = public as $$
declare
  t text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if app_role() <> 'owner' then raise exception 'Only the owner can do that'; end if;
  if length(coalesce(t, '')) > 500 then raise exception 'Keep it to 500 characters'; end if;
  if looks_like_contact(t) then raise exception 'Leave out email addresses and phone numbers'; end if;
  update people set how_we_know = t where id = p_person;
  if not found then raise exception 'No such person'; end if;
  return t;
end $$;
revoke execute on function public.set_person_how_known(uuid, text) from public, anon;
grant execute on function public.set_person_how_known(uuid, text) to authenticated;

-- A profile field typed by hand: title, company, city, country or headline.
-- It is marked as the owner's, so the reader leaves it alone. Blank clears
-- the field and hands it back to the reader.
create function public.set_person_detail(p_person uuid, p_field text, p_value text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v text := nullif(btrim(coalesce(p_value, '')), '');
  cap int;
begin
  if app_role() <> 'owner' then raise exception 'Only the owner can do that'; end if;
  cap := case p_field when 'title' then 200 when 'company' then 200 when 'city' then 120 when 'country' then 80 when 'headline' then 220 end;
  if cap is null then raise exception 'That field is title, company, city, country or headline'; end if;
  if length(coalesce(v, '')) > cap then raise exception 'Keep it to % characters', cap; end if;
  if looks_like_contact(v) then raise exception 'Leave out email addresses and phone numbers'; end if;
  update people set
    display_title = case when p_field = 'title' then v else display_title end,
    display_company = case when p_field = 'company' then v else display_company end,
    company_key = case when p_field = 'company' then norm_company(v) else company_key end,
    city = case when p_field = 'city' then v else city end,
    country = case when p_field = 'country' then v else country end,
    linkedin_headline = case when p_field = 'headline' then v else linkedin_headline end,
    hand_edited = case when v is null then array_remove(hand_edited, p_field)
                       when p_field = any(hand_edited) then hand_edited
                       else hand_edited || p_field end
  where id = p_person;
  if not found then raise exception 'No such person'; end if;
  return jsonb_build_object('field', p_field, 'value', v, 'hand_edited', (select hand_edited from people where id = p_person));
end $$;
revoke execute on function public.set_person_detail(uuid, text, text) from public, anon;
grant execute on function public.set_person_detail(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------- 1b. the reader

-- The LinkedIn sender's queue: the oldest first, at most 10, each claimed for
-- 2 hours so two runs never take the same person. Names and links only.
create function public.linkedin_profiles_claim(p_limit int default 10) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  out jsonb;
begin
  if is_browser() then raise exception 'not_allowed: the reader runs from the server'; end if;
  with pick as (
    select id from people
    where linkedin_queued_at is not null and linkedin_url is not null and not do_not_contact
      and (linkedin_claimed_at is null or linkedin_claimed_at < now() - interval '2 hours')
    order by linkedin_queued_at, id
    limit least(greatest(coalesce(p_limit, 10), 1), 10)
    for update skip locked
  ), took as (
    update people p set linkedin_claimed_at = now() from pick where p.id = pick.id
    returning p.id, p.display_name, p.linkedin_url, p.linkedin_queued_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('person_id', id, 'name', display_name, 'linkedin_url', linkedin_url) order by linkedin_queued_at, id), '[]') into out
  from took;
  return jsonb_build_object('profiles', out);
end $$;
revoke execute on function public.linkedin_profiles_claim(int) from public, anon, authenticated;
grant execute on function public.linkedin_profiles_claim(int) to service_role;

-- What the reader saw on the profile's top card, or why it could not read it.
-- A field the owner typed by hand is kept. A value that looks like an email
-- address or a phone number refuses the whole report.
create function public.linkedin_profile_report(
  p_person uuid, p_ok boolean,
  p_headline text default null, p_title text default null, p_company text default null,
  p_location text default null, p_country text default null, p_error text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p people%rowtype;
  h text := nullif(btrim(coalesce(p_headline, '')), '');
  t text := nullif(btrim(coalesce(p_title, '')), '');
  c text := nullif(btrim(coalesce(p_company, '')), '');
  l text := nullif(btrim(coalesce(p_location, '')), '');
  n text := nullif(btrim(coalesce(p_country, '')), '');
  kept text[];
begin
  if is_browser() then raise exception 'not_allowed: only the reader reports'; end if;
  select * into p from people where id = p_person for update;
  if p.id is null then raise exception 'not_found: no such person'; end if;
  if p_ok is null then raise exception 'invalid: ok is true or false'; end if;

  if not p_ok then
    update people set linkedin_queued_at = null, linkedin_claimed_at = null,
      linkedin_read_error = coalesce(left(nullif(btrim(coalesce(p_error, '')), ''), 200), 'The reader could not read the profile.')
    where id = p.id;
    insert into audit_log (actor, action, target_table, target_id, detail)
    values ('sender', 'linkedin profile not read', 'people', p.id, jsonb_build_object('error', left(p_error, 200)));
    return jsonb_build_object('person_id', p.id, 'read', false);
  end if;

  if looks_like_contact(h) then raise exception 'invalid: headline looks like an email address or phone number. Leave it out'; end if;
  if looks_like_contact(t) then raise exception 'invalid: title looks like an email address or phone number. Leave it out'; end if;
  if looks_like_contact(c) then raise exception 'invalid: company looks like an email address or phone number. Leave it out'; end if;
  if looks_like_contact(l) then raise exception 'invalid: location looks like an email address or phone number. Leave it out'; end if;
  if looks_like_contact(n) then raise exception 'invalid: country looks like an email address or phone number. Leave it out'; end if;
  if length(coalesce(h, '')) > 220 then raise exception 'invalid: keep headline to 220 characters'; end if;
  if length(coalesce(t, '')) > 200 then raise exception 'invalid: keep title to 200 characters'; end if;
  if length(coalesce(c, '')) > 200 then raise exception 'invalid: keep company to 200 characters'; end if;
  if length(coalesce(l, '')) > 120 then raise exception 'invalid: keep location to 120 characters'; end if;
  if length(coalesce(n, '')) > 80 then raise exception 'invalid: keep country to 80 characters'; end if;

  kept := array(select f from unnest(p.hand_edited) f
                where (f = 'headline' and h is not null) or (f = 'title' and t is not null) or (f = 'company' and c is not null)
                   or (f = 'city' and l is not null) or (f = 'country' and n is not null));
  update people set
    linkedin_headline = case when 'headline' = any(hand_edited) then linkedin_headline else coalesce(h, linkedin_headline) end,
    display_title = case when 'title' = any(hand_edited) then display_title else coalesce(t, display_title) end,
    display_company = case when 'company' = any(hand_edited) then display_company else coalesce(c, display_company) end,
    company_key = case when 'company' = any(hand_edited) or c is null then company_key else norm_company(c) end,
    city = case when 'city' = any(hand_edited) then city else coalesce(l, city) end,
    country = case when 'country' = any(hand_edited) then country else coalesce(n, country) end,
    linkedin_read_at = now(), linkedin_queued_at = null, linkedin_claimed_at = null, linkedin_read_error = null
  where id = p.id;
  insert into audit_log (actor, action, target_table, target_id, detail)
  values ('sender', 'linkedin profile read', 'people', p.id, jsonb_build_object('kept_by_hand', kept));
  return jsonb_build_object('person_id', p.id, 'read', true, 'kept_by_hand', to_jsonb(kept));
end $$;
revoke execute on function public.linkedin_profile_report(uuid, boolean, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.linkedin_profile_report(uuid, boolean, text, text, text, text, text, text) to service_role;

-- People on the senior network who already have a profile link and have
-- never been read join the queue now.
update public.people p set linkedin_queued_at = now()
where p.linkedin_url is not null and linkedin_profile_url(p.linkedin_url) is not null
  and p.linkedin_read_at is null and p.linkedin_queued_at is null and not p.do_not_contact
  and exists (select 1 from league_members m join lists l on l.id = m.list_id where m.person_id = p.id and m.active and l.key = 'senior_network');

-- ---------------------------------------------------------------- 4. the contact rhythm

alter table public.league_members
  add column contact_every_days int check (contact_every_days is null or contact_every_days in (30, 60, 90));
comment on column public.league_members.contact_every_days is 'Get in touch every 30, 60 or 90 days; null is no rhythm. Senior network members start at 60 (docs/decisions.md, 19 November 2026).';

-- A new senior network member starts at every 60 days.
create function public.league_members_rhythm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.contact_every_days is null and exists (select 1 from lists where id = new.list_id and key = 'senior_network') then
    new.contact_every_days := 60;
  end if;
  return new;
end $$;
create trigger t_rhythm before insert on public.league_members for each row execute function public.league_members_rhythm();

update public.league_members set contact_every_days = 60
where contact_every_days is null and list_id in (select id from public.lists where key = 'senior_network');

create function public.set_contact_rhythm(p_member uuid, p_days int) returns int
language plpgsql security definer set search_path = public as $$
begin
  if app_role() <> 'owner' then raise exception 'Only the owner can do that'; end if;
  if p_days is not null and p_days not in (30, 60, 90) then raise exception 'Every 30, 60 or 90 days, or none'; end if;
  update league_members set contact_every_days = p_days where id = p_member;
  if not found then raise exception 'No such person on a list'; end if;
  return p_days;
end $$;
revoke execute on function public.set_contact_rhythm(uuid, int) from public, anon;
grant execute on function public.set_contact_rhythm(uuid, int) to authenticated;

-- The way of the last contact, in words for a line such as
-- "Last contact: 12 Nov, call".
create function public.contact_how_word(p_how text) returns text
language sql immutable as $$
  select case p_how
    when 'call' then 'call'
    when 'email' then 'email'
    when 'linkedin_message' then 'LinkedIn message'
    when 'linkedin_request' then 'LinkedIn request'
    when 'meeting' then 'meeting'
    when 'event' then 'event'
    else 'noted' end
$$;

-- Indexes for the last-contact lookups.
create index if not exists calls_person on public.calls (person_id, held_at desc) where person_id is not null;
create index if not exists messages_person_sent on public.messages (person_id, sent_at desc) where state = 'sent';

-- ---------------------------------------------------------------- 5. calls linked to people

alter table public.calls add column person_name text check (person_name is null or length(person_name) <= 120);
comment on column public.calls.person_name is 'The name the write-up gave, kept so the call can be linked again. A name only.';

-- The person behind a call: an exact match on the name (case and accents
-- folded), and the company when one is given; else a new thin person row
-- (name, title, company; never contact details). Internal calls and calls
-- with no name have no person.
create function public.call_person(p_name text, p_title text, p_company text, p_call_type text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  nk text := norm_text(p_name);
  ck text := norm_company(p_company);
  id uuid;
begin
  if nk is null or coalesce(p_call_type, 'unknown') = 'internal' then return null; end if;
  if ck is not null then
    select p.id into id from people p
    where (p.name_key = nk or norm_text(p.display_name) = nk)
      and (p.company_key = ck or norm_company(p.display_company) = ck)
    order by p.created_at, p.id limit 1;
    if id is not null then return id; end if;
    -- The same name with no company held yet is the same person: the company is filled in.
    select p.id into id from people p
    where (p.name_key = nk or norm_text(p.display_name) = nk) and p.company_key is null and p.display_company is null
    order by p.created_at, p.id limit 1;
    if id is not null then
      update people set display_company = btrim(p_company), company_key = ck,
        display_title = coalesce(display_title, nullif(btrim(coalesce(p_title, '')), ''))
      where people.id = call_person.id;
      return id;
    end if;
  else
    select p.id into id from people p
    where p.name_key = nk or norm_text(p.display_name) = nk
    order by p.created_at, p.id limit 1;
    if id is not null then return id; end if;
  end if;
  insert into people (owner_id, display_name, name_key, display_title, display_company, company_key, kind)
  values (aw_owner(), left(btrim(p_name), 120), nk, nullif(left(btrim(coalesce(p_title, '')), 200), ''), nullif(btrim(coalesce(p_company, '')), ''), ck,
    case when p_call_type in ('candidate_screen', 'interview_prep', 'debrief', 'coaching') then 'candidate'
         when p_call_type in ('client_update', 'client_intake') then 'client_contact'
         else 'unknown' end)
  returning people.id into id;
  return id;
end $$;
revoke execute on function public.call_person(text, text, text, text) from public, anon, authenticated;

-- As 0053, plus person_title on a call.
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
    when 'call' then array['granola_ref', 'granola_url', 'calendar_ref', 'title', 'held_at', 'minutes', 'call_type', 'person_name', 'person_title', 'company', 'search_client', 'search_role', 'match_confidence', 'w_record', 'w_cv', 'w_note', 'w_on_search', 'w_follow_up', 'cv_requested', 'crm_note_ref', 'is_new_a_star', 'skip_reason', 'summary']
    when 'search_counts' then array['search_id', 'search_client', 'search_role', 'n_sourced', 'n_spoken', 'n_submitted', 'n_first_stage', 'n_later_stage', 'n_offer', 'last_client_contact_on', 'waiting_on', 'health', 'health_reason', 'next_step', 'next_step_on', 'status']
    when 'a_star_suggestion' then array['name', 'title', 'company', 'city', 'linkedin_url', 'why', 'week']
    when 'data_point' then array['statement', 'value', 'as_of', 'category', 'source_name', 'source_url']
    when 'campaign_step' then array['campaign_id', 'step', 'on', 'note', 'outcome', 'crm_ref', 'crm_url']
    when 'search_result' then array['job_id', 'status', 'note', 'content', 'structured']
    when 'spec_result' then array['job_id', 'status', 'note', 'skills', 'summary', 'matches']
    when 'task_result' then array['job_id', 'status', 'note', 'reply', 'relevant', 'done', 'draft', 'actions']
    else null end
$$;

-- As 0051, but the person is found or created (call_person) and the name kept.
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
  pname text := nullif(left(btrim(coalesce(d ->> 'person_name', '')), 120), '');
begin
  begin
    held := (d ->> 'held_at')::timestamptz;
  exception when others then held := null; end;
  if held is null then return aw_reject('invalid', 'A call needs held_at.', 'held_at'); end if;
  if ctype not in ('candidate_screen', 'coaching', 'client_update', 'client_intake', 'reference', 'interview_prep', 'debrief', 'internal', 'other', 'unknown') then
    return aw_reject('invalid', 'Unknown call_type.', 'call_type');
  end if;
  if conf not in ('confirmed', 'high', 'low', 'none') then return aw_reject('invalid', 'match_confidence is confirmed, high, low or none.', 'match_confidence'); end if;
  if looks_like_contact(pname) or looks_like_contact(d ->> 'person_title') then return aw_reject('invalid', 'A name or title only. No email addresses or phone numbers.', 'person_name'); end if;
  pid := call_person(pname, d ->> 'person_title', d ->> 'company', ctype);
  sid := aw_find_search(d);
  if sid is null then conf := 'none'; end if;
  if nullif(d ->> 'granola_ref', '') is not null then
    select * into was from calls where granola_ref = d ->> 'granola_ref';
  end if;
  if was.id is not null then
    -- A second write-up for the same call updates the ticks and the match; it never doubles the row.
    update calls set
      person_id = coalesce(pid, person_id), person_name = coalesce(pname, person_name),
      search_id = coalesce(sid, search_id), match_confidence = case when sid is not null then conf else match_confidence end,
      w_record = w_record or coalesce((d ->> 'w_record')::boolean, false), w_cv = w_cv or coalesce((d ->> 'w_cv')::boolean, false),
      w_note = w_note or coalesce((d ->> 'w_note')::boolean, false), w_on_search = w_on_search or coalesce((d ->> 'w_on_search')::boolean, false),
      w_follow_up = w_follow_up or coalesce((d ->> 'w_follow_up')::boolean, false), cv_requested = cv_requested or coalesce((d ->> 'cv_requested')::boolean, false),
      crm_note_ref = coalesce(d ->> 'crm_note_ref', crm_note_ref), is_new_a_star = is_new_a_star or coalesce((d ->> 'is_new_a_star')::boolean, false),
      skip_reason = coalesce(d ->> 'skip_reason', skip_reason), minutes = coalesce((d ->> 'minutes')::int, minutes), title = coalesce(d ->> 'title', title),
      summary = coalesce(nullif(left(d ->> 'summary', 600), ''), summary)
    where calls.id = was.id;
    return jsonb_build_object('outcome', 'merged', 'id', was.id);
  end if;
  insert into calls (owner_id, granola_ref, granola_url, calendar_ref, title, held_at, minutes, call_type, person_id, person_name, search_id, match_confidence,
    w_record, w_cv, w_note, w_on_search, w_follow_up, cv_requested, crm_note_ref, is_new_a_star, skip_reason, summary)
  values (aw_owner(), nullif(d ->> 'granola_ref', ''), d ->> 'granola_url', d ->> 'calendar_ref', d ->> 'title', held, (d ->> 'minutes')::int, ctype, pid, pname, sid, conf,
    coalesce((d ->> 'w_record')::boolean, false), coalesce((d ->> 'w_cv')::boolean, false), coalesce((d ->> 'w_note')::boolean, false), coalesce((d ->> 'w_on_search')::boolean, false),
    coalesce((d ->> 'w_follow_up')::boolean, false), coalesce((d ->> 'cv_requested')::boolean, false), d ->> 'crm_note_ref', coalesce((d ->> 'is_new_a_star')::boolean, false), d ->> 'skip_reason', nullif(left(d ->> 'summary', 600), ''))
  returning calls.id into id;
  -- A call the agent could not place on a search needs confirming (30.5).
  tick := ctype in ('candidate_screen', 'interview_prep', 'debrief') and conf in ('low', 'none');
  if tick then
    perform aw_inbox(p_run, p_agent, 'call_writeup', format('Which search was %s on?', coalesce(pname, 'this call')),
      jsonb_build_object('why', 'The call notes did not say. Confirm the search so the write-up lands in the right place.', 'suggested_action', 'Confirm', 'company', d ->> 'company', 'source', 'granola', 'source_url', d ->> 'granola_url'),
      format('call_writeup:confirm:%s', id), 30, pid, 'calls', id, null);
  end if;
  return jsonb_build_object('outcome', 'created', 'id', id, 'note', case when tick then 'Needs the search confirming' else null end);
end $$;
revoke execute on function public.aw_call(uuid, text, jsonb) from public, anon, authenticated;

-- The name in a call's title, for calls written up before the name was kept.
-- "Call with Dana Sample", "Dana Sample (Acme) <> Owner Name", "Owner / Dana
-- Sample", "Dana Sample and Owner". The owner's own side is dropped by his
-- first name. Returns {name, company} or null.
create function public.call_title_person(p_title text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t text := btrim(coalesce(p_title, ''));
  me text;
  parts text[];
  side text;
  who text;
  company text;
begin
  if t = '' then return null; end if;
  select norm_text(split_part(coalesce(nullif(btrim(display_name), ''), replace(split_part(email, '@', 1), '.', ' ')), ' ', 1))
    into me from app_users where role = 'owner' order by created_at limit 1;
  if t ~* '^\s*(call|chat|catch[ -]?up|meeting|intro|introduction|screen|interview|coffee)\s+with\s+' then
    who := regexp_replace(t, '^\s*\S+(\s+up)?\s+with\s+', '', 'i');
    who := regexp_replace(who, '\s+(and|&)\s+.*$', '', 'i');
  else
    parts := regexp_split_to_array(t, '\s+(<>|/|x|and|&|\+|-|–|\|)\s+', 'i');
    if array_length(parts, 1) = 2 then
      foreach side in array parts loop
        if me is null or norm_text(side) is null or not (' ' || norm_text(side) || ' ') like ('% ' || me || ' %') then
          if who is not null then return null; end if;
          who := side;
        end if;
      end loop;
    end if;
  end if;
  if who is null then return null; end if;
  company := (regexp_match(who, '\(([^)]+)\)'))[1];
  who := btrim(regexp_replace(regexp_replace(who, '\([^)]*\)', '', 'g'), '\s+[-–|:,].*$', ''));
  -- Two to four words of letters: a name, not a topic.
  if who !~ '^[[:alpha:]''’.-]+(\s+[[:alpha:]''’.-]+){1,3}$' then return null; end if;
  if norm_text(who) ~ '\m(search|role|discussion|interview|call|sync|update|intake|brief|team|product|marketing|pmm|weekly|review)\M' then return null; end if;
  return jsonb_strip_nulls(jsonb_build_object('name', who, 'company', nullif(btrim(coalesce(company, '')), '')));
end $$;
revoke execute on function public.call_title_person(text) from public, anon, authenticated;

-- Link one call by hand, from the server: the name (and company, title) the
-- notes give. For calls whose title does not carry the name.
create function public.link_call_person(p_call uuid, p_name text, p_company text default null, p_title text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c calls%rowtype;
  pid uuid;
begin
  if is_browser() then raise exception 'not_allowed: this runs from the server'; end if;
  select * into c from calls where id = p_call;
  if c.id is null then raise exception 'not_found: no such call'; end if;
  if looks_like_contact(p_name) or looks_like_contact(p_title) then raise exception 'invalid: a name or title only'; end if;
  pid := call_person(p_name, p_title, p_company, c.call_type);
  if pid is null then return null; end if;
  update calls set person_id = pid, person_name = coalesce(nullif(left(btrim(p_name), 120), ''), person_name) where id = c.id;
  return pid;
end $$;
revoke execute on function public.link_call_person(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.link_call_person(uuid, text, text, text) to service_role;

-- Every call with no person yet, not internal: the kept name, else the name
-- in the agent's "Which search was <name> on?" item, else the name in the
-- title. Returns how many were linked.
create function public.link_call_people() returns int
language plpgsql security definer set search_path = public as $$
declare
  c record;
  nm text;
  co text;
  guess jsonb;
  pid uuid;
  n int := 0;
begin
  for c in select * from calls where person_id is null and call_type <> 'internal' order by held_at loop
    nm := c.person_name;
    co := null;
    if nm is null then
      select (regexp_match(i.title, '^Which search was (.+) on\?$'))[1], i.company into nm, co
      from inbox_items i where i.ref_table = 'calls' and i.ref_id = c.id and i.title ~ '^Which search was .+ on\?$'
      order by i.created_at limit 1;
      if nm = 'this call' then nm := null; end if;
    end if;
    if nm is null then
      guess := call_title_person(c.title);
      nm := guess ->> 'name';
      co := coalesce(co, guess ->> 'company');
    end if;
    if nm is null then continue; end if;
    pid := call_person(nm, null, co, c.call_type);
    if pid is null then continue; end if;
    update calls set person_id = pid, person_name = coalesce(person_name, left(btrim(nm), 120)) where id = c.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.link_call_people() from public, anon, authenticated;
grant execute on function public.link_call_people() to service_role;

select public.link_call_people();
