-- Row-level security for campaigns (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.campaigns enable row level security;

drop policy if exists campaigns_owner_select on public.campaigns;
create policy campaigns_owner_select on public.campaigns
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists campaigns_owner_insert on public.campaigns;
create policy campaigns_owner_insert on public.campaigns
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists campaigns_owner_update on public.campaigns;
create policy campaigns_owner_update on public.campaigns
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
