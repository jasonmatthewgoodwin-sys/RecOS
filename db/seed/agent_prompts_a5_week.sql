-- A5 calendar mode reads seven days (0045). Run once in the SQL editor, after
-- migration 0045 is applied (the agent may not send from and to before it).
--
-- The calendar mode is not one paragraph in the A5 prompt: it is four lines
-- (the mode list, Read, Write and Finish). This file takes the live active
-- a5_followups version, swaps exactly those four lines for the seven-day
-- wording in db/seed/agent_prompts.sql, and stores the result as a new active
-- version, so the old one stays in Settings, Agents as history and can be
-- made active again. Everything else in the body, and any edit the owner has
-- made in Settings, is kept as it is.
--
-- If any of the four old lines is not in the live body (it was edited by
-- hand), nothing changes and the run stops with an error naming the line.
-- Running it again after it has worked does nothing.

begin;

do $$
declare
  cur public.agent_prompts;
  body text;
  swaps text[][] := array[
    array['- calendar (weekdays 08:45): today''s calendar cache only.',
          '- calendar (weekdays 08:45): the calendar cache for today and the next six days only.'],
    array['calendar: today''s events in the Outlook calendar, UK time.',
          'calendar: every event in the Outlook calendar from today 00:00 to 23:59 on today+6 (seven days), UK time. Page until the whole window is read; an event over several days goes on the day it starts. If the calendar cannot be read: finish failed with that error and write nothing, so the days already held stay.'],
    array['calendar_today (calendar mode; one record replaces the day):',
          'calendar_today (calendar mode; exactly one record for all seven days, from = today and to = today+6 as UK dates; it replaces every day from from to to, so a day with no events is cleared: send it even when events is empty, and never split it):'],
    array['{"kind":"calendar_today","data":{"events":[',
          '{"kind":"calendar_today","data":{"from":"YYYY-MM-DD","to":"YYYY-MM-DD","events":['],
    array['calendar "<n> events today"',
          'calendar "<n> events over 7 days, <n> today"']
  ];
  i int;
begin
  select * into cur from public.agent_prompts where agent = 'a5_followups' and active;
  if not found then raise exception 'No active a5_followups prompt.'; end if;

  if position('the calendar cache for today and the next six days' in cur.body) > 0 then
    raise notice 'The active A5 prompt (version %) already reads seven days. Nothing changed.', cur.version;
    return;
  end if;

  body := cur.body;
  for i in 1 .. array_length(swaps, 1) loop
    if position(swaps[i][1] in body) = 0 then
      raise exception 'Line not found in active A5 version %: %', cur.version, swaps[i][1];
    end if;
    body := replace(body, swaps[i][1], swaps[i][2]);
  end loop;

  select max(version) + 1 into i from public.agent_prompts where agent = 'a5_followups';
  update public.agent_prompts set active = false where id = cur.id;
  insert into public.agent_prompts (agent, version, body, shared_blocks, active, note)
  values ('a5_followups', i, body, cur.shared_blocks, true,
          format('Calendar mode reads seven days (0045), from version %s', cur.version));
  insert into public.audit_log (actor, action, target_table, detail)
  values (current_user, 'prompt version activated', 'agent_prompts',
          jsonb_build_object('agent', 'a5_followups', 'source', 'agent_prompts_a5_week.sql', 'from_version', cur.version));
  raise notice 'A5 version % made active in place of version %.', i, cur.version;
end $$;

commit;
