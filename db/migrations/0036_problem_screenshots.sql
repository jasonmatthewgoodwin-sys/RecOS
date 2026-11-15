-- 0036 Screenshots on problem reports (Mia, 15 November 2026)
--
-- The report window loses its two small fields (In a few words, How bad)
-- and gains a place to paste or attach a picture. The picture is shrunk
-- in the browser and stored here as a data URL, at most 3 per report and
-- 1.5 MB each, so nothing leaves the project and no file store is needed.
-- Severity stays on the report with its default; the owner sets it in
-- Settings, Problems if it matters.

create table public.problem_screenshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  report_id uuid not null references public.problem_reports (id),
  data text not null check (data like 'data:image/%' and length(data) <= 1500000),
  bytes int not null default 0,
  created_at timestamptz not null default now()
);
create index problem_screenshots_report on public.problem_screenshots (report_id, created_at);

create trigger t_own before insert on public.problem_screenshots for each row execute function public.set_owner();

-- At most three pictures on one report.
create function public.problem_screenshots_cap() returns trigger
language plpgsql as $$
begin
  if (select count(*) from problem_screenshots where report_id = new.report_id) >= 3 then
    raise exception 'limit: Three pictures at most on one report';
  end if;
  new.bytes := length(new.data);
  return new;
end $$;
create trigger t_cap before insert on public.problem_screenshots for each row execute function public.problem_screenshots_cap();

revoke all on public.problem_screenshots from anon;
grant select, insert on public.problem_screenshots to authenticated;
revoke update, delete, truncate on public.problem_screenshots from authenticated;
