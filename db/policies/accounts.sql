-- Row-level security for accounts (the group's clients and the owner's own accounts, 14 November 2026). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.accounts enable row level security;

drop policy if exists accounts_owner_select on public.accounts;
create policy accounts_owner_select on public.accounts
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists accounts_owner_insert on public.accounts;
create policy accounts_owner_insert on public.accounts
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists accounts_owner_update on public.accounts;
create policy accounts_owner_update on public.accounts
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
