-- The views behind Numbers, Quarter and Review (sections 14.2, 14.4, 14.7,
-- 32.2 and 32.3). Safe to run again: views are replaced in place. Run after
-- kpi_week_view.sql.
--
-- Pattern P-SHARED-RO: owner and reviewer may read the counts; nobody else.

-- This quarter, one row per quarterly target and per output KPI. An output
-- has no target, so target, hit and to_go are null for it. The target is the
-- one valid today, so a target changed mid-quarter judges the whole quarter.
create or replace view public.kpi_quarter_view as
with q as (
  select quarter_of(now()) as quarter
),
kpis (kpi, position) as (
  values
    ('events_held', 1), ('blogs_published', 2), ('testimonials', 3),
    ('client_meetings', 4), ('jobs_won', 5), ('shortlists', 6), ('first_interviews', 7),
    ('offers', 8), ('placements', 9), ('referrals_received', 10), ('leads_passed', 11)
),
counts as (
  select
    kpi,
    quarter,
    sum(amount) as total,
    sum(amount) filter (where is_pmm) as pmm_total,
    bool_or(manual) as has_manual
  from kpi_events
  group by kpi, quarter
)
select
  k.kpi,
  'quarter'::text as period,
  q.quarter,
  k.position,
  coalesce(c.total, 0) as total,
  t.target,
  case when t.target is null then null else coalesce(c.total, 0) >= t.target end as hit,
  case when t.target is null then null else greatest(t.target - coalesce(c.total, 0), 0) end as to_go,
  coalesce(c.pmm_total, 0) as pmm_total,
  case when t.target is null then null else coalesce(c.pmm_total, 0) >= t.target end as pmm_hit,
  coalesce(c.has_manual, false) as has_manual
from q
cross join kpis k
left join lateral (
  select target from targets t
  where t.kpi = k.kpi and t.period = 'quarter'
    and t.valid_from <= current_date
    and (t.valid_to is null or t.valid_to >= current_date)
  order by t.valid_from desc
  limit 1
) t on true
left join counts c on c.kpi = k.kpi and c.quarter = q.quarter
where not is_browser() or app_role() in ('owner', 'reviewer');

-- Output KPIs by week over the last 12 weeks, for the What moved line on the
-- Review page (32.3). Only weeks with something in them appear.
create or replace view public.kpi_output_week_view as
select kpi, week, sum(amount) as total, sum(amount) filter (where is_pmm) as pmm_total
from kpi_events
where kpi in ('client_meetings', 'jobs_won', 'shortlists', 'first_interviews', 'offers', 'placements', 'referrals_received', 'leads_passed')
  and week >= week_of(now()) - interval '11 weeks'
  and (not is_browser() or app_role() in ('owner', 'reviewer'))
group by kpi, week;

-- Follow-ups on time this quarter, N of M (14.7, 32.2).
create or replace view public.followups_quarter_view as
select
  quarter_of(now()) as quarter,
  count(*) as completed,
  count(*) filter (where on_time) as on_time
from public.follow_ups
where status in ('sent', 'done', 'handled_offline')
  and completed_at >= quarter_of(now())
  and (not is_browser() or app_role() in ('owner', 'reviewer'));

-- The BD funnel as plain numbers (14.4): the last 8 weeks of PMM job leads.
create or replace view public.bd_funnel_view as
select
  count(*) filter (where first_seen_on >= current_date - 56) as found,
  count(*) filter (where chased_on >= current_date - 56) as chased,
  count(*) filter (where replied_on >= current_date - 56) as replied,
  count(*) filter (where meeting_on >= current_date - 56) as meetings,
  count(*) filter (where won_on >= current_date - 56) as won
from public.job_leads
where function = 'pmm'
  and (not is_browser() or app_role() in ('owner', 'reviewer'));

revoke all on public.kpi_quarter_view, public.kpi_output_week_view, public.followups_quarter_view, public.bd_funnel_view from anon, authenticated;
grant select on public.kpi_quarter_view, public.kpi_output_week_view, public.followups_quarter_view, public.bd_funnel_view to authenticated;
