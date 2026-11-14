-- Row-level security for referrals (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.referrals enable row level security;

drop policy if exists referrals_owner_select on public.referrals;
create policy referrals_owner_select on public.referrals
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists referrals_owner_insert on public.referrals;
create policy referrals_owner_insert on public.referrals
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists referrals_owner_update on public.referrals;
create policy referrals_owner_update on public.referrals
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
