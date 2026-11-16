-- Remove the invented sample week from a project that now holds real data
-- (Jason, 16 November 2026: the queue showed Ada Example and friends next to
-- his real follow-ups). Run once in the SQL editor on the test project. It
-- takes out only the rows the sample seeds made: the six invented people and
-- everything hanging off them, the sample leads, the sample KPI events and
-- the two sample target companies. Real rows are untouched. One transaction.

begin;
create temp table sp as
  select id from people where display_name in (
    'Ada Example', 'Ben Sample', 'Cara Placeholder', 'Dev Madeup', 'Eve Invented', 'Finn Fictional',
    'Hal Hypothetical', 'Grace Fictional', 'Zed Fictional', 'Yas Imaginary', 'Uma Pretend', 'Nia Pretend');
create temp table sl as
  select id from job_leads where company_key in (
    'northwind sample', 'contoso demo', 'globex fiction', 'initech mock', 'umbrella sample', 'wonka imaginary', 'fabrikam test', 'acme pretend');

delete from inbox_items where source = 'sample week' or dedup_key like 'sample:%' or person_id in (select id from sp) or (ref_table = 'job_leads' and ref_id in (select id from sl));
delete from send_log where message_id in (select id from messages where person_id in (select id from sp));
update follow_ups set message_id = null where message_id in (select id from messages where person_id in (select id from sp));
delete from follow_ups where dedup_key like 'sample:%' or person_id in (select id from sp);
delete from messages where person_id in (select id from sp);
delete from signals where person_id in (select id from sp);
delete from touches where person_id in (select id from sp);
delete from league_history where member_id in (select id from league_members where person_id in (select id from sp));
delete from league_members where person_id in (select id from sp);
delete from coaching_sessions where person_id in (select id from sp);
delete from referrals where dedup_key like 'sample:%' or referred_by_id in (select id from sp);
delete from search_candidates where person_id in (select id from sp);
delete from spec_requests where person_id in (select id from sp);
delete from calls where person_id in (select id from sp);
update wider_leads set mentioned_by_id = null where mentioned_by_id in (select id from sp);
delete from wider_leads where company in ('Fabrikam Test Ltd', 'Globex Fiction') and (notes like 'Not PMM%' or passed_to = 'Sam Colleague');
delete from campaigns where candidate_person_id in (select id from sp) or job_lead_id in (select id from sl);
update job_leads set hiring_manager_id = null where hiring_manager_id in (select id from sp);
delete from job_leads where id in (select id from sl);
delete from kpi_events where source_table = 'sample';
delete from target_companies where company in ('Fabrikam Test Ltd', 'Wonka Imaginary Ltd');
update calendar_today set person_id = null where person_id in (select id from sp);
update content_items set person_id = null where person_id in (select id from sp);
update a_star_suggestions set person_id = null where person_id in (select id from sp);
delete from people where id in (select id from sp);
commit;

select
  (select count(*) from people where display_name ~* 'sample|example|placeholder|madeup|invented|fictional') as sample_people_left,
  (select count(*) from tasks_view) as tasks_now;
