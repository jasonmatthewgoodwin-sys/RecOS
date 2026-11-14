-- Row-level security for league_history (low-level design section 6). Pattern P-OWNER-RO.
-- Owner may select only. Rows are written by the service role and by triggers.
-- Safe to run again: each policy is dropped and recreated.

alter table public.league_history enable row level security;

drop policy if exists league_history_owner_select on public.league_history;
create policy league_history_owner_select on public.league_history
  for select to authenticated
  using (app_role() = 'owner');
