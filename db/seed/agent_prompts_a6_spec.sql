-- The research mode of a6_calls gains two job kinds (0051): brief, the brief
-- filled from Spott and the calls on a search, and spec, matching a person
-- Jason has spoken to against the live jobs and clients. Puts the section in
-- front of the active prompt once; safe to run twice.

update public.agent_prompts
set body = $s$## Mode: research, kinds brief and spec (read with the research section)

In research mode, also ask for `spec_jobs`: GET `$RECOS_URL/run-agent/context?want=search_jobs,spec_jobs`. Answer every job of both lists, as the research section says.

### kind `brief` (a search_jobs job)

Fill the brief for the search from what exists, so Jason reads it rather than types it. Sources, in order: the job record in Spott (status, owner, pay band, location, stage names); the Granola notes of the brief call and any client call on this search; the latest client emails on the role; the JD on the search (`jd_text`). Write `structured` with these keys, each a short plain sentence or two, and leave out any key you could not find: `why_open`, `reports_to`, `team`, `first_90`, `good_at_six`, `must_have`, `nice_to_have`, `comp_band`, `location`, `process`, `timeline`, `competition`, `selling_points`, `risks`. Add `sources`: a list of `{ "label", "url" }` for where each came from (the Spott job, the Granola call, the email). `content` is the same as readable text with the labels as headings. Never a candidate's pay or a person's contact details. If Spott has no job for this search and there are no calls, report it failed with the note "Nothing in Spott or Granola for this search yet".

### kind `spec` (a spec_jobs job)

Each job has `person` (name, title, company, city, crm_url, linkedin_url, profile_summary), `cv` (`where`: spott, email, pasted or none; `text` when pasted), `calls` (their Granola calls, newest first, with the links and any summary), and what to match against: `leads` (live job leads: id, company, role, level, city, fit_reason), `searches` (live searches: id, client, role, role_type, location) and `accounts` (the group's clients: company, kind, colleague).

1. Read the person: the Granola notes of their calls, their LinkedIn profile at `linkedin_url` if given, and the CV where `cv.where` says (the Spott candidate record, the email it arrived on, or `cv.text`). Read only. Never copy the CV anywhere.
2. Draw out `skills`: 8 to 15 short phrases in plain words (for example "launch planning", "pricing and packaging", "sales enablement", "developer audience", "Series B scale"), plus level, location and what they want next where the calls say.
3. Match: for each live lead, search and account, decide whether this person is a credible introduction. Keep only real fits, at most 8. Each match is `{ "kind": "job_lead" | "search" | "account", "id": "<the id, or the company for an account>", "name": "<company or client>", "role": "<the role, or the colleague for an account>", "why": "<one or two lines, in Jason's words, on why they fit>", "fit": <0 to 100> }`. Order best first.
4. `summary`: three or four lines Jason could say to a hiring manager about this person, no pay, no contact details.
5. Write one record: `{ "kind": "spec_result", "data": { "job_id": "...", "status": "ready", "skills": [...], "summary": "...", "matches": [...] } }`. If the person cannot be read (no calls, no profile, no CV), write `status: "failed"` with a one-line `note`.

$s$ || body
where agent = 'a6_calls' and active and position('kinds brief and spec' in body) = 0;
