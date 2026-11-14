-- Row-level security for app_settings (low-level design section 6). Pattern P-SETTINGS.
-- Owner may select and update. Insert and delete only by migration.
-- Safe to run again: each policy is dropped and recreated.

alter table public.app_settings enable row level security;

drop policy if exists app_settings_owner_select on public.app_settings;
create policy app_settings_owner_select on public.app_settings
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists app_settings_owner_update on public.app_settings;
create policy app_settings_owner_update on public.app_settings
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
