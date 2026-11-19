-- tasks_view: everything the owner has to do, in one shape, drawn from the
-- tables the agents and triggers already write. Nothing here is typed in by
-- hand. Since 0061 also overdue contact rhythms (kind keep_in_touch), so
-- apply views/last_contact_view.sql and views/league_due_view.sql first. Safe to run again: the view is replaced in place.
--
-- Owner only. The view runs with its owner's rights and checks the caller.
--
-- Columns: task_key (source:id), source, source_id, kind, title, why,
-- person_name, company, due_on, rank, waiting_on, draft, draft_original,
-- subject, channel, message_id, message_state, links, ref_table, ref_id,
-- agent, search_id, created_at, stale, source_url (where it came from), plus the
-- owner's override columns (o_*).

drop view if exists public.tasks_view;
create view public.tasks_view as
with base as (
  -- 1. What the agents and rules raised (8.1), while it is open.
  select
    'inbox_items:' || i.id as task_key, 'inbox_items' as source, i.id as source_id,
    i.type as kind, i.title,
    -- A job lead's why is the post's own words; the agent's bookkeeping goes.
    case when i.type = 'job_lead'
      then nullif(btrim(regexp_replace(coalesce(i.why, ''), '^Reported in the LinkedIn PMM hiring report of [0-9-]+\.\s*(Post:\s*)?', '')), '')
      else i.why end as why,
    coalesce(p.display_name, jl.poster_name) as person_name, i.company,
    -- A lead or a chase is this week's work, not someday's (Jason, 16 Nov
    -- 2026). Job leads go by how recently the role was posted instead
    -- (17 Nov): the newest first, and a fresh one or one that has just
    -- connected is Now.
    case when i.type = 'job_lead' then i.due_on
      when i.type in ('wider_lead', 'ad_chase', 'referral', 'signal') and i.due_on is null
      then (i.created_at at time zone 'Europe/London')::date + 3 else i.due_on end as due_on,
    case
      when i.type = 'job_lead' and jl.id is not null then
        30 + greatest(0, 30 - (current_date - coalesce(jl.posted_on, jl.first_seen_on, (i.created_at at time zone 'Europe/London')::date)))
          + case jl.outreach_stage when 'connected' then 25 when 'replied' then 30 else 0 end
      when i.type in ('job_lead', 'wider_lead', 'ad_chase') then greatest(i.rank, 30) + least(extract(day from now() - i.created_at), 10)
      else i.rank + least(extract(day from now() - i.created_at), 10) end as rank,
    case when i.type = 'job_lead' then
      case jl.outreach_stage
        when 'connection_sent' then coalesce(split_part(jl.poster_name, ' ', 1), 'The poster') || ' to accept'
        when 'messaged' then coalesce(split_part(jl.poster_name, ' ', 1), 'The poster') || ' to reply'
        else case when cm.state in ('queued', 'sending') then 'The LinkedIn sender' end
      end end as waiting_on,
    case when i.type = 'job_lead' and jl.outreach_stage = 'connected' then lm.body
         when i.type = 'job_lead' and cm.id is not null then cm.body
         else i.draft end as draft,
    case when i.type = 'job_lead' and jl.outreach_stage = 'connected' then lm.body
         when i.type = 'job_lead' and cm.id is not null then cm.body
         else i.draft_original end as draft_original,
    null::text as subject,
    case when i.type = 'job_lead' and coalesce(i.source_url, '') ilike '%linkedin.com%' then 'linkedin' end as channel,
    case when i.type = 'job_lead' and jl.outreach_stage = 'connected' then lm.id when i.type = 'job_lead' then cm.id end as message_id,
    case when i.type = 'job_lead' and jl.outreach_stage = 'connected' then lm.state when i.type = 'job_lead' then cm.state end as message_state,
    i.links, i.ref_table, i.ref_id, i.agent, null::uuid as search_id, i.created_at,
    i.status = 'stale' as stale, i.source_url
  from inbox_items i
  left join people p on p.id = i.person_id
  left join job_leads jl on i.ref_table = 'job_leads' and jl.id = i.ref_id
  left join messages cm on cm.id = jl.connect_message_id
  left join messages lm on lm.id = jl.li_message_id
  where i.status in ('new', 'stale') and i.type <> 'auto_sent'

  union all

  -- 2. Follow-ups owed and chases waiting on someone (8.2), with the paired
  --    message where one exists.
  select
    'follow_ups:' || f.id, 'follow_ups', f.id,
    'follow_up', f.person_name || case when f.company is not null then ', ' || f.company else '' end,
    f.reason, f.person_name, f.company,
    f.due_on,
    case when f.due_on < current_date then 40 else 10 end + least(extract(day from now() - f.created_at), 10),
    case
      when f.direction = 'waiting' then 'Their reply'
      when m.state = 'held' then coalesce(m.hold_reason, 'The send engine')
      when c.cv_requested and not c.w_cv then 'A CV from the candidate'
      else null
    end,
    m.body, m.body, m.subject, m.channel, m.id, m.state,
    public.compact_links(
      case when f.source_url is not null then jsonb_build_object('label', 'Open thread', 'url', f.source_url) end,
      case when c.granola_url is not null then jsonb_build_object('label', 'Call notes', 'url', c.granola_url) end,
      case when p.crm_url is not null then jsonb_build_object('label', 'Open in CRM', 'url', p.crm_url) end,
      case when p.linkedin_url is not null then jsonb_build_object('label', 'Profile', 'url', p.linkedin_url) end
    ),
    'follow_ups', f.id, case f.source when 'call' then 'a6_calls' when 'email' then 'a5_followups' when 'manual' then 'manual' else 'system' end,
    f.search_id, f.created_at, false, coalesce(f.source_url, c.granola_url)
  from follow_ups f
  left join messages m on m.id = f.message_id
  left join calls c on c.id = f.call_id
  left join people p on p.id = f.person_id
  where f.status = 'open'

  union all

  -- 3. Today's external calls still to come: prepare for each one (19.1).
  select
    'prepare_call:' || t.id, 'calendar_today', t.id,
    'prepare_call', 'Prepare: ' || t.title,
    case t.call_type
      when 'candidate_screen' then 'Candidate screen. Read the brief and their profile first'
      when 'coaching' then 'Coaching call. The four standing questions, then advice'
      when 'client_update' then 'Client update. Have the stage counts and the next step ready'
      when 'reference' then 'Reference call'
      else 'External call'
    end,
    t.person_name, s.client,
    current_date, 30, null,
    null, null, null, null, null, null,
    public.compact_links(
      case when p.crm_url is not null then jsonb_build_object('label', 'Open in CRM', 'url', p.crm_url) end,
      case when p.linkedin_url is not null then jsonb_build_object('label', 'Profile', 'url', p.linkedin_url) end,
      case when s.crm_url is not null then jsonb_build_object('label', 'Search in CRM', 'url', s.crm_url) end
    ),
    'calendar_today', t.id, 'a5_followups', t.search_id, t.created_at, false, null::text
  from calendar_today t
  left join people p on p.id = t.person_id
  left join searches s on s.id = t.search_id
  where t.is_external and t.starts_at >= now() and public.uk_day(t.starts_at) = current_date
    and not exists (select 1 from calls c where c.calendar_ref = t.event_ref)

  union all

  -- 4. A search going quiet (14.5): cold today, cooling this week.
  select
    'search_health:' || s.id, 'searches', s.id,
    'search_health', s.client || ': ' || s.role, coalesce(s.health_reason, 'Going quiet'), cp.display_name, s.client,
    case when s.health = 'cold' then current_date else public.week_of(now()) + 4 end,
    case when s.health = 'cold' then 50 else 25 end,
    case s.waiting_on when 'client' then 'The client' when 'candidate' then 'A candidate' else null end,
    null, null, null, null, null, null,
    public.compact_links(
      case when s.crm_url is not null then jsonb_build_object('label', 'Search in CRM', 'url', s.crm_url) end,
      case when cp.crm_url is not null then jsonb_build_object('label', 'Client contact in CRM', 'url', cp.crm_url) end
    ),
    'searches', s.id, 'system', s.id, s.updated_at, false, s.crm_url
  from searches s
  left join people cp on cp.id = s.client_contact_id
  where s.status in ('open', 'intake', 'offer') and s.health in ('cooling', 'cold')

  union all

  -- 5. Feedback overdue on a shortlisted candidate (CAN-2, the client nudge rule).
  select
    'feedback_chase:' || c.id, 'search_candidates', c.id,
    'feedback_chase', 'Chase feedback on ' || p.display_name || ' at ' || s.client,
    format('Submitted %s. No feedback after %s working days.', to_char(c.submitted_on, 'FMDay DD Month'), public.working_days(c.submitted_on, current_date)),
    cp.display_name, s.client,
    current_date, 35, 'The client',
    null, null, null, null, null, null,
    public.compact_links(
      case when s.crm_url is not null then jsonb_build_object('label', 'Search in CRM', 'url', s.crm_url) end,
      case when p.crm_url is not null then jsonb_build_object('label', 'Candidate in CRM', 'url', p.crm_url) end
    ),
    'search_candidates', c.id, 'system', s.id, c.updated_at, false, s.crm_url
  from search_candidates c
  join searches s on s.id = c.search_id
  join people p on p.id = c.person_id
  left join people cp on cp.id = s.client_contact_id
  cross join (select feedback_nudge_days from app_settings limit 1) cfg
  where c.stage = 'shortlist' and c.feedback_received_on is null and c.submitted_on is not null
    and public.working_days(c.submitted_on, current_date) >= cfg.feedback_nudge_days

  union all

  -- 6. A call that could not be matched to a search, unless the agent already raised it.
  select
    'call_confirm:' || c.id, 'calls', c.id,
    'call_confirm', 'Which search was ' || coalesce(p.display_name, c.title, 'this call') || ' for?',
    'The call write-up could not tell which search this was. Nothing is written to the CRM until you say.',
    p.display_name, p.display_company,
    c.held_at::date + 1, 35, null,
    null, null, null, null, null, null,
    public.compact_links(
      case when c.granola_url is not null then jsonb_build_object('label', 'Call notes', 'url', c.granola_url) end,
      case when p.crm_url is not null then jsonb_build_object('label', 'Open in CRM', 'url', p.crm_url) end
    ),
    'calls', c.id, 'a6_calls', null, c.created_at, false, c.granola_url
  from calls c
  left join people p on p.id = c.person_id
  where c.search_id is null and c.match_confidence in ('low', 'none') and c.skip_reason is null
    and c.call_type not in ('internal', 'coaching', 'reference', 'other')
    and not exists (select 1 from inbox_items i where i.ref_table = 'calls' and i.ref_id = c.id and i.status in ('new', 'stale'))

  union all

  -- 7. A CV asked for and not yet received. The link is where it will live: the CRM record.
  select
    'cv_chase:' || c.id, 'calls', c.id,
    'cv_chase', 'CV still to come from ' || coalesce(p.display_name, 'the candidate'),
    format('Asked on %s. Needed before they can be put forward.', to_char(c.held_at, 'FMDay DD Month')),
    p.display_name, p.display_company,
    c.held_at::date + 2, 20, 'The candidate',
    null, null, null, null, null, null,
    public.compact_links(
      case when p.crm_url is not null then jsonb_build_object('label', 'Where the CV will be', 'url', p.crm_url) end,
      case when c.granola_url is not null then jsonb_build_object('label', 'Call notes', 'url', c.granola_url) end,
      case when p.linkedin_url is not null then jsonb_build_object('label', 'Profile', 'url', p.linkedin_url) end
    ),
    'calls', c.id, 'a6_calls', c.search_id, c.created_at, false, c.granola_url
  from calls c
  left join people p on p.id = c.person_id
  where c.cv_requested and not c.w_cv

  union all

  -- 8. Content: a draft to approve (unless the agent raised it), a post due.
  select
    'content_approve:' || ci.id, 'content_items', ci.id,
    'content_approve', 'Approve: ' || ci.topic, ci.hook, null, null,
    public.week_of(now()) + 4, ci.rank / 5, null,
    concat_ws(E'\n\n', ci.hook, ci.body, ci.close_line), ci.draft_original, null, 'linkedin', null, null,
    case when ci.data_point_url is not null then jsonb_build_array(jsonb_build_object('label', 'Data point', 'url', ci.data_point_url)) else '[]'::jsonb end,
    'content_items', ci.id, 'a2_content', ci.search_id, ci.created_at, false, ci.data_point_url
  from content_items ci
  where ci.status = 'draft' and ci.format_ok and ci.kind in ('linkedin_post', 'job_post', 'blog')
    and not exists (select 1 from inbox_items i where i.ref_table = 'content_items' and i.ref_id = ci.id and i.status in ('new', 'stale'))

  union all

  select
    'content_post:' || ci.id, 'content_items', ci.id,
    'content_post', 'Post: ' || ci.topic, ci.hook, null, null,
    ci.planned_for, 30, null,
    concat_ws(E'\n\n', ci.hook, ci.body, ci.close_line), ci.draft_original, null, 'linkedin', null, null,
    '[]'::jsonb,
    'content_items', ci.id, 'a2_content', ci.search_id, ci.created_at, false, ci.post_url
  from content_items ci
  where ci.status = 'planned' and ci.planned_for <= current_date and ci.kind in ('linkedin_post', 'job_post', 'blog')

  union all

  -- 9. Someone on a list with a contact rhythm who is overdue (0061, Jason,
  --    19 November 2026). One task per person per cycle: the key carries the
  --    date it fell due, so a bin or a snooze lasts until the next cycle.
  select
    'keep_in_touch:' || d.id || ':' || d.next_contact_on, 'league_members', d.id,
    'keep_in_touch',
    'Get in touch with ' || d.display_name || ': ' || case when d.last_contact_on is null then 'no contact yet'
      else 'last contact ' || to_char(d.last_contact_on, 'FMDD Mon') || ', ' || public.contact_how_word(d.last_contact_how) end,
    format('Every %s days. Due %s.', d.contact_every_days, to_char(d.next_contact_on, 'FMDD Mon')),
    d.display_name, d.display_company,
    d.next_contact_on, 30, null,
    null, null, null, null, null, null,
    public.compact_links(
      case when p.linkedin_url is not null then jsonb_build_object('label', 'Profile', 'url', p.linkedin_url) end,
      case when p.crm_url is not null then jsonb_build_object('label', 'Open in CRM', 'url', p.crm_url) end
    ),
    'people', d.person_id, 'system', null, public.uk_day_start(d.next_contact_on), false, p.linkedin_url
  from league_due_view d
  join people p on p.id = d.person_id
  where d.contact_status = 'overdue'
)
select
  b.*,
  -- The lead behind a job task: dates, the poster, where the outreach stands.
  (select jsonb_build_object(
      'id', jl.id, 'posted_on', jl.posted_on, 'found_on', jl.first_seen_on,
      'poster_name', jl.poster_name, 'poster_title', jl.poster_title, 'profile_url', jl.poster_profile_url,
      'stage', jl.outreach_stage, 'connection_on', jl.outreach_connection_on, 'connected_on', jl.outreach_connected_on,
      'messaged_on', jl.outreach_messaged_on, 'replied_on', jl.outreach_replied_on, 'reply_outcome', jl.reply_outcome,
      'connect_state', cm.state, 'connect_hold', cm.hold_reason, 'connect_after', cm.send_after,
      'campaign', (select jsonb_build_object('name', c.name, 'added_on', c.created_at::date, 'enrolled_on', c.started_on)
                   from campaigns c where c.job_lead_id = jl.id order by c.created_at desc limit 1))
    from job_leads jl left join messages cm on cm.id = jl.connect_message_id
    where b.kind = 'job_lead' and b.ref_table = 'job_leads' and jl.id = b.ref_id) as lead,
  o.title as o_title, o.notes as o_notes, o.due_on as o_due_on, o.sort_order as o_sort_order,
  o.status as o_status, o.snoozed_until as o_snoozed_until
from base b
left join task_overrides o on o.task_key = b.task_key
where (not is_browser() or app_role() = 'owner')
  and coalesce(o.status, 'open') not in ('done', 'binned')
  and (o.status is distinct from 'snoozed' or o.snoozed_until <= current_date);

revoke all on public.tasks_view from anon, authenticated;
grant select on public.tasks_view to authenticated;
