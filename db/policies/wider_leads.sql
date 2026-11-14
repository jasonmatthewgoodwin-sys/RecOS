-- Row-level security for wider_leads (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.wider_leads enable row level security;

drop policy if exists wider_leads_owner_select on public.wider_leads;
create policy wider_leads_owner_select on public.wider_leads
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists wider_leads_owner_insert on public.wider_leads;
create policy wider_leads_owner_insert on public.wider_leads
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists wider_leads_owner_update on public.wider_leads;
create policy wider_leads_owner_update on public.wider_leads
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
