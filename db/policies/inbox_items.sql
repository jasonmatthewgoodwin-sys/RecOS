-- Row-level security for inbox_items (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.inbox_items enable row level security;

drop policy if exists inbox_items_owner_select on public.inbox_items;
create policy inbox_items_owner_select on public.inbox_items
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists inbox_items_owner_insert on public.inbox_items;
create policy inbox_items_owner_insert on public.inbox_items
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists inbox_items_owner_update on public.inbox_items;
create policy inbox_items_owner_update on public.inbox_items
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
