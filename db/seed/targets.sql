-- Targets (section 13.2), valid from 9 November 2026. Run once per
-- environment after the owner has signed in for the first time, because each
-- row belongs to the owner. Safe to run again: it does nothing if targets exist.

insert into public.targets (owner_id, kpi, period, target, valid_from)
select o.id, t.kpi, t.period, t.target, date '2026-11-09'
from (select id from public.app_users where role = 'owner' order by created_at limit 1) o
cross join (values
  ('posts_chased',    'week',    20),
  ('coaching_calls',  'week',    5),
  ('linkedin_posts',  'week',    2),
  ('new_a_star',      'week',    5),
  ('events_held',     'quarter', 1),
  ('blogs_published', 'quarter', 3),
  ('testimonials',    'quarter', 3)
) as t (kpi, period, target)
where not exists (select 1 from public.targets);
