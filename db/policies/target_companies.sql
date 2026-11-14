-- Row-level security for target_companies (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.target_companies enable row level security;

drop policy if exists target_companies_owner_select on public.target_companies;
create policy target_companies_owner_select on public.target_companies
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists target_companies_owner_insert on public.target_companies;
create policy target_companies_owner_insert on public.target_companies
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists target_companies_owner_update on public.target_companies;
create policy target_companies_owner_update on public.target_companies
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
