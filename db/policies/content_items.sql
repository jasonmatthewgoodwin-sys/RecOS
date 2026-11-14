-- Row-level security for content_items (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.content_items enable row level security;

drop policy if exists content_items_owner_select on public.content_items;
create policy content_items_owner_select on public.content_items
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists content_items_owner_insert on public.content_items;
create policy content_items_owner_insert on public.content_items
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists content_items_owner_update on public.content_items;
create policy content_items_owner_update on public.content_items
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
