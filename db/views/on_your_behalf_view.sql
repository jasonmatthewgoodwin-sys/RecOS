-- Everything that reached a person on the owner's behalf, newest first
-- (Jason, 17 November 2026: an audit log of who the agents reached out to,
-- whether it was automatic, and when it started). One row per event:
--   - the send log: emails and LinkedIn requests and messages, queued, sent,
--     held, failed or cancelled, with the level that decided it;
--   - LinkedIn acceptances the LinkedIn sender saw;
--   - campaigns: added by the owner, enrolled in Spott by the campaign runner.
-- Names and links only. Owner only. Safe to run again.

drop function if exists public.on_your_behalf(text, int);
drop view if exists public.on_your_behalf_view;

create view public.on_your_behalf_view as
select
  'send_log:' || l.id as key,
  l.logged_at as at,
  case when l.channel = 'linkedin' then 'linkedin' else 'email' end as area,
  coalesce(p.label, l.type) as what,
  l.type,
  l.to_name,
  l.outcome,
  case when l.level = 'automatic' then 'auto' else 'you' end as how,
  coalesce(m.created_by, 'engine') as by,
  l.detail,
  m.to_profile_url as link
from send_log l
left join messages m on m.id = l.message_id
left join send_policies p on p.type = l.type
where l.outcome <> 'skipped'

union all

select
  'audit:' || a.id, a.at, 'linkedin',
  case a.action when 'linkedin connected' then 'Accepted your request' else 'Request withdrawn or profile gone' end,
  'linkedin_connect',
  coalesce(a.detail ->> 'name', 'Someone'),
  case a.action when 'linkedin connected' then 'accepted' else 'gone' end,
  'auto', 'sender',
  a.detail ->> 'company',
  (select poster_profile_url from job_leads where id = a.target_id)
from audit_log a
where a.action in ('linkedin connected', 'linkedin request gone')

union all

select
  'campaign:' || c.id, c.created_at, 'campaign', 'Added to a campaign', 'campaign',
  c.name, 'added', 'you', 'owner', c.tool, c.crm_url
from campaigns c

union all

select
  'campaign_start:' || c.id, c.started_on::timestamptz, 'campaign', 'Enrolled in Spott', 'campaign',
  c.name, 'enrolled', 'auto', 'a8_campaigns', null, c.crm_url
from campaigns c
where c.started_on is not null;

-- No browser role reads the view itself. The owner reads it through the
-- function below; everyone else gets nothing.
revoke all on public.on_your_behalf_view from anon, authenticated;

create function public.on_your_behalf(p_area text default null, p_limit int default 200) returns setof public.on_your_behalf_view
language sql stable security definer set search_path = public as $$
  select * from on_your_behalf_view
  where app_role() = 'owner' and (p_area is null or area = p_area or (p_area = 'leads' and area in ('linkedin', 'campaign')))
  order by at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;
revoke execute on function public.on_your_behalf(text, int) from public, anon;
grant execute on function public.on_your_behalf(text, int) to authenticated;
