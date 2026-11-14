-- Row-level security for kpi_events (low-level design section 6). Pattern P-OWNER-RO plus one insert policy.
-- Owner may read, and may insert manual corrections only (KPI-1, test T-RLS-5).
-- Safe to run again: each policy is dropped and recreated.

alter table public.kpi_events enable row level security;

drop policy if exists kpi_events_owner_select on public.kpi_events;
create policy kpi_events_owner_select on public.kpi_events
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists kpi_events_owner_insert_manual on public.kpi_events;
create policy kpi_events_owner_insert_manual on public.kpi_events
  for insert to authenticated
  with check (app_role() = 'owner' and manual);
