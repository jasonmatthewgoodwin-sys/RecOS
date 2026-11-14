-- Row-level security for audit_log (low-level design section 6). Pattern P-OWNER-RO.
-- Owner may select only. Rows are written by the service role and by triggers.
-- Safe to run again: each policy is dropped and recreated.

alter table public.audit_log enable row level security;

drop policy if exists audit_log_owner_select on public.audit_log;
create policy audit_log_owner_select on public.audit_log
  for select to authenticated
  using (app_role() = 'owner');
