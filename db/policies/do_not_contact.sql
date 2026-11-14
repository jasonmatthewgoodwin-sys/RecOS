-- Row-level security for do_not_contact (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.do_not_contact enable row level security;

drop policy if exists do_not_contact_owner_select on public.do_not_contact;
create policy do_not_contact_owner_select on public.do_not_contact
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists do_not_contact_owner_insert on public.do_not_contact;
create policy do_not_contact_owner_insert on public.do_not_contact
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists do_not_contact_owner_update on public.do_not_contact;
create policy do_not_contact_owner_update on public.do_not_contact
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
