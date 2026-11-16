-- tasks_view: everything the owner has to do, in one shape, drawn from the
-- tables the agents and triggers already write. Nothing here is typed in by
-- hand. Safe to run again: the view is replaced in place.
--
-- Owner only. The view runs with its owner's rights and checks the caller.
--
-- Columns: task_key (source:id), source, source_id, kind, title, why,
-- person_name, company, due_on, rank, waiting_on, draft, draft_original,
-- subject, channel, message_id, message_state, links, ref_table, ref_id,
-- agent, search_id, created_at, stale, plus the owner's override columns (o_*).

create or replace view public.tasks_view as
with base as (
  -- 1. What the agents and rules raised (8.1), while it is open.
  select
    'inbox_items:' || i.id as task_key, 'inbox_items' as source, i.id as source_id,
    i.type as kind, i.title, i.why, p.display_name as person_name, i.company,
    i.due_on, i.rank + least(extract(day from now() - i.created_at), 10) as rank,
    null::text as waiting_on,
    i.draft, i.draft_original, null::text as subject, null::text as channel, null::uuid as message_id, null::text as message_state,
    i.links, i.ref_table, i.ref_id, i.agent, null::uuid as search_id, i.created_at,
    i.status = 'stale' as stale
  from inbox_items i
  left join people p on p.id = i.person_id
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
    f.search_id, f.created_at, false
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
    'calendar_today', t.id, 'a5_followups', t.search_id, t.created_at, false
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
    'searches', s.id, 'system', s.id, s.updated_at, false
  from searches s
  left join people cp on cp.id = s.client_contact_id
  where s.status in ('open', 'intake', 'offer') and s.health in ('cooling', 'cold')

  union all

  -- 5. Feedback overdue on a submitted candidate (CAN-2, the client nudge rule).
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
    'search_candidates', c.id, 'system', s.id, c.updated_at, false
  from search_candidates c
  join searches s on s.id = c.search_id
  join people p on p.id = c.person_id
  left join people cp on cp.id = s.client_contact_id
  cross join (select feedback_nudge_days from app_settings limit 1) cfg
  where c.stage = 'submitted' and c.feedback_received_on is null and c.submitted_on is not null
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
    'calls', c.id, 'a6_calls', null, c.created_at, false
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
    'calls', c.id, 'a6_calls', c.search_id, c.created_at, false
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
    'content_items', ci.id, 'a2_content', ci.search_id, ci.created_at, false
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
    'content_items', ci.id, 'a2_content', ci.search_id, ci.created_at, false
  from content_items ci
  where ci.status = 'planned' and ci.planned_for <= current_date and ci.kind in ('linkedin_post', 'job_post', 'blog')
)
select
  b.*,
  o.title as o_title, o.notes as o_notes, o.due_on as o_due_on, o.sort_order as o_sort_order,
  o.status as o_status, o.snoozed_until as o_snoozed_until
from base b
left join task_overrides o on o.task_key = b.task_key
where (not is_browser() or app_role() = 'owner')
  and coalesce(o.status, 'open') not in ('done', 'binned')
  and (o.status is distinct from 'snoozed' or o.snoozed_until <= current_date);

revoke all on public.tasks_view from anon, authenticated;
grant select on public.tasks_view to authenticated;
