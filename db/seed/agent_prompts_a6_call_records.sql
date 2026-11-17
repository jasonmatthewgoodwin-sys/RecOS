-- The call record (17 November 2026). The calls mode wrote follow-ups and
-- touches but never a `call` record, so the calls table stayed empty: no
-- Calls tab on a search, no library on Spec, no write-up tasks. This puts the
-- call record first in calls mode. Safe to run twice: it does nothing once
-- the section is there.

update public.agent_prompts
set body = $s$## Mode: calls, the call record (read this first in calls mode)

In calls mode, for every Granola call, write one `call` record before anything else about that call. Each run also looks back 14 days and writes any Granola call RecOS does not have yet. A repeat merges on granola_ref, so sending one again is safe.

{"kind":"call","data":{"granola_ref":"<Granola id>","granola_url":"<link to the notes>","calendar_ref":"<calendar event id, if known>","title":"<meeting title>","held_at":"<ISO UTC start>","minutes":30,"call_type":"candidate_screen|coaching|client_update|client_intake|reference|interview_prep|debrief|internal|other","person_name":"<the other person>","company":"<their company>","search_client":"<the client, when the call is about a live search>","search_role":"<that search's role>","match_confidence":"confirmed|high|low|none","w_record":true,"cv_requested":false,"summary":"<up to 600 characters, in your own words: who they are, what they want, what was agreed>"}}

- summary never carries a phone number, an email address, pay figures or quotes. The notes stay in Granola, linked by granola_url.
- A call you cannot match to a live search: match_confidence none and leave search_client out. RecOS raises the Confirm task itself, so do not also write a "Confirm which search" follow_up.
- An internal call: call_type internal, skip_reason "internal".
- Then carry on with the rest of calls mode: follow-ups, touches, referrals, coaching answers and drafts as below.

$s$ || body
where agent = 'a6_calls' and active and position('## Mode: calls, the call record' in body) = 0;
