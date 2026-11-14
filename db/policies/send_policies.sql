-- Row-level security for send_policies (low-level design section 6). Pattern P-SETTINGS.
-- Owner may select and update. Insert and delete only by migration.
-- Safe to run again: each policy is dropped and recreated.

alter table public.send_policies enable row level security;

drop policy if exists send_policies_owner_select on public.send_policies;
create policy send_policies_owner_select on public.send_policies
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists send_policies_owner_update on public.send_policies;
create policy send_policies_owner_update on public.send_policies
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
