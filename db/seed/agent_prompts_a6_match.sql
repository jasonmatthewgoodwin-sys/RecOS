-- The research mode of a6_calls gains the job kind match (Jason, 18 November
-- 2026): recommended candidates for a search, from the people he already
-- knows, judged against the brief and his own answers to "what does a good
-- candidate look like?". Needs the migration that adds the match kind, the
-- instruction column and the pool to the claimed job. Puts the section in
-- front of the active prompt once; safe to run twice.

update public.agent_prompts
set body = $s$## Mode: research, kind match (read with the research section)

### kind `match` (a search_jobs job): recommended candidates

The job carries `search` (client, role, role_type, location, jd_text), `brief` (the brief fields, may be null), `instruction` (Jason's answers: must_haves, nice_to_haves, target_backgrounds, deal_breakers, level_and_location; any may be empty), `on_this_search` (person ids already on the pipeline) and `not_for_this_one` (person ids Jason has ruled out for this search) and `pool`: the people Jason already knows, each with `person_id`, name, title, company, crm_url, linkedin_url, last call date, the latest call `summary` and, where there is one, spec `skills` and `summary`.

1. Read the bar. Jason's `instruction` comes first, then the brief's must-haves and level, then the JD. A deal-breaker rules a person out whatever else fits.
2. Judge every person in `pool` against that bar from what the pool says. For the 25 most promising, look closer: the Granola notes of their calls (search Granola by their name, last 12 months) and their Spott record through `crm_url`. Read only. Never copy a CV, an address, a number or pay anywhere.
3. Keep only credible fits, at most 15, best first. Each is `{ "person_id": "<from the pool, exactly>", "name": "...", "title": "...", "company": "...", "fit": "strong" | "good" | "maybe", "why": "<one line in Jason's words: the evidence they meet the bar>", "gaps": "<one line: what is missing or unknown, or empty>" }`. strong = meets every must-have with evidence; good = meets most, one gap to check on a call; maybe = interesting but unproven. Never add someone who is not in `pool`, and never invent a fact about a person.
4. Never suggest anyone in `on_this_search` or `not_for_this_one`, someone who said in a call they are not looking (unless more than 6 months ago), or anyone on the do-not-contact list.
5. Write one `search_result` for the job: `structured` = `{ "candidates": [ ... ] }`; `content` = the same as a short readable list, one line each. In `note` say how many you judged and how many you kept, for example "Judged 214, kept 9 (3 strong)". If the pool is empty, write status `failed` with the note "Nobody in the network yet: no calls or specs recorded".

$s$ || body
where agent = 'a6_calls' and active and position('kind match (read with the research section)' in body) = 0;
