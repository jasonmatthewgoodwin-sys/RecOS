-- The weekly health line on the Review page (33.7), for the owner only:
-- System: 11 runs, 0 failed, 63 items, 14 sent for you. When a run failed
-- the line names the agent and the day. Safe to run again.

create or replace view public.system_week_view as
with runs as (
  select
    week_of(started_at) as week,
    count(*) as runs,
    count(*) filter (where status in ('failed', 'timed_out')) as failed,
    coalesce(sum(items_created), 0) as items,
    string_agg(
      format('%s on %s', a.name, to_char(r.started_at at time zone 'Europe/London', 'FMDay')),
      ', ' order by r.started_at) filter (where r.status in ('failed', 'timed_out')) as failed_detail
  from agent_runs r
  join agents a on a.code = r.agent
  where started_at >= week_of(now()) - interval '11 weeks'
  group by 1
),
sent as (
  select week_of(logged_at) as week, count(*) as sent
  from send_log
  where outcome = 'sent' and level = 'automatic' and logged_at >= week_of(now()) - interval '11 weeks'
  group by 1
)
select
  coalesce(r.week, s.week) as week,
  coalesce(r.runs, 0) as runs,
  coalesce(r.failed, 0) as failed,
  coalesce(r.items, 0) as items,
  coalesce(s.sent, 0) as sent,
  r.failed_detail
from runs r
full join sent s on s.week = r.week
where not is_browser() or app_role() = 'owner';

revoke all on public.system_week_view from anon, authenticated;
grant select on public.system_week_view to authenticated;
