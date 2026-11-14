-- Row-level security for allowed_emails (low-level design section 6). Pattern read only.
-- The owner may read the allow-list. It is changed by migration, and by the reviewer setting.
-- Safe to run again: each policy is dropped and recreated.

alter table public.allowed_emails enable row level security;

drop policy if exists allowed_emails_owner_select on public.allowed_emails;
create policy allowed_emails_owner_select on public.allowed_emails
  for select to authenticated
  using (app_role() = 'owner');
