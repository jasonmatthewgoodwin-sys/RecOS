-- Row-level security for touches (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.touches enable row level security;

drop policy if exists touches_owner_select on public.touches;
create policy touches_owner_select on public.touches
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists touches_owner_insert on public.touches;
create policy touches_owner_insert on public.touches
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists touches_owner_update on public.touches;
create policy touches_owner_update on public.touches
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
