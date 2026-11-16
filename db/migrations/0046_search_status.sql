-- 0046 Daily search status from the call agent (Jason, 16 November).
-- search_counts (0033) also carries the search's health, the reason in one
-- line, the next step and its date, so a6_calls in mode `searches` can keep
-- each live search current from email, calendar and call notes every weekday
-- morning. SEA-4 stands: a search at offer is never changed by an agent.

create or replace function public.aw_allowed_fields(p_kind text) returns text[]
language sql immutable as $$
  select case p_kind
    when 'inbox_item' then array['type', 'title', 'why', 'suggested_action', 'draft', 'source', 'source_url', 'links', 'rank', 'company', 'role', 'location', 'person_name']
    when 'job_lead' then array['company', 'role', 'function', 'level', 'location', 'city', 'country', 'source', 'source_url', 'poster_name', 'poster_title', 'poster_profile_url', 'company_size', 'fit_score', 'fit_reason', 'existing_client', 'spec_draft', 'why', 'matched', 'uk_to_us']
    when 'wider_lead' then array['company', 'role', 'function', 'country', 'location', 'source', 'mentioned_by_name', 'existing_client', 'notes', 'why']
    when 'signal' then array['person_name', 'company', 'title', 'city', 'signal_type', 'strength', 'detail', 'source', 'source_url', 'seen_on', 'in_icp', 'draft', 'uk_to_us']
    when 'person' then array['display_name', 'display_title', 'display_company', 'city', 'kind', 'crm', 'crm_ref', 'crm_url', 'linkedin_url', 'email', 'in_crm', 'profile_summary']
    when 'follow_up' then array['person_name', 'company', 'kind', 'reason', 'source', 'source_url', 'direction', 'due_on', 'call_ref', 'thread_ref', 'draft']
    when 'referral' then array['referred_name', 'referred_company', 'referred_title', 'referred_by_name', 'context', 'kind', 'call_ref']
    when 'touch' then array['person_name', 'company', 'touched_on', 'channel', 'kind', 'source', 'source_url', 'note']
    when 'event_idea' then array['title', 'why', 'source', 'source_url']
    when 'kpi_event' then array['kpi', 'source_table', 'source_ref', 'label', 'is_pmm', 'happened_at']
    when 'calendar_today' then array['events', 'from', 'to']
    when 'coaching_answers' then array['person_name', 'held_at', 'q_interviewed_where', 'q_who_else_looking', 'q_how_they_hire', 'q_events_rated', 'advice_given', 'referrals_count', 'leads_count']
    when 'message' then array['type', 'channel', 'person_name', 'company', 'to_name', 'subject', 'body', 'level', 'variables', 'search_id', 'follow_up_id', 'call_id']
    when 'opt_out' then array['person_name', 'company', 'phrase', 'source_url']
    when 'content_draft' then array['kind', 'run_source', 'angle', 'topic', 'hook', 'body', 'close_line', 'hashtags', 'data_point', 'data_point_url', 'prompted_by', 'prompted_by_url']
    when 'outreach_step' then array['lead_id', 'company', 'role', 'step', 'on', 'note', 'outcome']
    when 'call' then array['granola_ref', 'granola_url', 'calendar_ref', 'title', 'held_at', 'minutes', 'call_type', 'person_name', 'company', 'search_client', 'search_role', 'match_confidence', 'w_record', 'w_cv', 'w_note', 'w_on_search', 'w_follow_up', 'cv_requested', 'crm_note_ref', 'is_new_a_star', 'skip_reason']
    when 'search_counts' then array['search_id', 'search_client', 'search_role', 'n_sourced', 'n_spoken', 'n_submitted', 'n_first_stage', 'n_later_stage', 'n_offer', 'last_client_contact_on', 'waiting_on', 'health', 'health_reason', 'next_step', 'next_step_on']
    when 'a_star_suggestion' then array['name', 'title', 'company', 'city', 'linkedin_url', 'why', 'week']
    when 'data_point' then array['statement', 'value', 'as_of', 'category', 'source_name', 'source_url']
    when 'campaign_step' then array['campaign_id', 'step', 'on', 'note', 'outcome', 'crm_ref', 'crm_url']
    else null end
$$;

create or replace function public.aw_search_counts(p_run uuid, p_agent text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s searches%rowtype;
begin
  select * into s from searches where id = aw_find_search(d);
  if s.id is null then return aw_reject('not_found', 'No open search for that client and role.', 'search_client'); end if;
  -- SEA-4: a search at offer is never changed by an agent.
  if s.status = 'offer' then return aw_reject('policy_refused', 'That search is at offer. Counts are left to the owner.', 'search_id'); end if;
  if d ->> 'waiting_on' is not null and d ->> 'waiting_on' not in ('client', 'candidate', 'desk', 'nobody') then return aw_reject('invalid', 'waiting_on is client, candidate, desk or nobody.', 'waiting_on'); end if;
  if d ->> 'health' is not null and d ->> 'health' not in ('warm', 'cooling', 'cold') then return aw_reject('invalid', 'health is warm, cooling or cold.', 'health'); end if;
  if length(coalesce(d ->> 'health_reason', '')) > 280 then return aw_reject('invalid', 'Keep health_reason to one line of 280 characters.', 'health_reason'); end if;
  if length(coalesce(d ->> 'next_step', '')) > 280 then return aw_reject('invalid', 'Keep next_step to one line of 280 characters.', 'next_step'); end if;
  update searches set
    n_sourced = coalesce((d ->> 'n_sourced')::int, n_sourced), n_spoken = coalesce((d ->> 'n_spoken')::int, n_spoken), n_submitted = coalesce((d ->> 'n_submitted')::int, n_submitted),
    n_first_stage = coalesce((d ->> 'n_first_stage')::int, n_first_stage), n_later_stage = coalesce((d ->> 'n_later_stage')::int, n_later_stage), n_offer = coalesce((d ->> 'n_offer')::int, n_offer),
    last_client_contact_on = coalesce((d ->> 'last_client_contact_on')::date, last_client_contact_on), waiting_on = coalesce(d ->> 'waiting_on', waiting_on),
    health = coalesce(d ->> 'health', health), health_reason = coalesce(nullif(d ->> 'health_reason', ''), health_reason),
    next_step = coalesce(nullif(d ->> 'next_step', ''), next_step), next_step_on = coalesce((d ->> 'next_step_on')::date, next_step_on),
    counts_refreshed_at = now()
  where id = s.id;
  return jsonb_build_object('outcome', 'merged', 'id', s.id);
end $$;
revoke execute on function public.aw_search_counts(uuid, text, jsonb) from public, anon, authenticated;
