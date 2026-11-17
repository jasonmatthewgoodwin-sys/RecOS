-- The jobs agent and LinkedIn (Jason and Mia, 17 November 2026). Two things:
--   1. why is the role in the source's own words, never the agent's
--      bookkeeping ("Reported in the LinkedIn PMM hiring report of ...").
--   2. The poster's LinkedIn profile matters now: RecOS queues a connection
--      request for every fresh lead with a poster, and the LinkedIn sender on
--      Jason's laptop sends it. The agent itself still never opens LinkedIn.
-- Safe to run twice: it changes nothing once the new words are there.

update public.agent_prompts
set body = replace(body,
  '"why":"<one line, from the source>"',
  '"why":"<one line on the role in the source''s own words: team, level, location, what they want. Never \"Reported in ...\" or the name of a report>"')
where agent = 'a3_jobs' and active and position('Never \"Reported in' in body) = 0;

update public.agent_prompts
set body = replace(body,
  'Omit empty fields rather than sending "". matched only if any.',
  'Omit empty fields rather than sending "". matched only if any.' || E'\n' ||
  'For a LinkedIn post, poster_name and poster_profile_url matter most: RecOS queues a connection request to the poster for every lead posted in the last 21 days, and the LinkedIn sender on the owner''s laptop sends it. Copy the profile link exactly as the email shows it; leave it out rather than guess. You still never open LinkedIn yourself.')
where agent = 'a3_jobs' and active and position('RecOS queues a connection request to the poster' in body) = 0;
