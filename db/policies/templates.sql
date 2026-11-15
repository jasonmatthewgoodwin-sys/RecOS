-- Row-level security for templates (12.5, section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- The reviewer sees nothing. Safe to run again.

alter table public.templates enable row level security;

drop policy if exists templates_owner_select on public.templates;
create policy templates_owner_select on public.templates
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists templates_owner_insert on public.templates;
create policy templates_owner_insert on public.templates
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists templates_owner_update on public.templates;
create policy templates_owner_update on public.templates
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
