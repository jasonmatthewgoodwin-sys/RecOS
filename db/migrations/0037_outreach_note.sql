-- 0037 The outreach note on a job lead (Mia, 15 November 2026)
--
-- The ad and post chaser card summarises where the owner is with the
-- poster (connection sent on a date, messaged, replied and how) and lets
-- him edit that summary in place. The edited words live here; when it is
-- null the app writes the summary itself from the outreach dates.

alter table public.job_leads add column outreach_note text check (outreach_note is null or length(outreach_note) <= 1000);
