-- 0029 Problem reports (the bug handover of 14 November 2026, in RecOS terms,
-- Pending Jason in docs/decisions.md): a report raised from any page through
-- the flag at the top right of the tabs, queued as a ticket with a plain
-- reference, worked and closed under Settings. Notes attach as they are
-- investigated. Nothing leaves RecOS and nothing is sent.

create table public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  -- The reference shown as BUG-12. Sequential, never reused.
  ref int generated always as identity,
  title text,
  description text not null check (length(btrim(description)) > 0),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved', 'closed', 'wont_fix')),
  reporter_name text,
  assignee text,
  -- Captured by the app, not typed: where, on what, how big, which build.
  route text,
  user_agent text,
  viewport text,
  app_version text,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index problem_reports_ref on public.problem_reports (ref);
create index problem_reports_status on public.problem_reports (status, created_at desc);

create table public.problem_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  report_id uuid not null references public.problem_reports (id),
  author text,
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index problem_notes_report on public.problem_notes (report_id, created_at);

create trigger t_own before insert on public.problem_reports for each row execute function public.set_owner();
create trigger t_upd before update on public.problem_reports for each row execute function public.set_updated_at();
create trigger t_own before insert on public.problem_notes for each row execute function public.set_owner();

-- Resolved, closed and won't fix stamp the time; back to new or in progress clears it.
create function public.problem_reports_resolved() returns trigger
language plpgsql as $$
begin
  if new.status in ('resolved', 'closed', 'wont_fix') then
    if old.status not in ('resolved', 'closed', 'wont_fix') or new.resolved_at is null then new.resolved_at := now(); end if;
  else
    new.resolved_at := null;
  end if;
  return new;
end $$;
create trigger t_resolved before update on public.problem_reports for each row execute function public.problem_reports_resolved();

revoke all on public.problem_reports, public.problem_notes from anon;
revoke delete, truncate, references, trigger on public.problem_reports, public.problem_notes from authenticated;
revoke update on public.problem_notes from authenticated;
grant select, insert, update on public.problem_reports to authenticated;
grant select, insert on public.problem_notes to authenticated;
