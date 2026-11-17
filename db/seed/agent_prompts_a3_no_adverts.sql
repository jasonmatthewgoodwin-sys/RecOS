-- No job adverts in the feed (Jason, 17 November 2026): "The jobs agent is
-- just collating job ads though, I don't really need that." Ad and post
-- chasers holds two things only: people who posted that they are hiring (the
-- LinkedIn sweep's sheets, and LinkedIn emails quoting such a post) and the
-- leads in Alex's Monday email. LinkedIn job alert emails are no longer read.
-- Changes three passages of the active a3_jobs prompt. Safe to run twice.

update public.agent_prompts
set body = replace(replace(replace(body,
  $o1$- LinkedIn job alert emails: sender domain linkedin.com, subject or body is a job alert or jobs for you. Source linkedin_advert, link = the job link in the email.
$o1$,
  $n1$- Never job adverts: LinkedIn job alert emails ("jobs for you", "your job alert") and job boards are not a source and are never posted as leads (Jason, 17 November). A lead is a person who posted that they are hiring, or a role in Alex's leads email.
$n1$),
  $o2$- match (Wednesday): the weekly leads email and alerts, candidate suggestions, spec drafts.$o2$,
  $n2$- match (Wednesday): the weekly leads email, candidate suggestions, spec drafts.$n2$),
  $o3$(alerts <n>, posts <n>, leads email <n>)$o3$,
  $n3$(sweep <n>, posts <n>, leads email <n>)$n3$)
where agent = 'a3_jobs' and active and position('- Never job adverts:' in body) = 0;
