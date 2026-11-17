-- A market map asked for again is a top-up, not a fresh start (Jason,
-- 16 November 2026). Needs migration 0054, which sends `previous` with a map
-- job. Adds one passage to the active a6_calls prompt. Safe to run twice.

update public.agent_prompts
set body = replace(body,
  $o$If the sources run dry below 200, stop and say in the job note how many you reached and why; never pad.$o$,
  $n$If the sources run dry below 200, stop and say in the job note how many you reached and why; never pad.
- Top-up: when a map job carries `previous` (the map already on this search), do not start again. Keep every company in it, in its tier, unless you find it has been acquired and absorbed or is off limits. Then: (a) count what is there and add new companies from list sources you fetch in this run until the map reaches about 200, skipping any name already present under any spelling; (b) make sure the 40 companies you would approach first each have `hq`, `size`, confidence Confirmed and, where one exists, a dated `movability` signal, filling what `previous` left out; (c) rebuild the company Boolean batches and the CSV so they cover the whole merged list. Write the full merged map as the result, never only the additions. In the job note say "Topped up from N to M companies, K with full detail".$n$)
where agent = 'a6_calls' and active and position('- Top-up: when a map job carries `previous`' in body) = 0;
