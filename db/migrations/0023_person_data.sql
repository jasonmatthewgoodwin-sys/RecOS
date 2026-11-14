-- 0023 Settings, Data (sections 6.6, 15.7, 15.8, 32.4, 34.6): find a
-- person, export what RecOS holds about them, delete it, and log an export.
--
-- These are the server side of the E7 and E8 endpoints, written as database
-- functions so that no browser role ever holds a delete grant (6.6). Each
-- runs with the definer's rights, checks for the owner itself and writes the
-- audit log. The edge function wrappers, with their rate limits (15.10),
-- arrive with the endpoints ticket and call these.

-- Where a person appears: a count per table, no row contents.
create function public.person_counts(p_person uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'inbox_items',       nullif((select count(*) from inbox_items where person_id = p_person), 0),
    'messages',          nullif((select count(*) from messages where person_id = p_person), 0),
    'follow_ups',        nullif((select count(*) from follow_ups where person_id = p_person), 0),
    'calendar_today',    nullif((select count(*) from calendar_today where person_id = p_person), 0),
    'coaching_sessions', nullif((select count(*) from coaching_sessions where person_id = p_person), 0),
    'referrals',         nullif((select count(*) from referrals where referred_person_id = p_person or referred_by_id = p_person), 0),
    'league_members',    nullif((select count(*) from league_members where person_id = p_person), 0),
    'touches',           nullif((select count(*) from touches where person_id = p_person), 0),
    'signals',           nullif((select count(*) from signals where person_id = p_person), 0),
    'job_leads',         nullif((select count(*) from job_leads where hiring_manager_id = p_person), 0),
    'wider_leads',       nullif((select count(*) from wider_leads where mentioned_by_id = p_person), 0),
    'do_not_contact',    nullif((select count(*) from do_not_contact where person_id = p_person), 0)
  ))
$$;

-- Find by name or email (15.7). Returns the thin person row and the counts.
create function public.person_find(p_query text)
returns table (id uuid, display_name text, display_title text, display_company text, counts jsonb)
language plpgsql security definer set search_path = public as $$
declare
  q text := lower(btrim(coalesce(p_query, '')));
begin
  if app_role() <> 'owner' then
    raise exception 'Only the owner can look people up';
  end if;
  if length(q) < 2 then
    raise exception 'Type at least two characters';
  end if;
  perform write_audit('person search', 'people', null, jsonb_build_object('query_length', length(q)));
  return query
    select p.id, p.display_name, p.display_title, p.display_company, person_counts(p.id)
    from people p
    where p.name_key like '%' || q || '%'
       or p.email = q
    order by p.display_name
    limit 20;
end $$;

-- Every row about one person, as one JSON document (15.7).
create function public.person_export(p_person uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
begin
  if app_role() <> 'owner' then
    raise exception 'Only the owner can export';
  end if;
  if not exists (select 1 from people where id = p_person) then
    raise exception 'No such person';
  end if;
  select jsonb_build_object(
    'exported_at', now(),
    'person',            (select to_jsonb(p) from people p where p.id = p_person),
    'inbox_items',       coalesce((select jsonb_agg(to_jsonb(r)) from inbox_items r where r.person_id = p_person), '[]'),
    'messages',          coalesce((select jsonb_agg(to_jsonb(r)) from messages r where r.person_id = p_person), '[]'),
    'follow_ups',        coalesce((select jsonb_agg(to_jsonb(r)) from follow_ups r where r.person_id = p_person), '[]'),
    'calendar_today',    coalesce((select jsonb_agg(to_jsonb(r)) from calendar_today r where r.person_id = p_person), '[]'),
    'coaching_sessions', coalesce((select jsonb_agg(to_jsonb(r)) from coaching_sessions r where r.person_id = p_person), '[]'),
    'referrals',         coalesce((select jsonb_agg(to_jsonb(r)) from referrals r where r.referred_person_id = p_person or r.referred_by_id = p_person), '[]'),
    'league_members',    coalesce((select jsonb_agg(to_jsonb(r)) from league_members r where r.person_id = p_person), '[]'),
    'league_history',    coalesce((select jsonb_agg(to_jsonb(h)) from league_history h join league_members m on m.id = h.member_id where m.person_id = p_person), '[]'),
    'touches',           coalesce((select jsonb_agg(to_jsonb(r)) from touches r where r.person_id = p_person), '[]'),
    'signals',           coalesce((select jsonb_agg(to_jsonb(r)) from signals r where r.person_id = p_person), '[]'),
    'job_leads',         coalesce((select jsonb_agg(to_jsonb(r)) from job_leads r where r.hiring_manager_id = p_person), '[]'),
    'wider_leads',       coalesce((select jsonb_agg(to_jsonb(r)) from wider_leads r where r.mentioned_by_id = p_person), '[]'),
    'do_not_contact',    coalesce((select jsonb_agg(to_jsonb(r)) from do_not_contact r where r.person_id = p_person), '[]')
  ) into result;
  perform write_audit('export', 'people', p_person, jsonb_build_object('kind', 'person'));
  return result;
end $$;

-- Remove every row that refers to a person, then the person (15.7, 34.6).
-- KPI events are kept: they hold no personal data. The CRM is not touched.
-- A block on the do-not-contact list stays, by name, so they stay blocked.
create function public.person_delete(p_person uuid, p_confirm text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  counts jsonb := '{}';
  n int;
  person_name text;
begin
  if app_role() <> 'owner' then
    raise exception 'Only the owner can delete';
  end if;
  if p_confirm is distinct from 'DELETE' then
    raise exception 'Type DELETE to confirm';
  end if;
  select display_name into person_name from people where id = p_person;
  if person_name is null then
    raise exception 'No such person';
  end if;

  -- Rows that point at this person's messages are unlinked first.
  update follow_ups set message_id = null where message_id in (select id from messages where person_id = p_person);
  update signals set message_id = null where message_id in (select id from messages where person_id = p_person);
  update job_leads set spec_message_id = null where spec_message_id in (select id from messages where person_id = p_person);
  update wider_leads set intro_message_id = null where intro_message_id in (select id from messages where person_id = p_person);
  delete from send_log where message_id in (select id from messages where person_id = p_person);

  delete from league_history where member_id in (select id from league_members where person_id = p_person);
  get diagnostics n = row_count; counts := counts || jsonb_build_object('league_history', n);
  delete from league_members where person_id = p_person;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('league_members', n);
  delete from touches where person_id = p_person;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('touches', n);
  delete from signals where person_id = p_person;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('signals', n);
  delete from follow_ups where person_id = p_person;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('follow_ups', n);
  delete from inbox_items where person_id = p_person;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('inbox_items', n);
  delete from calendar_today where person_id = p_person;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('calendar_today', n);
  delete from coaching_sessions where person_id = p_person;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('coaching_sessions', n);
  delete from referrals where referred_person_id = p_person;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('referrals', n);
  delete from messages where person_id = p_person;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('messages', n);

  update referrals set referred_by_id = null where referred_by_id = p_person;
  update wider_leads set mentioned_by_id = null where mentioned_by_id = p_person;
  update job_leads set hiring_manager_id = null where hiring_manager_id = p_person;
  update target_companies set marketing_lead_id = null where marketing_lead_id = p_person;
  update do_not_contact set person_id = null, name = coalesce(name, person_name) where person_id = p_person;

  delete from people where id = p_person;
  counts := counts || jsonb_build_object('people', 1);

  perform write_audit('person delete', 'people', p_person, counts);
  return counts || jsonb_build_object('crm', 'The CRM record was not touched');
end $$;

-- The whole-desk export is gathered by the app from the tables the owner can
-- read; this records it (15.8).
create function public.record_export(p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if app_role() <> 'owner' then
    raise exception 'Only the owner can export';
  end if;
  perform write_audit('export', null, null, jsonb_build_object('kind', coalesce(p_kind, 'everything')));
end $$;

revoke execute on function public.person_counts(uuid) from public, anon, authenticated;
revoke execute on function public.person_find(text) from public, anon;
revoke execute on function public.person_export(uuid) from public, anon;
revoke execute on function public.person_delete(uuid, text) from public, anon;
revoke execute on function public.record_export(text) from public, anon;
grant execute on function public.person_find(text) to authenticated;
grant execute on function public.person_export(uuid) to authenticated;
grant execute on function public.person_delete(uuid, text) to authenticated;
grant execute on function public.record_export(text) to authenticated;
