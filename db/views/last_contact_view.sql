-- last_contact_view (Jason, 19 November 2026): each person's latest contact
-- from every source RecOS has, and how it was made. Safe to run again: the
-- view is replaced in place. P-OWNER: the owner only.
--
--   touches              the channel and kind of the touch
--   calls                held_at, from the Granola write-up (not internal calls)
--   messages sent        email, LinkedIn message, or LinkedIn request for a connection note
--   LinkedIn outreach    a job lead's connection request, message or reply, on the poster
--   follow-ups done      sent, done or handled; by the paired message's channel
--
-- how is one of call, email, linkedin_message, linkedin_request, meeting,
-- event, other. On the same day a call beats a meeting, a meeting an email,
-- and so on. Read it for a few people at a time (where person_id = ...).

create or replace view public.last_contact_view as
select distinct on (c.person_id)
  c.person_id,
  c.on_date as last_contact_on,
  c.how as last_contact_how
from (
  select t.person_id, t.touched_on as on_date,
    case
      when t.kind = 'call' or t.channel = 'phone' then 'call'
      when t.kind in ('meeting', 'coaching') or t.channel = 'meeting' then 'meeting'
      when t.kind in ('event_attended', 'event_invite') or t.channel = 'event' then 'event'
      when t.channel = 'email' then 'email'
      when t.channel = 'linkedin' then 'linkedin_message'
      else 'other'
    end as how
  from public.touches t

  union all

  select k.person_id, public.uk_day(k.held_at), 'call'
  from public.calls k
  where k.person_id is not null and k.call_type <> 'internal'

  union all

  select m.person_id, public.uk_day(m.sent_at),
    case when m.channel = 'email' then 'email' when m.type = 'linkedin_connect' then 'linkedin_request' else 'linkedin_message' end
  from public.messages m
  where m.person_id is not null and m.state = 'sent' and m.sent_at is not null

  union all

  select l.hiring_manager_id, s.on_date, s.how
  from public.job_leads l
  cross join lateral (values
    (l.outreach_connection_on, 'linkedin_request'),
    (l.outreach_messaged_on, 'linkedin_message'),
    (l.outreach_replied_on, 'linkedin_message')) as s (on_date, how)
  where l.hiring_manager_id is not null and s.on_date is not null

  union all

  select f.person_id, public.uk_day(coalesce(f.completed_at, f.updated_at)),
    case fm.channel when 'email' then 'email' when 'linkedin' then 'linkedin_message' else 'other' end
  from public.follow_ups f
  left join public.messages fm on fm.id = f.message_id
  where f.person_id is not null and f.status in ('sent', 'done', 'handled_offline')
) c
where c.on_date is not null and c.on_date <= current_date
  and (not public.is_browser() or public.app_role() = 'owner')
order by c.person_id, c.on_date desc,
  case c.how when 'call' then 1 when 'meeting' then 2 when 'event' then 3 when 'email' then 4
    when 'linkedin_message' then 5 when 'linkedin_request' then 6 else 7 end;

revoke all on public.last_contact_view from anon, authenticated;
grant select on public.last_contact_view to authenticated, service_role;
