-- The LinkedIn sweep moved to Jason's laptop as "RecOS LinkedIn sweep",
-- weekdays 08:30 and 20:30, and posts its leads into RecOS itself (Jason,
-- 18 November 2026: "it should run every day"). The cloud collect run no
-- longer looks for the old Cowork sweep's Drive sheets. Safe to run twice.

update public.agent_prompts
set body = replace(replace(replace(body,
  $o1$collect mode also, and first:
- The LinkedIn PMM hiring report (Google Drive): every Google Sheet named linkedin_pmm_hiring_report_YYYY-MM-DD whose date falls in the window, newest first (search Drive for "linkedin_pmm_hiring_report"). Columns: Name | Title | Company | Role | Type | Excerpt | LinkedIn Profile | Post Link. Each row with Type In-house is a job_lead: source linkedin_post, source_url the Post Link (if the Post Link is blank, use the LinkedIn Profile link so the row is not dropped), company, role, poster_name = Name, poster_title = Title, poster_profile_url = LinkedIn Profile, function pmm, why one line on the role in your own words (never more than a few words of the excerpt). Read only the data rows; ignore the run note under them. A lead already held merges and gains its source, which is wanted. If no sheet is in the window, say so in errors as {"source":"drive","message":"No hiring report sheet since <date>"} and carry on with email. Never write a connection note, a message or an outreach_step for these leads: RecOS queues each connection request itself.
$o1$,
  $n1$collect mode also:
- Hiring posts are not yours to find: the owner's laptop sweep ("RecOS LinkedIn sweep", weekdays 08:30 and 20:30) posts them into RecOS itself as this agent. Do not look for hiring report sheets in Drive.
$n1$),
  $o2$- collect (Tuesday and Friday, 15:30): new roles from the LinkedIn PMM hiring report sheets in Google Drive (the main source) and from email.$o2$,
  $n2$- collect (Tuesday and Friday, 15:30): the roles in the leads email (it arrives on Mondays) and LinkedIn emails quoting a hiring post.$n2$),
  $o3$Everything comes from Outlook email and from the hiring report sheets in Google Drive, which the owner's LinkedIn sweep writes.$o3$,
  $n3$Everything comes from Outlook email.$n3$)
where agent = 'a3_jobs' and active and position('Hiring posts are not yours to find' in body) = 0;
