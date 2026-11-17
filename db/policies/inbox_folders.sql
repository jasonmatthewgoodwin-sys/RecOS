-- Row-level security for inbox_folders (migration 0056). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: a folder is removed
-- through delete_inbox_folder(), which checks for the owner.
-- Safe to run again: each policy is dropped and recreated.

alter table public.inbox_folders enable row level security;

drop policy if exists inbox_folders_owner_select on public.inbox_folders;
create policy inbox_folders_owner_select on public.inbox_folders
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists inbox_folders_owner_insert on public.inbox_folders;
create policy inbox_folders_owner_insert on public.inbox_folders
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists inbox_folders_owner_update on public.inbox_folders;
create policy inbox_folders_owner_update on public.inbox_folders
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
