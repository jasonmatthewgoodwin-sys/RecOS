-- Row-level security for people (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.people enable row level security;

drop policy if exists people_owner_select on public.people;
create policy people_owner_select on public.people
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists people_owner_insert on public.people;
create policy people_owner_insert on public.people
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists people_owner_update on public.people;
create policy people_owner_update on public.people
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
