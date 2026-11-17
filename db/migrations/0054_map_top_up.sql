-- 0054 A market map can be topped up (Jason, 16 November 2026).
--
-- The first live map came back with 167 companies against a target of about
-- 200, and the top companies had no size. Asking for the map again started
-- from nothing. Now a map job carries `previous`: the newest map already on
-- the search, so the agent keeps every company, fills what is missing and
-- adds to it (the prompt seed agent_prompts_a6_map_top_up.sql says how).
-- Only the claim function changes; everything else in it is as 0048 left it.

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
    returning j.id, j.kind, j.search_id, j.requested_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'job_id', t.id, 'kind', t.kind,
    'search', jsonb_build_object('id', s.id, 'client', s.client, 'confidential', s.confidential, 'role', s.role, 'role_type', s.role_type, 'jd_text', s.jd_text, 'location', s.location),
    'brief', (select n.structured from search_notes n where n.search_id = s.id and n.tab = 'brief' order by n.version desc limit 1),
    'previous', case when t.kind = 'map' then (select n.structured from search_notes n where n.search_id = s.id and n.tab = 'map' order by n.version desc limit 1) end
  ) order by t.requested_at), '[]') into out
  from took t join searches s on s.id = t.search_id;
  return out;
end $$;
revoke execute on function public.aw_claim_search_jobs() from public, anon, authenticated;
