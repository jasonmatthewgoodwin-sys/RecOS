-- Sample league members, touches and signals for the test project, on the
-- sample week's people. TEST ONLY. Never run this against the live project.
-- Run db/seed/lists.sql and db/seed/sample_week.sql first. Safe to run
-- again: it does nothing if the sample members already exist.

do $$
declare
  o uuid;
  senior uuid; top uuid;
  p_ben uuid; p_cara uuid; p_eve uuid; p_ada uuid; p_dev uuid; p_finn uuid;
begin
  select id into o from public.app_users where role = 'owner' order by created_at limit 1;
  if o is null then
    raise exception 'Sign in as the owner once before loading the sample league';
  end if;
  select id into senior from public.lists where key = 'senior_network';
  select id into top from public.lists where key = 'top_candidates';
  if senior is null or top is null then
    raise exception 'Run db/seed/lists.sql first';
  end if;
  if exists (select 1 from public.league_members where why like 'Sample:%') then
    raise notice 'Sample league already loaded';
    return;
  end if;
  select id into p_ben from public.people where name_key = 'ben sample';
  select id into p_cara from public.people where name_key = 'cara placeholder';
  select id into p_eve from public.people where name_key = 'eve invented';
  select id into p_ada from public.people where name_key = 'ada example';
  select id into p_dev from public.people where name_key = 'dev madeup';
  select id into p_finn from public.people where name_key = 'finn fictional';
  if p_ben is null then
    raise exception 'Run db/seed/sample_week.sql first';
  end if;

  -- Senior network: a leader on cadence, one late, one due this week.
  insert into public.league_members (owner_id, person_id, list_id, tier, why, added_from, added_on, last_touch_on) values
    (o, p_ben,  senior, 'premier',      'Sample: VP who has briefed two roles',        'seed', current_date - 60, current_date - 4),
    (o, p_cara, senior, 'championship', 'Sample: client contact, warm',                'seed', current_date - 90, current_date - 45),
    (o, p_eve,  senior, 'league_one',   'Sample: director who gives referrals',        'seed', current_date - 30, current_date - 44);
  -- Top candidates: A-grade people placeable widely.
  insert into public.league_members (owner_id, person_id, list_id, tier, why, added_from, added_on, last_touch_on) values
    (o, p_ada,  top, 'premier',      'Sample: senior PMM, open to a move',          'seed', current_date - 20, current_date - 2),
    (o, p_dev,  top, 'championship', 'Sample: strong on launches',                   'seed', current_date - 50, current_date - 31),
    (o, p_finn, top, 'league_one',   'Sample: placed once, keeps in touch',          'placement', current_date - 120, null);

  insert into public.touches (owner_id, person_id, touched_on, channel, kind, source, note) values
    (o, p_ben,  current_date - 4,  'phone',    'call',            'call',   'Sample: talked about the Boston role'),
    (o, p_ada,  current_date - 2,  'phone',    'call',            'call',   'Sample: screen for Northwind'),
    (o, p_cara, current_date - 45, 'meeting',  'meeting',         'calendar', 'Sample: quarterly catch-up'),
    (o, p_eve,  current_date - 44, 'linkedin', 'message_replied', 'manual', 'Sample: replied about coaching'),
    (o, p_dev,  current_date - 31, 'email',    'message_replied', 'email',  'Sample: replied about feedback');

  insert into public.signals (owner_id, person_id, person_name, person_key, company, company_key, title, signal_type, strength, detail, source, seen_on, in_icp, dedup_key) values
    (o, p_ben, 'Ben Sample', 'ben sample', 'Contoso Demo Inc', 'contoso demo', 'VP Product Marketing', 'promoted', 3, 'Sample: now VP. Likely to build a team.', 'linkedin_alert', current_date - 1, true, 'sample:signal:ben sample:promoted'),
    (o, null, 'Gia Imaginary', 'gia imaginary', 'Initech Mock', 'initech mock', 'Head of Marketing', 'new_role', 3, 'Sample: started as Head of Marketing this month.', 'linkedin_alert', current_date - 3, true, 'sample:signal:gia imaginary:new_role'),
    (o, null, 'Hal Hypothetical', 'hal hypothetical', 'Northwind Sample Co', 'northwind sample', 'Group PMM', 'open_to_work', 2, 'Sample: open to work badge.', 'linkedin_alert', current_date - 5, true, 'sample:signal:hal hypothetical:open_to_work'),
    (o, null, 'Nobody Relevant', 'nobody relevant', 'Elsewhere Ltd', 'elsewhere', 'Plumber', 'new_role', 3, 'Sample: outside the ICP, stored as ignored.', 'linkedin_alert', current_date - 2, false, 'sample:signal:nobody relevant:new_role');
end $$;
