-- Row-level security for messages (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.messages enable row level security;

drop policy if exists messages_owner_select on public.messages;
create policy messages_owner_select on public.messages
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists messages_owner_insert on public.messages;
create policy messages_owner_insert on public.messages
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists messages_owner_update on public.messages;
create policy messages_owner_update on public.messages
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
