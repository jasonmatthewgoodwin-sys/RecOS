-- 0015 Settings every environment needs: the settings row, agents, send
-- policies and shared blocks. These tables take inserts by migration only.
-- Targets are seeded by db/seed/targets.sql once the owner has signed in,
-- because each target row belongs to the owner.

insert into public.app_settings (id, icp_json) values (true, '{
  "sector": "B2B SaaS",
  "company_size": "Up to about 1,000 people",
  "buyer": "VP or senior director of product marketing with 2 or 3 reports",
  "locations": ["new_york", "austin", "boston", "san_francisco", "remote_us"],
  "second_angle": "UK or European company with a US presence, global marketing head in the UK, hiring PMMs in the US",
  "excluded": ["Very large companies", "Agencies posting on behalf of clients", "Non-US roles"]
}');

-- Schedules are UK time (high-level design, section 8).
insert into public.agents (code, name, schedule, model_tier) values
  ('a1_review',    'Weekly review',        'Monday 08:17', 'standard'),
  ('a2_content',   'Content engine',       'Monday 08:58 and 09:15, Thursday 09:30', 'standard'),
  ('a3_jobs',      'Jobs pipeline',        'Collect Tuesday and Friday 13:00. Match Wednesday 07:41', 'standard'),
  ('a4_signals',   'Relationship signals', 'Friday 12:47', 'light'),
  ('a5_followups', 'Follow-up queue',      'Monday 07:30, Thursday 07:30, weekdays 08:45 for the calendar', 'standard'),
  ('a6_calls',     'Call-to-CRM',          'Monday to Thursday 19:30, Friday 16:30', 'standard'),
  ('a7_events',    'Event ideas',          '1st of the month', 'standard');

-- Section 20.2. Types with no caps are draft only, so nothing is counted.
insert into public.send_policies
  (type, label, channel, level, max_level, daily_cap, weekly_cap, per_run_cap, requires_template) values
  ('thanks_after_call',      'Thank-you after a call',  'email',    'automatic',  'automatic',  15,   60,   null, true),
  ('cv_request',             'CV request',              'email',    'automatic',  'automatic',  10,   40,   null, true),
  ('submitted_confirmation', 'Submitted confirmation',  'email',    'automatic',  'automatic',  10,   30,   null, true),
  ('interview_confirmation', 'Interview confirmation',  'email',    'one_click',  'automatic',  10,   30,   null, true),
  ('prep_pack',              'Prep pack',               'email',    'one_click',  'automatic',  10,   30,   null, true),
  ('aftercare_checkin',      'Aftercare check-in',      'email',    'one_click',  'one_click',  5,    10,   null, true),
  ('kpi_summary',            'Monday KPI summary',      'email',    'one_click',  'automatic',  1,    1,    null, true),
  ('coaching_followup',      'Coaching follow-up',      'email',    'one_click',  'one_click',  5,    15,   null, true),
  ('referral_thanks',        'Referral thanks',         'email',    'one_click',  'one_click',  5,    15,   null, true),
  ('client_nudge',           'Client nudge',            'email',    'one_click',  'one_click',  5,    10,   null, true),
  ('event_followup',         'Event follow-up',         'email',    'one_click',  'one_click',  30,   60,   null, true),
  ('intro_to_colleague',     'Intro to a colleague',    'email',    'one_click',  'one_click',  5,    10,   null, false),
  ('email_reply',            'Email reply',             'email',    'draft_only', 'draft_only', null, null, null, false),
  ('league_cadence',         'League catch-up',         'email',    'draft_only', 'draft_only', null, null, null, false),
  ('signal_congrats',        'Congratulations',         'either',   'draft_only', 'draft_only', null, null, null, false),
  ('coaching_offer',         'Coaching offer',          'either',   'draft_only', 'draft_only', null, null, null, false),
  ('speaker_invite',         'Speaker invite',          'email',    'draft_only', 'draft_only', null, null, null, false),
  ('spec',                   'Spec message',            'either',   'draft_only', 'draft_only', null, null, null, false),
  ('job_chase',              'Job chase',               'either',   'draft_only', 'draft_only', null, null, null, false),
  ('rejection',              'Rejection',               'email',    'draft_only', 'draft_only', null, null, null, false),
  ('linkedin_connect',       'LinkedIn connection note','linkedin', 'automatic',  'automatic',  10,   20,   10,   true),
  ('linkedin_message',       'LinkedIn message',        'linkedin', 'draft_only', 'draft_only', null, null, null, false),
  ('linkedin_post',          'LinkedIn post',           'linkedin', 'draft_only', 'draft_only', null, null, null, false);

-- Shared blocks (section 13.4). The ICP comes from the product spec. The
-- other six are placeholders: their text is written with Jason in Settings
-- and no agent uses them until then.
insert into public.shared_blocks (code, title, body) values
  ('icp', 'Ideal client profile',
   E'Sector: B2B SaaS.\nCompany size: up to about 1,000 people.\nBuyer: VP or senior director of product marketing with 2 or 3 reports.\nLocations: New York first, then Austin, Boston and San Francisco, plus remote US.\nSecond angle: UK or European company with a US presence, global marketing head in the UK, hiring PMMs in the US.\nExcluded: very large companies, agencies posting on behalf of clients, non-US roles.'),
  ('voice',                'Voice rules',                'Not written yet.'),
  ('post_format',          'Post format',                'Not written yet.'),
  ('note_format',          'Candidate note format',      'Not written yet.'),
  ('service_standards',    'Service standards',          'Not written yet.'),
  ('confidentiality',      'Confidentiality',            'Not written yet.'),
  ('commercial_questions', 'Commercial questions',       'Not written yet.');
