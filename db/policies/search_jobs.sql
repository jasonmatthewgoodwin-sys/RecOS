-- Row-level security for search_jobs (docs/new-search-split.md, 0048).
-- Pattern P-OWNER, read only: the owner reads his jobs. Nothing in the browser writes: rows are added
-- by request_search_job, claimed by the research run and closed by the
-- search_result write kind. No insert, update or delete policy.
-- Safe to run again: the policy is dropped and recreated.

alter table public.search_jobs enable row level security;

drop policy if exists search_jobs_owner_select on public.search_jobs;
create policy search_jobs_owner_select on public.search_jobs
  for select to authenticated
  using (app_role() = 'owner');
