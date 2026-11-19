-- league_due_view (section 14.6): every active member with a state of late,
-- due or fine, their days late and the strongest live signal. Safe to run
-- again: the view is replaced in place. P-OWNER: the owner only.
--
-- Since 0061 (19 November 2026) also the contact rhythm: the last contact
-- from last_contact_view, every 30, 60 or 90 days, the next contact date
-- (from the last contact, or from the day they joined the list when there is
-- none) and a status: overdue, due (within 7 days) or on_track. Null when
-- the member has no rhythm. Apply views/last_contact_view.sql first.

create or replace view public.league_due_view as
select
  m.id,
  m.person_id,
  p.display_name,
  p.display_title,
  p.display_company,
  m.list_id,
  l.key as list_key,
  l.kind as list_kind,
  m.tier,
  m.last_touch_on,
  m.next_due_on,
  (current_date - m.next_due_on) as days_late,
  case
    when m.next_due_on <= current_date then 'late'
    when m.next_due_on <= current_date + 7 then 'due'
    else 'fine'
  end as state,
  m.missed_cycles,
  (select s.signal_type from public.signals s
   where s.person_id = m.person_id and s.status = 'new'
   order by s.strength desc, s.seen_on desc limit 1) as live_signal,
  m.contact_every_days,
  lc.last_contact_on,
  lc.last_contact_how,
  coalesce(lc.last_contact_on, m.added_on) + m.contact_every_days as next_contact_on,
  case
    when m.contact_every_days is null then null
    when coalesce(lc.last_contact_on, m.added_on) + m.contact_every_days < current_date then 'overdue'
    when coalesce(lc.last_contact_on, m.added_on) + m.contact_every_days <= current_date + 7 then 'due'
    else 'on_track'
  end as contact_status
from public.league_members m
join public.people p on p.id = m.person_id
join public.lists l on l.id = m.list_id
left join lateral (
  select v.last_contact_on, v.last_contact_how from public.last_contact_view v where v.person_id = m.person_id
) lc on true
where m.active and not p.do_not_contact
  and (not is_browser() or app_role() = 'owner');

revoke all on public.league_due_view from anon, authenticated;
grant select on public.league_due_view to authenticated, service_role;
