-- Row-level security for agent_runs (low-level design section 6). Pattern P-OWNER-RO.
-- Owner may select only. Rows are written by the service role and by triggers.
-- Safe to run again: each policy is dropped and recreated.

alter table public.agent_runs enable row level security;

drop policy if exists agent_runs_owner_select on public.agent_runs;
create policy agent_runs_owner_select on public.agent_runs
  for select to authenticated
  using (app_role() = 'owner');
