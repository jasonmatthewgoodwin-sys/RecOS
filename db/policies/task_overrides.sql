-- Row-level security for task_overrides (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.task_overrides enable row level security;

drop policy if exists task_overrides_owner_select on public.task_overrides;
create policy task_overrides_owner_select on public.task_overrides
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists task_overrides_owner_insert on public.task_overrides;
create policy task_overrides_owner_insert on public.task_overrides
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists task_overrides_owner_update on public.task_overrides;
create policy task_overrides_owner_update on public.task_overrides
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
