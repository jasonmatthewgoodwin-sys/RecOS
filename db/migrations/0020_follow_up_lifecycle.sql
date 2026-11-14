-- 0020 Follow-up lifecycle (section 21.2, FUP-1 to FUP-4, 22.1 and 34.5).
-- Ticket P1-30.
--
-- open --approve/send--> sent
-- open --mark done-----> done
-- open --handled offline-> handled_offline
-- open --snooze--------> snoozed --date arrives--> open
-- open --close---------> closed (deliberately no action)
--
-- Pairing with messages (21.3) needs templates (P1-29) and the send engine
-- (P1-26), so it arrives with them. FUP-4 (a league_cadence follow-up closed
-- with no action counts as a missed cycle) arrives with league_members.

-- A snoozed follow-up says until when.
alter table public.follow_ups
  add constraint follow_ups_snoozed_needs_date check (status <> 'snoozed' or snoozed_until is not null);

-- FUP-2: completing sets completed_at and on_time. Section 34.5: the row is
-- deleted 12 months after completion. Reopening clears all three, so a
-- follow-up put back by Undo looks as it did. Snoozing keeps the due date:
-- the nightly job (P1-47) reopens it when the date arrives.
create function public.follow_ups_lifecycle() returns trigger
language plpgsql as $$
declare
  finished boolean := new.status in ('sent', 'done', 'handled_offline', 'closed');
  was_finished boolean := old.status in ('sent', 'done', 'handled_offline', 'closed');
begin
  if new.status is distinct from old.status then
    if finished then
      new.completed_at := coalesce(new.completed_at, now());
      new.on_time := (new.completed_at at time zone 'Europe/London')::date <= new.due_on;
      new.purge_after := (new.completed_at + interval '12 months')::date;
    elsif was_finished then
      new.completed_at := null;
      new.on_time := null;
      new.purge_after := null;
    end if;
    if new.status <> 'snoozed' then
      new.snoozed_until := null;
    end if;
  end if;
  return new;
end $$;

create trigger t_lifecycle before update on public.follow_ups
  for each row execute function public.follow_ups_lifecycle();

-- followups_on_time: a follow-up completes on time (22.1). Once per row,
-- however often it is reopened and completed again. The label names the
-- kind, never the person (KPI-4). A closed one took no action, so it does
-- not count.
create function public.kpi_on_follow_up() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('sent', 'done', 'handled_offline') and new.on_time
     and old.status not in ('sent', 'done', 'handled_offline') then
    insert into kpi_events (owner_id, kpi, happened_at, source_table, source_id, label, is_pmm)
    values (new.owner_id, 'followups_on_time', new.completed_at, 'follow_ups', new.id,
      format('Follow-up on time: %s', replace(new.kind, '_', ' ')), true)
    on conflict (kpi, source_table, source_id) do nothing;
  end if;
  return new;
end $$;

create trigger t_kpi after update of status on public.follow_ups
  for each row execute function public.kpi_on_follow_up();

-- Section 14.7: on-time follow-ups by week, for the Numbers tab.
create or replace view public.followups_week_view as
select
  week_of(completed_at) as week,
  count(*) as completed,
  count(*) filter (where on_time) as on_time
from public.follow_ups
where status in ('sent', 'done', 'handled_offline')
  and (not is_browser() or app_role() in ('owner', 'reviewer'))
group by 1;

revoke all on public.followups_week_view from anon, authenticated;
grant select on public.followups_week_view to authenticated, service_role;
