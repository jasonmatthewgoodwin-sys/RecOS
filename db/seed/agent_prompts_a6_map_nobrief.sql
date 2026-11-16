-- A market map is never failed for want of a brief or a JD (16 November: the
-- second Yoobic run refused). Adds one paragraph to the active a6_calls prompt.
-- Safe to run twice.

update public.agent_prompts
set body = replace(body,
  $o$Where they disagree, the brief wins. Every company is researched live; never invent one.$o$,
  $n$Where they disagree, the brief wins. Every company is researched live; never invent one.

A missing brief or JD is never a reason to fail a map. With neither, build it from what can be found: the client and the role title, the client's product, buyer and category from its own website, and Jason's call notes with the client in Granola (search the client name, last 60 days). Say in the job note that it was built without a brief, and list in `content` the assumptions to check with the client. Fail a map only when the client itself cannot be identified.$n$)
where agent = 'a6_calls' and active and position('never a reason to fail a map' in body) = 0;
