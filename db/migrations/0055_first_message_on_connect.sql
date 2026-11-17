-- 0055 The first LinkedIn message is drafted however a lead becomes
-- connected (17 November 2026). 0054 drafted it only when the LinkedIn
-- sender reported an acceptance; a lead marked Connected by hand in Leads got
-- none. Now a trigger on the stage drafts it, and the leads already connected
-- get theirs once.

create function public.lead_draft_first_message(p_lead uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  l job_leads%rowtype;
  mid uuid;
begin
  select * into l from job_leads where id = p_lead for update;
  if l.id is null or l.li_message_id is not null or l.hiring_manager_id is null then return; end if;
  insert into messages (owner_id, type, channel, person_id, to_name, to_profile_url, body, created_by, level_at_creation, state)
  values (l.owner_id, 'linkedin_message', 'linkedin', l.hiring_manager_id, coalesce(l.poster_name, 'The poster'), l.poster_profile_url,
    lead_first_message(l), 'system', 'draft_only', 'draft')
  returning id into mid;
  update job_leads set li_message_id = mid, first_message = coalesce(first_message, lead_first_message(l)) where id = l.id;
end $$;
revoke execute on function public.lead_draft_first_message(uuid) from public, anon, authenticated;

create function public.job_leads_first_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.outreach_stage = 'connected' and old.outreach_stage is distinct from 'connected' and new.li_message_id is null then
    perform lead_draft_first_message(new.id);
  end if;
  return null;
end $$;
create trigger t_first_message after update of outreach_stage on public.job_leads
  for each row execute function public.job_leads_first_message();

-- The sender's acceptance now only moves the stage; the trigger drafts.
create or replace function public.lead_on_connected(p_lead uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  l job_leads%rowtype;
begin
  select * into l from job_leads where id = p_lead;
  if l.id is null then return; end if;
  if l.outreach_stage in ('found', 'connection_sent') then
    update job_leads set outreach_stage = 'connected' where id = l.id;
  else
    perform lead_draft_first_message(l.id);
  end if;
  -- A task already done comes back: there is a message to send now.
  update inbox_items set status = 'new', actioned_at = null, closed_at = null, purge_after = null
  where ref_table = 'job_leads' and ref_id = l.id and type = 'job_lead' and status = 'done';
end $$;

grant execute on function public.lead_draft_first_message(uuid), public.lead_on_connected(uuid) to service_role;

-- Leads already connected, once.
do $$
declare
  r record;
begin
  for r in select id from job_leads where outreach_stage = 'connected' and li_message_id is null loop
    perform lead_draft_first_message(r.id);
  end loop;
end $$;
