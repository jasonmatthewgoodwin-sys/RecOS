-- Row-level security for lists (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.lists enable row level security;

drop policy if exists lists_owner_select on public.lists;
create policy lists_owner_select on public.lists
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists lists_owner_insert on public.lists;
create policy lists_owner_insert on public.lists
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists lists_owner_update on public.lists;
create policy lists_owner_update on public.lists
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
