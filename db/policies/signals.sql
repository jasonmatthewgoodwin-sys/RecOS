-- Row-level security for signals (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.signals enable row level security;

drop policy if exists signals_owner_select on public.signals;
create policy signals_owner_select on public.signals
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists signals_owner_insert on public.signals;
create policy signals_owner_insert on public.signals
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists signals_owner_update on public.signals;
create policy signals_owner_update on public.signals
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
