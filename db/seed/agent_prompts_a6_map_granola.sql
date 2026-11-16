-- The market map comes after the brief call, and the Granola notes of that call
-- are its main source (Jason, 16 November). Rewrites one sentence of the active
-- a6_calls prompt. Safe to run twice.

update public.agent_prompts
set body = replace(body,
  $o$Requested after the brief, so use `brief` (Jason's notes from the client call) with the JD.$o$,
  $n$Requested after the brief call, and the Granola notes of that call are the main source: search Granola for the client name (last 60 days), read the intake or brief call first, and take the real scope, level, must-haves, pay, location and off-limits companies from it. Then use `brief` (Jason's saved notes) and the JD.$n$)
where agent = 'a6_calls' and active;
