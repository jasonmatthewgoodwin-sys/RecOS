-- Row-level security for agents (low-level design section 6). Pattern P-SETTINGS.
-- Owner may select and update. Insert and delete only by migration.
-- Safe to run again: each policy is dropped and recreated.

alter table public.agents enable row level security;

drop policy if exists agents_owner_select on public.agents;
create policy agents_owner_select on public.agents
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists agents_owner_update on public.agents;
create policy agents_owner_update on public.agents
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
