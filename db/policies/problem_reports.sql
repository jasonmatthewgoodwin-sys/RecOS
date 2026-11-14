-- Row-level security for problem_reports (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.problem_reports enable row level security;

drop policy if exists problem_reports_owner_select on public.problem_reports;
create policy problem_reports_owner_select on public.problem_reports
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists problem_reports_owner_insert on public.problem_reports;
create policy problem_reports_owner_insert on public.problem_reports
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists problem_reports_owner_update on public.problem_reports;
create policy problem_reports_owner_update on public.problem_reports
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');
