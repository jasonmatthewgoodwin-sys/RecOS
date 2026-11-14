-- Row-level security for run_requests (low-level design section 6, 15.9).
-- The owner reads them; rows are added by request_run and taken by run-start.
-- Safe to run again: the policy is dropped and recreated.

alter table public.run_requests enable row level security;

drop policy if exists run_requests_owner_select on public.run_requests;
create policy run_requests_owner_select on public.run_requests
  for select to authenticated
  using (app_role() = 'owner');
