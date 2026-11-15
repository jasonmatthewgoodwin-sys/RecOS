-- Row-level security for calls (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.calls enable row level security;

drop policy if exists calls_owner_select on public.calls;
create policy calls_owner_select on public.calls
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists calls_owner_insert on public.calls;
create policy calls_owner_insert on public.calls
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists calls_owner_update on public.calls;
create policy calls_owner_update on public.calls
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
