-- Row-level security for league_members (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.league_members enable row level security;

drop policy if exists league_members_owner_select on public.league_members;
create policy league_members_owner_select on public.league_members
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists league_members_owner_insert on public.league_members;
create policy league_members_owner_insert on public.league_members
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists league_members_owner_update on public.league_members;
create policy league_members_owner_update on public.league_members
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
