-- 0059 A cheap "anything for me?" before a polling run (Jason, 17 November
-- 2026: cut token use). The research, task and campaign routines used to call
-- run-start first, which hands back the agent's whole prompt (up to 20,000
-- characters) only for the run to find nothing waiting. GET /run-agent/peek
-- answers from a few counts, with the agent's key, and claims nothing, so a
-- routine can stop at once when there is no work. An owner's "run now"
-- request is always work. Agents with no queue of their own say work: true.

create or replace function public.agent_peek(p_agent text, p_mode text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  n int := 0;
  asked boolean;
begin
  if not exists (select 1 from agents where code = p_agent and enabled) then
    return jsonb_build_object('work', false, 'waiting', 0, 'note', 'Agent is switched off');
  end if;
  select exists (select 1 from run_requests where agent = p_agent and taken_at is null and run_after <= now()) into asked;

  if p_agent = 'a6_calls' and p_mode = 'research' then
    select (select count(*) from search_jobs where status = 'waiting' or (status = 'working' and claimed_at < now() - interval '60 minutes'))
         + (select count(*) from spec_requests where status = 'waiting' or (status = 'working' and claimed_at < now() - interval '60 minutes'))
      into n;
  elsif p_agent = 'a9_tasks' then
    select count(*) into n from task_jobs where status = 'waiting' or (status = 'working' and claimed_at < now() - interval '60 minutes');
  elsif p_agent = 'a8_campaigns' then
    select count(*) into n from campaigns where status in ('planned', 'running');
  else
    return jsonb_build_object('work', true, 'waiting', null, 'note', 'No queue to check for this agent');
  end if;

  return jsonb_build_object('work', n > 0 or asked, 'waiting', n, 'asked', asked,
    'note', case when n > 0 then format('%s waiting', n) when asked then 'Run asked for' else 'Nothing waiting' end);
end $$;
revoke execute on function public.agent_peek(text, text) from public, anon, authenticated;
grant execute on function public.agent_peek(text, text) to service_role;
