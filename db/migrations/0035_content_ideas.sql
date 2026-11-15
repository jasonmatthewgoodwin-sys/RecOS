-- 0035 Content ideas from the desk (Mia, 15 November 2026)
--
-- The Content tab opened empty on the test project. This adds
-- content_ideas_seed(): ten LinkedIn post drafts in the owner's voice,
-- written from what Jason said on his calls (the three questions, first
-- quarter hires, UK to US, interview loops, spec candidates, aftercare,
-- open to work, referrals) and from the agent's work (the hiring reports
-- imported through agent-write: 164 US product marketing roles between
-- 21 September and 10 November 2026). No client, candidate or colleague
-- is named. Safe to run twice: a topic already drafted is skipped.
--
-- The content agent gains the call notes connection, since its Monday
-- run drafts from last week's calls (section 12.1).

create function public.content_ideas_seed() returns int
language plpgsql security definer set search_path = public as $$
declare
  o uuid := aw_owner();
  n int := 0;
begin
  if is_browser() and app_role() <> 'owner' then raise exception 'not_allowed: Only the owner adds ideas'; end if;
  if o is null then return 0; end if;
  insert into content_items (owner_id, kind, run_source, angle, topic, topic_key, hook, body, close_line, hashtags, draft_original, data_point, prompted_by, word_count, format_ok, rank, status)
  select o, 'linkedin_post', s.run_source, s.angle, s.topic,
    lower(regexp_replace(btrim(s.topic), '[^A-Za-z0-9]+', '_', 'g')),
    s.hook, s.body, s.close_line, s.hashtags,
    s.hook || E'\n\n' || s.body || E'\n\n' || s.close_line,
    s.data_point, s.prompted_by,
    array_length(regexp_split_to_array(btrim(s.body), '\s+'), 1),
    true, s.rank, 'draft'
  from (values
    ('calls', 'hiring_manager', 'First quarter hires',
     'New leaders hire in their first quarter. Most teams find out too late.',
     E'A VP lands and the org chart changes within ninety days.\nThe roles get written before anyone outside hears about them.\nIf you want to be in that conversation, be in it before day one.\nCongratulate the move. Ask what the first quarter looks like.\nThe brief usually follows.',
     'Who got promoted in your network this week?',
     array['productmarketing'], null, 'What the owner said about promotions on the signals list', 60.00),
    ('calls', 'talent_market', 'Three questions on every call',
     'Three questions tell you where the market is moving.',
     E'Where have you interviewed lately?\nWho else do you know who is looking?\nHow does that company run its hiring?\nAsk them on every call and the pattern shows inside a month.\nWhich companies are building, which are stalling, and who is open.\nNo report tells you that. People do.',
     'What would you add as a fourth?',
     array['hiring'], null, 'The three questions the owner asks on every coaching and referral call', 58.00),
    ('manual', 'talent_market', 'Eight weeks of US product marketing roles',
     '164 US product marketing roles crossed my desk in eight weeks.',
     E'That is the count from the hiring reports since late September.\nMost were director level and above.\nNew York and Boston led, then remote.\nB2B software made up most of it.\nIf you were told the market is quiet, it is quiet somewhere else.',
     'The leaders hiring now will have teams by spring.',
     array['productmarketing', 'hiring'], '164 roles, 21 September to 10 November 2026, from the hiring reports loaded through agent-write', 'The jobs agent import of the weekly hiring reports', 56.00),
    ('calls', 'hiring_manager', 'The first US hire from the UK',
     'A UK company opening its first US role rarely plans the hire properly.',
     E'The posting goes up in London time.\nThe salary band is a UK band with a dollar sign.\nThe interview loop is six people and a case study.\nThe candidates in New York have three other offers.\nFix the band, cut the loop, and decide who the hire reports to.\nThen post.',
     'What was your first US hire like?',
     array['productmarketing'], null, 'UK to US leads and what the owner said about them', 54.00),
    ('calls', 'hiring_manager', 'What interview loops test',
     'Most product marketing interview loops test presentation, not judgement.',
     E'A polished deck tells you they can present.\nIt does not tell you how they choose what not to launch.\nAsk about a launch they pulled, and why.\nAsk what they would cut from the roadmap, and how they would say so.\nThe answers separate a communicator from a product marketer.',
     'What question has told you the most?',
     array['productmarketing'], null, 'Raised on three candidate calls in one week', 52.00),
    ('manual', 'hiring_manager', 'One profile, one reason',
     'One profile, sent to one hiring manager, with one reason. That is a spec.',
     E'Not a list.\nNot a mail merge.\nA person who fits the role you just posted, with two lines on why.\nThen a call, then a message if the call does not land.\nIt works because it respects your time and theirs.\nThe reply rate is the proof.',
     'Would you rather see one right person or ten possibles?',
     array['hiring'], null, 'The spec campaign steps under Content, Campaigns', 50.00),
    ('calls', 'candidate', 'Day ninety',
     'The placement is not the finish. Day ninety is.',
     E'A new product marketing leader has one quarter to show the shape of the role.\nThe check-ins that matter are at two weeks, six weeks and ninety days.\nWhat surprised you. What is harder than expected. Who do you need.\nA recruiter who stops at the offer letter has done half the job.',
     'When did someone last check in on you after a move?',
     array['productmarketing'], null, 'The aftercare dates under Searches, Placed', 48.00),
    ('calls', 'candidate', 'Open to work is a signal',
     'Open to work is a signal, not a label.',
     E'Senior product marketers rarely switch the banner on.\nWhen they do, something changed: a reorg, a new boss, a funding round that moved the plan.\nThe right response is a conversation, not a job spec.\nAsk what changed. Ask what good looks like next.\nThe role can come later.',
     'What made you look last time?',
     array['productmarketing'], null, 'Open to work signals and the coaching offer', 46.00),
    ('calls', 'talent_market', 'Where the best referrals come from',
     'The best candidates I meet were introduced by someone I had just placed.',
     E'A referral carries context a job board cannot.\nWho they worked with. What they are like under a deadline. Why they might move.\nThe ask is simple at the end of a good call.\nWho else should I be talking to.\nMost people name two.',
     'Who would you name?',
     array['hiring'], null, 'Referrals and leads from the calls agent', 44.00),
    ('manual', 'hiring_manager', 'Posting in December',
     'December is the quietest month to post a role and the best month to fill one.',
     E'Budgets are set. Candidates are reflecting.\nThe loops that run in December close in January with less competition.\nThe ones that start in January compete with every other reopened search.\nIf the headcount is approved, do not wait for the new year.',
     'Is your January role already written?',
     array['hiring'], null, 'The quarter view under Numbers', 42.00)
  ) as s (run_source, angle, topic, hook, body, close_line, hashtags, data_point, prompted_by, rank)
  where not exists (
    select 1 from content_items c
    where c.owner_id = o and c.topic_key = lower(regexp_replace(btrim(s.topic), '[^A-Za-z0-9]+', '_', 'g'))
  );
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.content_ideas_seed() from public, anon;
grant execute on function public.content_ideas_seed() to authenticated, service_role;

-- The content agent reads last week's call notes on Monday (12.1), so it carries that connection.
update public.agents set connections = array['granola', 'linkedin_read', 'claude'] where code = 'a2_content' and not ('granola' = any(connections));
