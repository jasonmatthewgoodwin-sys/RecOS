-- kpi_week_view (section 14.2) and kpi_this_week, the view behind Home's
-- fourth number. Safe to run again: views are replaced in place.
--
-- Pattern P-SHARED-RO: owner and reviewer may read the counts. The reviewer
-- never reads the rows in kpi_events behind them, so these views run with the
-- view owner's rights and check the caller's role themselves.

create or replace view public.kpi_week_view as
with weeks as (
  select generate_series(
    week_of(now()) - interval '11 weeks', week_of(now()), interval '1 week')::date as week
),
counts as (
  select kpi, week, sum(amount) as total
  from kpi_events
  group by kpi, week
)
select
  t.kpi,
  'week'::text as period,
  w.week,
  coalesce(c.total, 0) as total,
  t.target,
  coalesce(c.total, 0) >= t.target as hit,
  greatest(t.target - coalesce(c.total, 0), 0) as to_go
from weeks w
join targets t
  on t.period = 'week'
  and t.valid_from <= w.week
  and (t.valid_to is null or t.valid_to >= w.week)
left join counts c on c.kpi = t.kpi and c.week = w.week
where not is_browser() or app_role() in ('owner', 'reviewer');

create or replace view public.kpi_this_week as
select kpi, total, target, hit, to_go
from public.kpi_week_view
where week = week_of(now()) and period = 'week';

revoke all on public.kpi_week_view, public.kpi_this_week from anon, authenticated;
grant select on public.kpi_week_view, public.kpi_this_week to authenticated;
