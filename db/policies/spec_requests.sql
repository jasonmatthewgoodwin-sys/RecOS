-- Row-level security for spec_requests (0051). Pattern P-OWNER, read only:
-- the owner reads his requests. Nothing in the browser writes: rows are added
-- by request_spec, claimed by the research run and closed by the spec_result
-- write kind. The pasted CV column is not granted to the browser at all.
-- Safe to run again: the policy is dropped and recreated.

alter table public.spec_requests enable row level security;

drop policy if exists spec_requests_owner_select on public.spec_requests;
create policy spec_requests_owner_select on public.spec_requests
  for select to authenticated
  using (app_role() = 'owner');
