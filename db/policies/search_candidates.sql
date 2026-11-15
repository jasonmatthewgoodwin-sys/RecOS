-- Row-level security for search_candidates (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.search_candidates enable row level security;

drop policy if exists search_candidates_owner_select on public.search_candidates;
create policy search_candidates_owner_select on public.search_candidates
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists search_candidates_owner_insert on public.search_candidates;
create policy search_candidates_owner_insert on public.search_candidates
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists search_candidates_owner_update on public.search_candidates;
create policy search_candidates_owner_update on public.search_candidates
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
