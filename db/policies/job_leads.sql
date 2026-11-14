-- Row-level security for job_leads (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.job_leads enable row level security;

drop policy if exists job_leads_owner_select on public.job_leads;
create policy job_leads_owner_select on public.job_leads
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists job_leads_owner_insert on public.job_leads;
create policy job_leads_owner_insert on public.job_leads
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists job_leads_owner_update on public.job_leads;
create policy job_leads_owner_update on public.job_leads
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
