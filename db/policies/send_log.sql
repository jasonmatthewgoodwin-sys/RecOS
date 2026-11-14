-- Row-level security for send_log (low-level design section 6). Pattern P-OWNER-RO.
-- Owner may select only. Rows are written by the service role and by triggers.
-- Safe to run again: each policy is dropped and recreated.

alter table public.send_log enable row level security;

drop policy if exists send_log_owner_select on public.send_log;
create policy send_log_owner_select on public.send_log
  for select to authenticated
  using (app_role() = 'owner');
