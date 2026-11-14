-- kpi_week_view (section 14.2), kpi_this_week (the view behind Home's fourth
-- number) and kpi_streak_view (section 14.3, the sentence instead of a trend
-- chart). Safe to run again: views are replaced in place.
--
-- Pattern P-SHARED-RO: owner and reviewer may read the counts. The reviewer
-- never reads the rows in kpi_events behind them, so these views run with the
-- view owner's rights and check the caller's role themselves.
--
-- Every KPI carries two figures (22.5): the PMM total, which the desk's targets
-- are set against and which Numbers shows by default, and the total of all
-- work, shown when the All work switch is on. has_manual is true when a
-- correction typed by the owner is part of the week (22.4): the screen shows
-- a small m after the number.

create or replace view public.kpi_week_view as
with weeks as (
  select generate_series(
    week_of(now()) - interval '11 weeks', week_of(now()), interval '1 week')::date as week
),
counts as (
  select
    kpi,
    week,
    sum(amount) as total,
    sum(amount) filter (where is_pmm) as pmm_total,
    bool_or(manual) as has_manual
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
  greatest(t.target - coalesce(c.total, 0), 0) as to_go,
  coalesce(c.pmm_total, 0) as pmm_total,
  coalesce(c.pmm_total, 0) >= t.target as pmm_hit,
  greatest(t.target - coalesce(c.pmm_total, 0), 0) as pmm_to_go,
  coalesce(c.has_manual, false) as has_manual
from weeks w
join targets t
  on t.period = 'week'
  and t.valid_from <= w.week
  and (t.valid_to is null or t.valid_to >= w.week)
left join counts c on c.kpi = t.kpi and c.week = w.week
where not is_browser() or app_role() in ('owner', 'reviewer');

create or replace view public.kpi_this_week as
select kpi, total, target, hit, to_go, pmm_total, pmm_hit, pmm_to_go, has_manual
from public.kpi_week_view
where week = week_of(now()) and period = 'week';

-- One row per weekly KPI with the parts of the sentence (14.3). The current
-- week is left out of the history, since it is still being played.
create or replace view public.kpi_streak_view as
select
  kpi,
  (count(*) filter (where week < week_of(now())))::int as weeks_history,
  min(week) as first_week,
  (count(*) filter (where hit and week >= week_of(now()) - interval '4 weeks' and week < week_of(now())))::int as hit_last_4,
  (count(*) filter (where pmm_hit and week >= week_of(now()) - interval '4 weeks' and week < week_of(now())))::int as pmm_hit_last_4,
  round(avg(total) filter (where week < week_of(now())), 1) as avg_12,
  max(total) as best_12,
  round(avg(pmm_total) filter (where week < week_of(now())), 1) as pmm_avg_12,
  max(pmm_total) as pmm_best_12
from public.kpi_week_view
where period = 'week'
group by kpi;

revoke all on public.kpi_week_view, public.kpi_this_week, public.kpi_streak_view from anon, authenticated;
grant select on public.kpi_week_view, public.kpi_this_week, public.kpi_streak_view to authenticated;
