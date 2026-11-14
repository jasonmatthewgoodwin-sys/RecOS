-- Row-level security for shared_blocks (low-level design section 6). Pattern P-SETTINGS.
-- Owner may select and update. Insert and delete only by migration.
-- Safe to run again: each policy is dropped and recreated.

alter table public.shared_blocks enable row level security;

drop policy if exists shared_blocks_owner_select on public.shared_blocks;
create policy shared_blocks_owner_select on public.shared_blocks
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists shared_blocks_owner_update on public.shared_blocks;
create policy shared_blocks_owner_update on public.shared_blocks
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
