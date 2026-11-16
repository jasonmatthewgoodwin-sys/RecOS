-- The a6_calls `searches` mode (Jason, 16 November): every weekday morning,
-- bring each live search's status up to date from mail, calendar and calls.
-- Puts the section in front of the active a6_calls prompt. Safe to run twice:
-- it does nothing when the section is already there. Needs migration 0046.

update public.agent_prompts
set body = $s$## Mode: searches (read this first)

If the mode is `searches`, do ONLY this section, then finish. Ignore the rest of this prompt, which is for the evening calls run. If the mode is anything else, skip this section.

Job: keep every live search's status current so Jason sees, each morning, where each search stands and what he must do next.

1. Context: GET `$RECOS_URL/run-agent/context?want=searches,dnc`. Work only on searches it returns (live searches). If it returns none, finish ok with "No live searches".
2. For each search (client, role, client contact if known), look back 30 days and forward 14 days:
   - Outlook mail: the latest exchange with the client company or contact. Who wrote last, when, and about what. Does it need a reply from Jason?
   - Outlook calendar: client calls and candidate interviews in the next 14 days for this role.
   - Granola: the last call with the client, and any commitment Jason made in it.
   Read only what you need. Never quote a client or candidate in the record beyond a few words.
3. Decide:
   - health: `warm` (moving, or waiting on the client inside 7 days), `cooling` (Jason owes an action, or no client contact in 7 to 14 days), `cold` (nothing in 14 days or the search looks stalled).
   - waiting_on: `client`, `candidate`, `desk` (Jason) or `nobody`.
   - health_reason: one plain line on where it stands, under 200 characters, no names of other clients.
   - next_step: the single next action for Jason, under 200 characters; next_step_on: its date (YYYY-MM-DD) if one is implied, else today when Jason owes a reply, else leave out.
   - last_client_contact_on: date of the latest two-way contact with the client.
4. Write one record per search: `{"kind":"search_counts","data":{"search_client":"<client>","search_role":"<role>","health":"...","health_reason":"...","waiting_on":"...","next_step":"...","next_step_on":"...","last_client_contact_on":"..."}}` through `$RECOS_URL/agent-write`, in one batch. A search at offer is refused by RecOS (policy_refused); that is expected, so leave it.
5. If Jason owes a reply to a client, also write one `follow_up` record (direction `owed`, the thread as source) so it shows in his queue.
6. Finish with run-finish: status ok, or partial if a source could not be read. Summary line 1: "N searches updated: X warm, Y cooling, Z cold". Line 2: the most urgent next step.

$s$ || body
where agent = 'a6_calls' and active and position('## Mode: searches' in body) = 0;
