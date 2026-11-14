-- The nightly schedule (sections 33.8 and 34.5). Run once on each Supabase
-- project, after the migrations, in the SQL editor. Safe to run again: the
-- job is replaced by name.
--
-- pg_cron keeps UTC. 02:00 UK is 02:00 UTC in winter and 01:00 UTC in
-- summer; the job runs at 02:00 UTC all year, which is 03:00 UK in summer.
-- Nothing depends on the exact hour.
--
-- Not part of db/tests: PGlite has no pg_cron.

create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid) from cron.job where jobname = 'recos-nightly';
select cron.schedule('recos-nightly', '0 2 * * *', $$select public.nightly()$$);
