-- 0017 Explicit grants.
--
-- Earlier migrations assumed Supabase gives the API roles every privilege on
-- a new table and only took away what each table should not allow. Newer
-- projects may not give those privileges at all. This file states exactly
-- what each role may do, so the result is the same either way. Row-level
-- security still decides which rows, on every table.

grant usage on schema public to authenticated, service_role;

-- Server functions: everything. Never exposed to a browser.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- P-OWNER: select, insert, update. Never delete.
grant select, insert, update on
  public.inbox_items, public.follow_ups, public.messages, public.people,
  public.do_not_contact, public.calendar_today
  to authenticated;

-- P-OWNER-RO: select only.
grant select on public.send_log, public.audit_log, public.agent_runs to authenticated;

-- kpi_events: read, and insert manual corrections (the policy checks manual).
grant select, insert on public.kpi_events to authenticated;

-- P-SHARED-RO: the policies limit writes to the owner.
grant select, insert, update on public.targets, public.weekly_reviews to authenticated;

-- P-SETTINGS: select and update. Rows are added by migration only.
grant select, update on public.app_settings, public.send_policies, public.shared_blocks to authenticated;
grant select, insert, update on public.agent_prompts to authenticated;
-- agents: column grants were made in 0005 and leave key_hash out.

-- Sign-in tables: read only.
grant select on public.app_users, public.allowed_emails to authenticated;

-- Helper functions that policies, checks and views call as the signed-in user.
grant execute on function
  public.app_role(), public.is_browser(), public.week_of(timestamptz),
  public.quarter_of(timestamptz), public.working_days(date, date),
  public.send_level_rank(text), public.audit_sign_out()
  to authenticated;
