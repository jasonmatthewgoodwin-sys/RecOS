-- Row-level security for targets (low-level design section 6). Pattern P-SHARED-RO.
-- Owner and reviewer may select. Only the owner may write. No delete.
-- Safe to run again: each policy is dropped and recreated.

alter table public.targets enable row level security;

drop policy if exists targets_read on public.targets;
create policy targets_read on public.targets
  for select to authenticated
  using (app_role() in ('owner', 'reviewer'));

drop policy if exists targets_owner_insert on public.targets;
create policy targets_owner_insert on public.targets
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists targets_owner_update on public.targets;
create policy targets_owner_update on public.targets
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
