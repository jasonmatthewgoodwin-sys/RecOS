-- 0039 The sender routine as an agent row, so it can hold a key.
-- 0034 has /send/tick and /send/report check X-Agent-Name: sender against the
-- agent keys, but no `sender` row existed, so Settings, Agents could not make
-- its key and every tick was refused. It is not one of the seven agents: it
-- has no prompt in the app and never writes through agent-write.

insert into public.agents (code, name, schedule, model_tier)
values ('sender', 'Outlook sender', 'Weekdays three times an hour, 08:00 to 18:00 New York time', 'light')
on conflict (code) do nothing;
