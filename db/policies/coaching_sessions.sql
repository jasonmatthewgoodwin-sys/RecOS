-- Row-level security for coaching_sessions (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.coaching_sessions enable row level security;

drop policy if exists coaching_sessions_owner_select on public.coaching_sessions;
create policy coaching_sessions_owner_select on public.coaching_sessions
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists coaching_sessions_owner_insert on public.coaching_sessions;
create policy coaching_sessions_owner_insert on public.coaching_sessions
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists coaching_sessions_owner_update on public.coaching_sessions;
create policy coaching_sessions_owner_update on public.coaching_sessions
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
