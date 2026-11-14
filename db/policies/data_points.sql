-- Row-level security for data_points (low-level design section 6). Pattern P-OWNER-READ.
-- Owner may select. Only the content agent writes, through agent-write.
-- Safe to run again: each policy is dropped and recreated.

alter table public.data_points enable row level security;

drop policy if exists data_points_owner_select on public.data_points;
create policy data_points_owner_select on public.data_points
  for select to authenticated
  using (app_role() = 'owner');
