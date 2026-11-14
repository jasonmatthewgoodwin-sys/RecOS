-- Row-level security for app_users (low-level design section 6). Pattern read only.
-- A user may read their own row. The owner may read every row. Written by sign-in triggers only.
-- Safe to run again: each policy is dropped and recreated.

alter table public.app_users enable row level security;

drop policy if exists app_users_read on public.app_users;
create policy app_users_read on public.app_users
  for select to authenticated
  using (id = auth.uid() or app_role() = 'owner');
