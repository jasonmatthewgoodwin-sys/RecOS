-- Row-level security for agent_prompts (low-level design section 6). Pattern P-SETTINGS.
-- Owner may select and update, and may add a new version. No delete.
-- Safe to run again: each policy is dropped and recreated.

alter table public.agent_prompts enable row level security;

drop policy if exists agent_prompts_owner_select on public.agent_prompts;
create policy agent_prompts_owner_select on public.agent_prompts
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists agent_prompts_owner_insert on public.agent_prompts;
create policy agent_prompts_owner_insert on public.agent_prompts
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists agent_prompts_owner_update on public.agent_prompts;
create policy agent_prompts_owner_update on public.agent_prompts
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
