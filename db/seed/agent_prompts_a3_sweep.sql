-- The LinkedIn PMM Job Post Sweep feeds Ad and post chasers (Jason,
-- 17 November 2026). The sweep runs on Jason's laptop on Tuesdays and Fridays
-- at 13:00 with Chrome signed in to LinkedIn, and writes one Google Sheet per
-- run, linkedin_pmm_hiring_report_YYYY-MM-DD, in the shared Drive folder. The
-- A3 collect run (moved to 15:30 the same days) reads those sheets through the
-- Drive connector and posts each row as a job lead, so the agent itself still
-- never opens LinkedIn. Connection requests are RecOS's: a fresh lead with a
-- poster queues one with the approved note (0054, 0057). Changes three
-- passages of the active a3_jobs prompt. Safe to run twice.

update public.agent_prompts
set body = replace(replace(replace(body,
  $o1$- collect (Tuesday and Friday): new roles from email.$o1$,
  $n1$- collect (Tuesday and Friday, 15:30): new roles from the LinkedIn PMM hiring report sheets in Google Drive (the main source) and from email.$n1$),
  $o2$Everything comes from Outlook email.$o2$,
  $n2$Everything comes from Outlook email and from the hiring report sheets in Google Drive, which the owner's LinkedIn sweep writes.$n2$),
  $o3$Ignore the funding list; A4 reads it.$o3$,
  $n3$collect mode also, and first:
- The LinkedIn PMM hiring report (Google Drive): every Google Sheet named linkedin_pmm_hiring_report_YYYY-MM-DD whose date falls in the window, newest first (search Drive for "linkedin_pmm_hiring_report"). Columns: Name | Title | Company | Role | Type | Excerpt | LinkedIn Profile | Post Link. Each row with Type In-house is a job_lead: source linkedin_post, source_url the Post Link (if the Post Link is blank, use the LinkedIn Profile link so the row is not dropped), company, role, poster_name = Name, poster_title = Title, poster_profile_url = LinkedIn Profile, function pmm, why one line on the role in your own words (never more than a few words of the excerpt). Read only the data rows; ignore the run note under them. A lead already held merges and gains its source, which is wanted. If no sheet is in the window, say so in errors as {"source":"drive","message":"No hiring report sheet since <date>"} and carry on with email. Never write a connection note, a message or an outreach_step for these leads: RecOS queues each connection request itself.
Ignore the funding list; A4 reads it.$n3$)
where agent = 'a3_jobs' and active and position('The LinkedIn PMM hiring report (Google Drive)' in body) = 0;
