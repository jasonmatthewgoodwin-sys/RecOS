-- Row-level security for problem_screenshots (0036, section 6). Pattern P-OWNER-APPEND.
-- Owner may select and insert. Pictures are never edited or deleted from the browser.
-- Safe to run again: each policy is dropped and recreated.

alter table public.problem_screenshots enable row level security;

drop policy if exists problem_screenshots_owner_select on public.problem_screenshots;
create policy problem_screenshots_owner_select on public.problem_screenshots
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists problem_screenshots_owner_insert on public.problem_screenshots;
create policy problem_screenshots_owner_insert on public.problem_screenshots
  for insert to authenticated
  with check (app_role() = 'owner');
