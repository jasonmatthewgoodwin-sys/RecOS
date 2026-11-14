-- Row-level security for follow_ups (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.follow_ups enable row level security;

drop policy if exists follow_ups_owner_select on public.follow_ups;
create policy follow_ups_owner_select on public.follow_ups
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists follow_ups_owner_insert on public.follow_ups;
create policy follow_ups_owner_insert on public.follow_ups
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists follow_ups_owner_update on public.follow_ups;
create policy follow_ups_owner_update on public.follow_ups
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
