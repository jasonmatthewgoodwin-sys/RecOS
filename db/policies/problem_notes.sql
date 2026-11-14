-- Row-level security for problem_notes (low-level design section 6). Pattern P-OWNER-APPEND.
-- Owner may select and insert. Notes are never edited or deleted.
-- Safe to run again: each policy is dropped and recreated.

alter table public.problem_notes enable row level security;

drop policy if exists problem_notes_owner_select on public.problem_notes;
create policy problem_notes_owner_select on public.problem_notes
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists problem_notes_owner_insert on public.problem_notes;
create policy problem_notes_owner_insert on public.problem_notes
  for insert to authenticated
  with check (app_role() = 'owner');
