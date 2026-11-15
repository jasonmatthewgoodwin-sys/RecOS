-- Row-level security for searches (low-level design sections 6 and 30.9).
-- Owner may select, insert and update. The reviewer may read the searches
-- shared with them; the app hides the client on confidential ones. No delete.
-- Safe to run again: each policy is dropped and recreated.

alter table public.searches enable row level security;

drop policy if exists searches_read on public.searches;
create policy searches_read on public.searches
  for select to authenticated
  using (app_role() = 'owner' or (app_role() = 'reviewer' and share_with_reviewer));

drop policy if exists searches_owner_insert on public.searches;
create policy searches_owner_insert on public.searches
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists searches_owner_update on public.searches;
create policy searches_owner_update on public.searches
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
