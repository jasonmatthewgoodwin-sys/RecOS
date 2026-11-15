-- Row-level security for a_star_suggestions (low-level design section 6). Pattern P-OWNER-READ.
-- Owner may select. The jobs agent writes through agent-write; the verdict goes through a_star_verdict.
-- Safe to run again: each policy is dropped and recreated.

alter table public.a_star_suggestions enable row level security;

drop policy if exists a_star_suggestions_owner_select on public.a_star_suggestions;
create policy a_star_suggestions_owner_select on public.a_star_suggestions
  for select to authenticated
  using (app_role() = 'owner');
