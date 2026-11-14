-- Row-level security for calendar_today (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.calendar_today enable row level security;

drop policy if exists calendar_today_owner_select on public.calendar_today;
create policy calendar_today_owner_select on public.calendar_today
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists calendar_today_owner_insert on public.calendar_today;
create policy calendar_today_owner_insert on public.calendar_today
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists calendar_today_owner_update on public.calendar_today;
create policy calendar_today_owner_update on public.calendar_today
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
