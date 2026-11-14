-- 0019 KPI triggers for the business-development tables (section 22.1 and
-- 22.2): posts_chased, coaching_calls, referrals_received, leads_passed.
-- Ticket P1-19.
--
-- Each fires once per source row however often the stage moves back and
-- forward: kpi_events is unique on (kpi, source_table, source_id) and the
-- insert says "on conflict do nothing". Labels name a company and a role only,
-- never a person (KPI-4).
--
-- The functions run with the definer's rights because the owner's own insert
-- policy on kpi_events allows manual corrections only (KPI-1). The browser
-- cannot call them: they are trigger functions and return trigger.

-- posts_chased: a job lead first moves from new to chased (JOB-1).
create function public.kpi_on_job_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 'chased' and old.stage = 'new' then
    insert into kpi_events (owner_id, kpi, source_table, source_id, label, is_pmm)
    values (new.owner_id, 'posts_chased', 'job_leads', new.id,
      format('Chased: %s at %s', new.role, new.company),
      new.function = 'pmm')
    on conflict (kpi, source_table, source_id) do nothing;
  end if;
  return new;
end $$;

create trigger t_kpi after update of stage on public.job_leads
  for each row execute function public.kpi_on_job_lead();

-- coaching_calls: a session is set to held (COA-2).
create function public.kpi_on_coaching_session() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'held' and (tg_op = 'INSERT' or old.status is distinct from 'held') then
    insert into kpi_events (owner_id, kpi, happened_at, source_table, source_id, label, is_pmm)
    values (new.owner_id, 'coaching_calls', coalesce(new.held_at, now()), 'coaching_sessions', new.id,
      'Coaching call held', true)
    on conflict (kpi, source_table, source_id) do nothing;
  end if;
  return new;
end $$;

create trigger t_kpi after insert or update of status on public.coaching_sessions
  for each row execute function public.kpi_on_coaching_session();

-- referrals_received: a referral is inserted (REF-1).
create function public.kpi_on_referral() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into kpi_events (owner_id, kpi, happened_at, source_table, source_id, label, is_pmm)
  values (new.owner_id, 'referrals_received', new.received_on::timestamptz, 'referrals', new.id,
    format('Referral received: %s', new.kind), true)
  on conflict (kpi, source_table, source_id) do nothing;
  return new;
end $$;

create trigger t_kpi after insert on public.referrals
  for each row execute function public.kpi_on_referral();

-- leads_passed: a wider lead moves to passed (WID-1). Wider leads are work for
-- the rest of the business, so the event is PMM only when the role is (22.5).
create function public.kpi_on_wider_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'passed' and old.status is distinct from 'passed' then
    insert into kpi_events (owner_id, kpi, source_table, source_id, label, is_pmm)
    values (new.owner_id, 'leads_passed', 'wider_leads', new.id,
      format('Passed: %s at %s', coalesce(new.role, new.function), new.company),
      new.function = 'pmm')
    on conflict (kpi, source_table, source_id) do nothing;
  end if;
  return new;
end $$;

create trigger t_kpi after update of status on public.wider_leads
  for each row execute function public.kpi_on_wider_lead();
