-- The sample week (section 35.2), as far as the tables built so far allow.
-- TEST ONLY. Never run this against the live project.
--
-- Every name here is invented. No real person, client or company appears.
-- Dates are set relative to today, so the sample is always "this week".
-- Run db/seed/targets.sql first. Safe to run again: it does nothing if the
-- sample rows already exist.
--
-- What Home should show afterwards: 07 needs you, 03 follow-ups, 6 calls
-- today (fewer as the day goes on) and 2/4 this week.

do $$
declare
  o uuid;
  p_ada uuid; p_ben uuid; p_cara uuid; p_dev uuid; p_eve uuid; p_finn uuid;
  monday date := public.week_of(now());
  run uuid;
  jl_north uuid; jl_contoso uuid; jl_globex uuid; wl_fabrikam uuid; rf_eve uuid;
begin
  select id into o from public.app_users where role = 'owner' order by created_at limit 1;
  if o is null then
    raise exception 'Sign in as the owner once before loading the sample week';
  end if;
  if exists (select 1 from public.inbox_items where source = 'sample week') then
    raise notice 'Sample week already loaded';
    return;
  end if;

  -- People: thin references only.
  insert into public.people (owner_id, display_name, name_key, display_title, display_company, company_key, city, kind)
  values (o, 'Ada Example', 'ada example', 'Senior PMM', 'Northwind Sample Co', 'northwind sample', 'new_york', 'candidate')
  returning id into p_ada;
  insert into public.people (owner_id, display_name, name_key, display_title, display_company, company_key, city, kind)
  values (o, 'Ben Sample', 'ben sample', 'VP Product Marketing', 'Contoso Demo Inc', 'contoso demo', 'boston', 'leader')
  returning id into p_ben;
  insert into public.people (owner_id, display_name, name_key, display_title, display_company, company_key, city, kind)
  values (o, 'Cara Placeholder', 'cara placeholder', 'Head of Marketing', 'Fabrikam Test Ltd', 'fabrikam test', 'austin', 'client_contact')
  returning id into p_cara;
  insert into public.people (owner_id, display_name, name_key, display_title, display_company, company_key, city, kind)
  values (o, 'Dev Madeup', 'dev madeup', 'Product Marketing Manager', 'Globex Fiction', 'globex fiction', 'remote_us', 'candidate')
  returning id into p_dev;
  insert into public.people (owner_id, display_name, name_key, display_title, display_company, company_key, city, kind)
  values (o, 'Eve Invented', 'eve invented', 'Director of PMM', 'Initech Mock', 'initech mock', 'san_francisco', 'referrer')
  returning id into p_eve;
  insert into public.people (owner_id, display_name, name_key, display_title, display_company, company_key, city, kind)
  values (o, 'Finn Fictional', 'finn fictional', 'PMM Lead', 'Umbrella Sample', 'umbrella sample', 'new_york', 'candidate')
  returning id into p_finn;

  insert into public.agent_runs (agent, trigger, status, finished_at, items_created, summary)
  values ('a3_jobs', 'manual', 'ok', now(), 4, 'Sample week')
  returning id into run;

  -- Inbox: 7 that need the owner, 1 sent for the record, 1 already done.
  insert into public.inbox_items (owner_id, type, agent, run_id, title, person_id, company, role, location, why, suggested_action, draft, draft_original, source, dedup_key, rank, status) values
    (o, 'job_lead', 'a3_jobs', run, 'Senior PMM at Northwind Sample Co', null, 'Northwind Sample Co', 'Senior PMM', 'new_york', 'B2B SaaS, about 400 people, New York. Posted two days ago.', 'Chase', 'Hi, I saw the Senior PMM role. I work only on product marketing hires and have two people worth a look.', 'Hi, I saw the Senior PMM role. I work only on product marketing hires and have two people worth a look.', 'sample week', 'sample:job_lead:northwind sample:senior pmm', 90, 'new'),
    (o, 'job_lead', 'a3_jobs', run, 'Director of PMM at Contoso Demo Inc', null, 'Contoso Demo Inc', 'Director of PMM', 'boston', 'Fits the ICP. The hiring leader is on the league.', 'Chase', null, null, 'sample week', 'sample:job_lead:contoso demo:director of pmm', 85, 'new'),
    (o, 'job_lead', 'a3_jobs', run, 'PMM at Globex Fiction', null, 'Globex Fiction', 'Product Marketing Manager', 'remote_us', 'Remote US. Second PMM hire this quarter.', 'Chase', null, null, 'sample week', 'sample:job_lead:globex fiction:pmm', 70, 'new'),
    (o, 'wider_lead', 'a3_jobs', run, 'Sales role at Fabrikam Test Ltd', null, 'Fabrikam Test Ltd', 'Account Executive', 'austin', 'Not PMM. May suit the sales team.', 'Pass on', null, null, 'sample week', 'sample:wider_lead:fabrikam test:account executive', 40, 'new'),
    (o, 'signal', 'a4_signals', null, 'Ben Sample was promoted', p_ben, 'Contoso Demo Inc', null, null, 'Now VP. Likely to build a team.', 'Send congratulations', 'Congratulations on the move to VP, Ben. Well earned.', 'Congratulations on the move to VP, Ben. Well earned.', 'sample week', 'sample:signal:ben sample:promotion', 60, 'new'),
    (o, 'referral', 'a6_calls', null, 'Eve Invented named someone to speak to', p_eve, 'Initech Mock', null, null, 'Mentioned on a call this week.', 'Follow up', null, null, 'sample week', 'sample:referral:eve invented', 55, 'new'),
    (o, 'call_writeup', 'a6_calls', null, 'Call with Ada Example needs a look', p_ada, 'Northwind Sample Co', null, null, 'One field could not be filled from the notes.', 'Confirm', null, null, 'sample week', 'sample:call_writeup:ada example', 50, 'stale'),
    (o, 'auto_sent', 'system', null, 'Thank-you sent to Dev Madeup', p_dev, null, null, null, 'Sent for you under the rules.', null, null, null, 'sample week', 'sample:auto_sent:dev madeup', 0, 'done'),
    (o, 'event_idea', 'a7_events', null, 'Breakfast on pricing pages', null, null, null, null, 'Came up on five calls this month.', 'Plan', null, null, 'sample week', 'sample:event_idea:pricing pages', 20, 'done');

  -- Follow-ups: 3 owed and late, 1 owed later this week, 1 waiting on someone else.
  insert into public.follow_ups (owner_id, person_id, person_name, company, kind, reason, source, direction, due_on, status, dedup_key) values
    (o, p_ada,  'Ada Example',      'Northwind Sample Co', 'after_candidate_call', 'Send the role outline you promised', 'call',  'owed',    monday,                 'open', 'sample:fu:ada'),
    (o, p_dev,  'Dev Madeup',       'Globex Fiction',      'after_candidate_call', 'Share feedback from the first call',  'call',  'owed',    monday,                 'open', 'sample:fu:dev'),
    (o, p_ben,  'Ben Sample',       'Contoso Demo Inc',    'after_coaching',       'Send the two examples discussed',     'call',  'owed',    monday,                 'open', 'sample:fu:ben'),
    (o, p_finn, 'Finn Fictional',   'Umbrella Sample',     'after_submission',     'Check in after the client reply',     'rule',  'owed',    current_date + 7,       'open', 'sample:fu:finn'),
    (o, p_cara, 'Cara Placeholder', 'Fabrikam Test Ltd',   'chase',                'Waiting for feedback on two CVs',     'email', 'waiting', current_date - 1,       'open', 'sample:fu:cara');

  -- Business development (section 9). The three job leads and the wider lead
  -- are the records behind the inbox items above. Leads inserted already
  -- chased or dead write no KPI event: only a move from new to chased does.
  insert into public.job_leads (owner_id, company, company_key, role, role_key, level, city, sources, fit_score, fit_reason, stage, first_seen_on, last_seen_on, matched)
  values (o, 'Northwind Sample Co', 'northwind sample', 'Senior PMM', 'senior product marketing manager', 'senior', 'new_york', array['linkedin_post'], 88, 'B2B SaaS, about 400 people, New York', 'new', current_date - 2, current_date,
    jsonb_build_array(jsonb_build_object('person_id', p_ada, 'name', 'Ada Example', 'reason', 'Senior PMM in New York, open to a move')))
  returning id into jl_north;
  insert into public.job_leads (owner_id, company, company_key, role, role_key, level, city, sources, fit_score, fit_reason, stage, hiring_manager_id, first_seen_on, last_seen_on)
  values (o, 'Contoso Demo Inc', 'contoso demo', 'Director of PMM', 'director of product marketing', 'director', 'boston', array['alex_leads', 'linkedin_advert'], 82, 'Fits the ICP. The hiring leader is on the league', 'new', p_ben, current_date - 1, current_date)
  returning id into jl_contoso;
  insert into public.job_leads (owner_id, company, company_key, role, role_key, level, city, sources, fit_score, fit_reason, stage, first_seen_on, last_seen_on)
  values (o, 'Globex Fiction', 'globex fiction', 'Product Marketing Manager', 'product marketing manager', 'manager', 'remote_us', array['linkedin_post'], 70, 'Remote US. Second PMM hire this quarter', 'new', current_date - 3, current_date)
  returning id into jl_globex;
  insert into public.job_leads (owner_id, company, company_key, role, role_key, level, city, sources, fit_score, stage, chased_on, first_seen_on, last_seen_on)
  values (o, 'Initech Mock', 'initech mock', 'Head of Product Marketing', 'head of product marketing', 'head', 'san_francisco', array['linkedin_post', 'manual'], 76, 'chased', monday, monday - 4, monday);
  insert into public.job_leads (owner_id, company, company_key, role, role_key, level, city, sources, fit_score, stage, chased_on, replied_on, first_seen_on, last_seen_on)
  values (o, 'Umbrella Sample', 'umbrella sample', 'VP Product Marketing', 'vice president product marketing', 'vp', 'new_york', array['alex_leads'], 91, 'replied', monday - 7, monday - 2, monday - 10, monday - 2);
  insert into public.job_leads (owner_id, company, company_key, role, role_key, level, country, city, sources, fit_score, stage, dead_reason, purge_after, first_seen_on, last_seen_on)
  values (o, 'Wonka Imaginary Ltd', 'wonka imaginary', 'PMM Lead', 'product marketing manager lead', 'manager', 'UK', 'london', array['linkedin_advert'], 40, 'dead', 'not_icp', (current_date + interval '12 months')::date, monday - 20, monday - 20);

  insert into public.wider_leads (owner_id, company, role, function, country, location, source, mentioned_by_id, mentioned_by_name, status, notes)
  values (o, 'Fabrikam Test Ltd', 'Account Executive', 'sales', 'US', 'austin', 'job_post', p_cara, 'Cara Placeholder', 'spotted', 'Not PMM. May suit the sales team.')
  returning id into wl_fabrikam;
  insert into public.wider_leads (owner_id, company, role, function, country, source, mentioned_by_id, mentioned_by_name, status, passed_to, passed_on, split_note)
  values (o, 'Globex Fiction', 'RevOps Manager', 'revops', 'US', 'coaching', p_dev, 'Dev Madeup', 'passed', 'Sam Colleague', monday - 8, 'Half each, agreed on the call');

  insert into public.coaching_sessions (owner_id, person_id, booked_for, source, status)
  values (o, p_ben, now() + interval '2 hours', 'league', 'booked');
  insert into public.coaching_sessions (owner_id, person_id, booked_for, held_at, source, status, q_interviewed_where, q_who_else_looking, advice_given, referrals_count, followed_up)
  values (o, p_eve, monday - 3 + interval '10 hours', monday - 3 + interval '10 hours', 'inbound', 'held', 'Two Series B companies in the Bay Area', 'A former colleague now at Northwind Sample Co', 'Lead with the launch story, not the title', 1, true);

  -- The referral Eve gave on her call. Its KPI event is written by trigger.
  insert into public.referrals (owner_id, referred_name, referred_company, referred_title, referred_by_id, referred_by_name, context, kind, stage, received_on, dedup_key)
  values (o, 'Hal Hypothetical', 'Northwind Sample Co', 'Group PMM', p_eve, 'Eve Invented', 'Worked together before. Said to be looking.', 'person', 'new', monday - 3, 'sample:referral:hal hypothetical:northwind sample:eve invented')
  returning id into rf_eve;

  insert into public.campaigns (owner_id, name, audience, tool, started_on, contacted, replies, calls_booked)
  values (o, 'Series B PMM leaders, east coast', 'Heads and directors of PMM at Series B SaaS, New York and Boston', 'Other tool', monday - 14, 120, 4, 1);

  insert into public.target_companies (owner_id, list, company, company_key, hq_country, us_presence, headcount_band, marketing_lead_name, marketing_lead_title, status) values
    (o, 'uk_to_us', 'Fabrikam Test Ltd', 'fabrikam test', 'UK', 'Austin office opened this year', '200-500', 'Cara Placeholder', 'Head of Marketing', 'in_conversation'),
    (o, 'uk_to_us', 'Wonka Imaginary Ltd', 'wonka imaginary', 'UK', 'None yet. Hiring a first US seller', '50-200', null, null, 'to_research');

  -- Point the inbox items at the records behind them.
  update public.inbox_items set ref_table = 'job_leads', ref_id = jl_north where dedup_key = 'sample:job_lead:northwind sample:senior pmm';
  update public.inbox_items set ref_table = 'job_leads', ref_id = jl_contoso where dedup_key = 'sample:job_lead:contoso demo:director of pmm';
  update public.inbox_items set ref_table = 'job_leads', ref_id = jl_globex where dedup_key = 'sample:job_lead:globex fiction:pmm';
  update public.inbox_items set ref_table = 'wider_leads', ref_id = wl_fabrikam where dedup_key = 'sample:wider_lead:fabrikam test:account executive';
  update public.inbox_items set ref_table = 'referrals', ref_id = rf_eve where dedup_key = 'sample:referral:eve invented';

  -- Today's calls: 6 external, 1 internal. Spread over the next few hours.
  insert into public.calendar_today (owner_id, starts_at, title, call_type, person_id, person_name, is_external, event_ref) values
    (o, now() + interval '1 hour',  'Candidate screen', 'candidate_screen', p_ada,  'Ada Example',      true,  'sample-1'),
    (o, now() + interval '2 hours', 'Coaching',         'coaching',         p_ben,  'Ben Sample',       true,  'sample-2'),
    (o, now() + interval '3 hours', 'Client update',    'client_update',    p_cara, 'Cara Placeholder', true,  'sample-3'),
    (o, now() + interval '4 hours', 'Candidate screen', 'candidate_screen', p_dev,  'Dev Madeup',       true,  'sample-4'),
    (o, now() + interval '5 hours', 'Reference',        'reference',        p_eve,  'Eve Invented',     true,  'sample-5'),
    (o, now() + interval '6 hours', 'Candidate screen', 'candidate_screen', p_finn, 'Finn Fictional',   true,  'sample-6'),
    (o, now() + interval '7 hours', 'Team catch-up',    'internal',         null,   null,               false, 'sample-7');

  -- KPI events. This week: posts chased 20 of 20 and coaching 5 of 5 are
  -- hit; LinkedIn posts 1 of 2 and new A-star 3 of 5 are not. So 2/4.
  insert into public.kpi_events (owner_id, kpi, happened_at, source_table, source_id, label)
  select o, k.kpi, now(), 'sample', gen_random_uuid(), k.label
  from (values
    ('posts_chased', 20, 'Chased: sample role at a sample company'),
    ('coaching_calls', 5, 'Coaching call held'),
    ('linkedin_posts', 1, 'Post published'),
    ('new_a_star', 3, 'New A-star candidate')
  ) as k (kpi, n, label)
  cross join lateral generate_series(1, k.n);

  -- Last week: every weekly target hit.
  insert into public.kpi_events (owner_id, kpi, happened_at, source_table, source_id, label)
  select o, k.kpi, now() - interval '7 days', 'sample', gen_random_uuid(), k.label
  from (values
    ('posts_chased', 22, 'Chased: sample role at a sample company'),
    ('coaching_calls', 5, 'Coaching call held'),
    ('linkedin_posts', 2, 'Post published'),
    ('new_a_star', 6, 'New A-star candidate')
  ) as k (kpi, n, label)
  cross join lateral generate_series(1, k.n);
end $$;
