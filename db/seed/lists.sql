-- The two first lists under People (docs/decisions.md, 14 November 2026):
-- Senior network, people who are or could be hiring managers (the design's
-- leader half), and Top candidates, A-grade people placeable widely (the
-- a_star half). Fifty seats each. Run once per environment after the
-- owner has signed in, because each row belongs to the owner. Safe to run
-- again: it does nothing if lists exist.

insert into public.lists (owner_id, key, name, kind, seats, position)
select o.id, l.key, l.name, l.kind, 50, l.position
from (select id from public.app_users where role = 'owner' order by created_at limit 1) o
cross join (values
  ('senior_network', 'Senior network', 'leader', 1),
  ('top_candidates', 'Top candidates', 'a_star', 2)
) as l (key, name, kind, position)
where not exists (select 1 from public.lists);
