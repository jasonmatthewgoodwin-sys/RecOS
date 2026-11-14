# RecOS product spec

Nov 14, 2026 · @Jason

## 1. Executive summary

RecOS is one hosted web app, opened with a Microsoft work login, that puts every workflow, agent and number on a specialist PMM recruitment desk in one place. It replaces a spread of 10 scheduled Claude tasks, 6 or more Google Sheets, two CRMs, several Claude projects and a home-made dashboard with a single screen that says what needs doing today and whether the week is on track.

The desk is a 360 product marketing recruitment desk run from London into the US market (New York first, then Austin, Boston and San Francisco). The work splits into five jobs: winning new business, managing clients and live searches, managing candidates, building a personal brand and running events. Each job has its own tools today, and moving between them is where time and follow-up get lost.

### What RecOS does

1.  **Shows the day in one view.** KPIs against target, one inbox of things to approve, today's calls and the state of every live search.

2.  **Runs the background work.** Agents find job leads, spot hiring signals, draft content, write up calls and flag anyone who has gone quiet. Routine messages you have switched on go out on their own. Anything personal waits for your approval.

3.  **Counts the numbers automatically.** Weekly KPIs agreed with Olly are counted from real activity, so the Monday review needs no manual logging.

4.  **Keeps the CRM as the record.** Client and candidate records stay in the firm's CRM. RecOS reads from it, links to it and writes activity back.

5.  **Stays portable.** The app, its workflows, prompts and personal network data are built so they can move, while firm data stays where the firm keeps it.

### What changes on day one

| Today | With RecOS |
|----|----|
| 10 scheduled tasks reporting to email, Drive docs, push notifications and chat | 7 agents reporting to one inbox |
| 3 separate content tasks, one running daily | 3 weekly content runs in one shared format, feeding one drafts list |
| KPI numbers typed into a sheet each week | KPIs counted from activity, with manual override |
| Follow-ups remembered or swept from Outlook every other day | One follow-up queue with a due date on every person spoken to |
| A separate project and task per client search | One search workspace template, used for every search |
| Dated report files piling up in Drive | One jobs table, one signals table, one content table |

### Build approach

RecOS is built in four phases over roughly 12 weeks. Phase 0 is already running as PMM Desk with three new agents. Phase 1 moves the home screen, inbox and business development into a hosted app with Microsoft sign-in. Phases 2 and 3 add searches, candidates, content and events, then plug into whichever CRM the firm chooses when the Spott trial ends.

### Decisions needed before build

- Which CRM the firm keeps (JobAdder or Spott). The spec works with either.

- Which message types go out automatically and which wait for approval (section 17.8).

- Where the line sits between personal network data and firm data.

- What cap to put on the automated LinkedIn connection requests, which carry an account risk (section 20.5).

## Pages at a glance

RecOS has nine areas in a left-hand menu, and every page uses the same frame, shown here with the Today page open.

<img src="media/image1.png" style="width:6in;height:3.21428in" alt="RecOS screen layout · the Today page" />

RecOS screen layout · the Today page

The menu on the left never changes. The middle shows the page you picked. Clicking any person, job or item opens it in a drawer on the right, so you do not lose your place.

### Glossary of pages

| Menu area | Page | What is on the screen | What you do there |
|----|----|----|----|
| Today | Today | KPI bars across the top, the inbox, follow-ups due, today's calls, live searches, agent status | Start the day and clear what needs you |
| Inbox | Inbox | One list of everything agents have found, with filters by type and agent | Approve, edit, snooze or bin |
| Business development | Jobs and specs | A board of job leads by stage, each card showing fit and suggested candidates | Chase posts and spec candidates |
|  | Exec coaching | A list of sessions booked and done, with the answers to your commercial questions | Prep for sessions and act on what you learn |
|  | Referrals | A list of names given to you, who gave them and their stage | Contact referrals and thank the referrer |
|  | Follow-ups | A queue of people owed a next step, each with a draft | Send, snooze or close |
|  | UK to US | A company list with US hiring signals | Work the quarterly target list |
|  | Outreach campaigns | A table of campaigns with replies and calls booked | See what outreach is working |
|  | Wider business leads | A list of non-PMM leads passed to colleagues, with status and split | Pass leads on and track what they become |
| Relationships | Top 100 league | Two tables, senior leaders and A-star candidates, in three tiers with last contact and next due | See who to contact this week |
|  | Signals | A feed of job changes, promotions, funding and open-to-work alerts | Add people to the league or get in touch |
|  | Account growth | A list of current clients with other functions that hire | Decide where to introduce a colleague |
| Searches | All searches | One row per live role with stage counts, days open and a health flag | Spot searches going cold |
|  | Search workspace | Nine tabs for one search: brief, map, pipeline, calls, calibration, client updates, interviews, offer, close-out | Run a search end to end |
| Candidates | Candidates | Views for calls this week, the A-star pool, warm specs, in process and placed | Check write-ups and review new A-star suggestions |
| Content | Calendar | A week view of posts planned, drafted and posted | Plan the week's posts |
|  | Drafts and ideas | Draft posts in one format with their data points, plus an ideas backlog | Edit and approve posts |
|  | Testimonials | A pipeline of requests to clients and candidates | Ask for and track testimonials |
| Events | Events | A pipeline from idea to follow-up, with guest lists | Plan the quarterly event |
| KPIs | This week and trend | Bars and 12-week lines for each KPI, with the items behind each number | Check progress |
|  | Funnel and forecast | Conversion between stages and expected revenue by month | See where the funnel leaks |
|  | Weekly review | Last week, what was learned and next week's plan | Run the Monday review with Olly |
| Settings | Settings | Agents, send rules, targets, ICP, templates and data export | Change how RecOS behaves |

Section 8 covers navigation in detail and sections 9 to 17 specify each page.

## 2. Background and problem

The desk loses time and follow-up to context switching, because the work is spread across at least 12 tools with no single place that shows what matters today.

### The desk

3Search is a recruitment business covering sales, marketing, RevOps and creative hires. The PMM desk is a specialism inside it: product marketing hires only, into US B2B SaaS companies of up to about 1,000 people. The desk is run 360, meaning the same person wins the client, runs the search and manages the candidates. The build plan agreed on 9 November 2026 splits the commercial side in two: active business development, which is outreach, and personal branding, which is awareness.

The desk may also pick up searches outside PMM from time to time, such as customer success, sales and operating partner roles. RecOS handles those with the same search workspace and tags them separately. The desk also wins business for the rest of 3Search: UK roles with existing clients, account executive hires and other work that colleagues deliver. RecOS tracks those leads and where they were passed (section 10.9).

### Where the work lives today

| Tool | Used for |
|----|----|
| JobAdder | The firm's CRM of record. Signed placements go here |
| Spott | CRM on trial. Candidate notes, applications and campaigns for live searches |
| Outlook | Client and candidate email, calendar, Alex's weekly leads email, LinkedIn alerts |
| Granola | Notes and transcripts for every call |
| LinkedIn and Recruiter | Sourcing, job post searches, connection requests, voice notes, content |
| Source Whale and Spark | Contact enrichment and email campaigns |
| Google Drive and Sheets | KPI log, agent inbox, seen-posts log, topic logs, dated reports |
| Claude projects | One project per workflow and per client search, each with its own docs |
| Claude scheduled tasks | 10 recurring agents |
| PMM Desk | The first home screen, built 11 November |
| Calendly | Candidate call booking |
| Teams and Slack | Internal chat |

### The five problems

1.  **No single view of the day.** Agent output lands in six places: Outlook drafts, Drive docs, Drive sheets, push notifications, chat replies and the CRM. Nothing shows it all together.

2.  **Follow-up falls through.** The 9 November plan named this as the main weakness. Conversations go well, then the admin behind them slips. Two or three weeks is a long time for someone out of work.

3.  **Numbers are logged by hand.** The four weekly KPIs live in a sheet that needs filling in before each Monday review. The row for the week of 9 November was still empty two days in.

4.  **Agents overlap.** Three tasks produce LinkedIn content. Two find job posts. One sweeps Outlook for follow-ups while a follow-up section was planned separately. Each was built at a different time for a slightly different need.

5.  **Every search is rebuilt from scratch.** The Dust customer success search has its own project, search pack and Friday sync task. The other live searches have none of that, because building it per search takes too long.

### Why build it now

- The desk KPIs were agreed with Olly on 9 November and are reviewed every Monday, so there is a clear weekly test of whether the system works.

- The firm is choosing between JobAdder and Spott. Building a layer that sits above the CRM means the desk does not have to be rebuilt whichever way that goes.

- The first pieces already exist and work: PMM Desk, the inbox sheet and three new agents. RecOS turns a working prototype into a product instead of starting from a blank page.

## 3. Goals, non-goals and success measures

RecOS succeeds if the working day runs from one screen and the Monday KPI review needs no manual preparation.

### Goals

| \# | Goal | What it means in practice |
|----|----|----|
| G1 | Cut context switching | Open one app in the morning and work from it until the first call. Other tools are opened from RecOS by link, not hunted for |
| G2 | Never drop a follow-up | Every person spoken to has a next action and a date. Overdue ones are on the home screen |
| G3 | Automate the back end, not the voice | Agents find, sort, draft and remind. Routine messages send automatically under rules you set. Personal messages are approved first |
| G4 | Count KPIs from real activity | Weekly and quarterly targets update as work is done, with the source of each number visible |
| G5 | One pattern for every search | Opening a new search creates the same workspace, agents and reports each time |
| G6 | Stay CRM-neutral and portable | Works with JobAdder or Spott. The app and personal network data can move without rework |
| G7 | Keep running costs low | Agents run weekly unless a daily run clearly earns its cost |

### Non-goals

- **Not a replacement CRM.** RecOS does not hold the master record of clients, candidates, jobs or placements.

- **Not an outreach robot.** Automatic sending is limited to the message types switched on in section 17.8, with caps and a stop switch. No bulk cold outreach.

- **Not a team product in version 1.** One user. Sharing a read-only view with a manager is in scope. Multi-recruiter use is a later decision.

- **Not a LinkedIn scraper.** LinkedIn data comes in through alert emails and manual review in the user's own browser.

- **Not an invoicing or finance tool.** Fees and placements are shown for forecasting only. Billing stays in the firm's systems.

### Success measures

| Measure | Baseline (Nov 2026) | Target at 90 days |
|----|----|----|
| Tools opened before the first call of the day | 6 or more | 1, plus LinkedIn |
| Places agent output lands | 6 | 1 inbox |
| Scheduled agents | 10, with 3 overlaps | 7, no overlaps |
| Time to prepare the Monday KPI review | Manual, every week | Under 5 minutes, review only |
| People spoken to in the last 14 days with no next action | Not measured | 0 |
| Inbox items older than 7 days | Not measured | Under 5 |
| Time to stand up a new search workspace | Half a day of setup | Under 10 minutes |
| Weekly KPI targets hit (4 measures) | Not yet tracked | 3 of 4 in most weeks |
| Call notes written to the CRM within 24 hours | One search only | Every live search |

### Guardrail measures

These must not get worse as automation goes up.

- Reply rate on outreach. If it drops, messages have started to read as automated.

- LinkedIn account health: no restrictions or warnings.

- Zero messages sent outside the send policy in section 17.8.

- Zero client or candidate records held outside the CRM beyond the reference fields listed in section 19.

## 4. User, roles and weekly operating rhythm

RecOS has one primary user and is designed around a fixed weekly rhythm, so each screen answers a question that comes up at a known point in the week.

### Roles

| Role | Who | Access |
|----|----|----|
| Owner | Jason Goodwin, Associate Partner | Everything. Approves every outbound message |
| Reviewer | Olly (Oliver Amos), manager | Read-only KPI and pipeline views. Receives the Monday summary |
| Collaborators | Nick and Sandra (sales-led recruiters), Alex (leads research), Emma (A-star candidate feed) | No login in version 1. Their input arrives by email and is read by agents |
| Agents | Scheduled automations | Read sources, write to the inbox and to draft folders only |
| Builder | Whoever maintains the app | Admin access to configuration, no access to mail content |

### Working pattern

- Works 9:00 to 20:00 UK time Monday to Thursday and 9:00 to 17:00 on Friday. US calls fall in the afternoon and evening, so mornings are for admin, BD and content.

- Typical load is 6 to 10 calls a day, each recorded in Granola: candidate screens, reference calls, client updates and internal check-ins.

- 8 to 10 live searches at once, most with a weekly client call.

- BD time is planned at 10 to 15 hours a week, split between admin and conversations.

### The week RecOS is built around

| When (UK time) | What happens | RecOS screen |
|----|----|----|
| Monday 8:00 to 9:00 | KPI summary drafted for Olly. Content drafts ready | KPIs, Content |
| Monday morning | 30 minute review with Olly: 10 minutes on last week, then the plan | KPIs, weekly review |
| Monday 9:30 to 11:00 | Follow-up block. 90 minutes to follow up last week's conversations before US calls start | Follow-ups |
| Tuesday | Hiring posts report lands. Client calls | Jobs and specs, Searches |
| Wednesday morning | Jobs and specs matched to candidates. First 3 hours on BD | Jobs and specs, Top 100 |
| Wednesday 11:00 | Check-in with Olly on live roles | Searches |
| Thursday | Calls and interviews. Content posted | Searches, Content |
| Friday midday | Top 50 signals. Hiring posts report | Relationships |
| Friday 16:00 | Week's calls written up to the CRM for every search | Searches |
| 1st of the month | Event ideas | Events |
| Quarter end | Promotion and relegation of the top 100 with Olly. Quarterly targets reviewed | Relationships, KPIs |

### Jobs to be done

1.  When I sit down in the morning, show me what needs me today so I can clear it before calls start.

2.  When I finish a call, capture what was said, what I promised and who I was referred to, without me typing it up.

3.  When a job lead appears, tell me who I could spec in and give me a first draft.

4.  When someone in my network moves, gets promoted or starts looking, tell me that week.

5.  When Monday comes, show me and Olly the numbers without me collecting them.

6.  When a new search opens, give me the same setup I had for the last one.

7.  When I have 20 minutes between calls, give me the next most useful thing to do.

## 5. Current state audit

The desk runs on 10 scheduled agents, 5 reusable skills, 7 or more shared files and about 10 live client searches, all of which RecOS has to absorb.

This audit was taken on 14 November 2026 from the scheduled task list, the PMM Business plan project, Granola, Outlook, Drive and Spott.

### 5.1 Scheduled agents

| Agent | Runs (UK time) | What it does | Where output lands |
|----|----|----|----|
| Weekly PMM KPI summary for Olly | Mon 8:17 | Reads the KPI log and drafts the weekly summary | Outlook draft |
| Weekly LinkedIn drafts from Granola | Mon 8:58 | 6 to 8 anonymised post drafts from last week's calls | Outlook draft, push, email |
| PMM Content Report | Mon 9:15, weekly since 14 Nov | Researches PMM community content and drafts 2 posts | Dated Google Doc |
| Recruitment Content Report | Thu 9:30, weekly since 14 Nov | Researches recruiting news and drafts 1 or 2 posts | Dated Google Doc, push |
| LinkedIn PMM Hiring Report | Tue and Fri 13:00 | Finds PMM hiring posts, builds a report, sends connection requests with a note and leaves message drafts | Dated Google Sheet, LinkedIn, push |
| Outstanding tasks sweep | Every other day 8:00 | Finds unanswered emails and open commitments from 14 days of mail | Chat report |
| Dust CS Lead Friday sync | Fri 18:45 | Finds the week's candidate calls, imports CVs, creates records and writes structured notes | Spott, push |
| Jobs and specs | Wed 7:41, from 18 Nov | Merges Alex's leads, hiring posts and job alerts, then matches candidates | Inbox sheet, Outlook draft |
| Top 50 signals | Fri 12:47, from 20 Nov | Reads LinkedIn alerts and funding news for hiring signals | Inbox sheet, Outlook draft |
| Event ideas | 1st of month, from 1 Dec | 3 event ideas from 30 days of calls | Inbox sheet, Outlook draft |

### 5.2 Reusable skills

| Skill | What it does | When it is used |
|----|----|----|
| US market map | Turns a job intake into a tiered company map, search strings and a companies file | A role is opened or re-briefed |
| Candidate sheet enrichment | Finds candidates booked through Outlook, looks up their profiles and fills a tracker | Building or refreshing a longlist |
| Candidate pool recalibration | Re-tiers a longlist after the client gives feedback on real candidates | After a calibration or debrief call |
| Search interview prep | Briefs one candidate for an interview | Before each interview |
| Morning brief | A styled brief for the day | On request |

### 5.3 Files and stores

| File | Holds | Fed by |
|----|----|----|
| PMM Weekly KPI Log (Sheet) | One row a week: 4 KPI numbers, what was learned, next week's plan | Manual entry |
| PMM OS Inbox (Sheet) | Every agent finding, with a status | Jobs and specs, Top 50 signals, Event ideas |
| seen_posts_log (Sheet) | Hiring posts already reported | Hiring report |
| pmm_content_topics_log and recruitment_content_topics_log | Topics already covered | Content reports |
| linkedin_pmm_hiring_report\_(date) (Sheets) | One file per run | Hiring report |
| pmm_content_report\_(date) and recruitment_content_report\_(date) (Docs) | One file per run | Content reports |
| PMM Desk (hosted page) | Home screen reading the KPI log and inbox | Live from Drive |
| Project docs | Build plan with Olly, KPI dashboard setup, BD breakdown, Dust CS search pack | Claude projects |

### 5.4 Live client searches

Names below are as they appear in call notes and the CRM. Status is as discussed on 11 November and may have moved since.

| Client | Role | Type | Status on 11 Nov | Client cadence |
|----|----|----|----|----|
| Tive | Director, Product Marketing | PMM | Verbal acceptance, offer and references in progress | Weekly call |
| Dust | Product Marketing Manager | PMM | Sourcing, 3 candidates going over | Ad hoc |
| Dust | Customer Success Lead (US) | Non-PMM | 10 in play, interviews under way | Friday sync |
| GrailPay | Product Marketing Manager | PMM | 5 submitted, feedback slow | Calls being moved |
| Yoobic | Head of Product Marketing, New York (confidential) | PMM | Briefed 12 November | New |
| Diversis Capital | AI Operating Partner | Non-PMM | 6 in play, 1 at second stage | Ad hoc |
| Nitra | Marketplace sales role | Non-PMM | Dormant, ad applicants to review | Friday weekly update |
| Concept 80 | Creative roles including a YouTube strategist | Non-PMM | 4 first stages booked | Monday weekly call |
| LeadPulse | Account Executive | Non-PMM | Candidates in process | Ad hoc |
| Moneypenny | To be confirmed | To be confirmed | Stalled, likely December or later | None |

On the horizon, mentioned but not yet won: a CMO hire, a marketing restructure of 2 to 3 hires and further PMM work.

### 5.5 Manual workflows with no system behind them

1.  **Reference calls.** Run by phone, recorded in Granola, written up for the client by hand.

2.  **Offer management.** Offer terms, start dates and candidate hesitation tracked across calls and email.

3.  **Exec coaching.** LinkedIn audits and CV reviews for senior leaders. Target of 5 a week, no tracker.

4.  **Referrals.** Names given on calls. No list.

5.  **Outreach campaigns.** Built in Source Whale and Spark, with voice notes and personal messages sent by hand to first connections.

6.  **Testimonials and case studies.** Target of 3 a quarter. Requested ad hoc after placements.

7.  **Top 100 league.** Agreed in principle. No list exists yet.

8.  **Account growth.** Introducing Nick or Sandra to a client's sales leadership. Decided case by case.

9.  **Weekly client updates.** Prepared before each call from memory and the CRM.

## 6. Duplicates and consolidation plan

Eight overlaps were found in the audit. Fixing them takes the desk from 10 agents to 7, from 6 output channels to 1 and from dated files to tables.

### 6.1 The eight overlaps

| \# | Overlap | What exists today | What RecOS does instead | Saving |
|----|----|----|----|----|
| D1 | Content drafting | 3 tasks: PMM Content Report (daily), Recruitment Content Report (twice a week), LinkedIn drafts from Granola (weekly). About 10 runs a week, up to 20 drafts against a target of 2 posts | 1 Content engine with three weekly runs: calls on Monday, PMM community on Monday, recruiting news on Thursday. Every draft uses the same format and lands in one drafts list. Each research run must bring at least 3 sourced data points | 7 runs a week |
| D2 | Job lead finding | Hiring report (twice a week) plus Jobs and specs (weekly) plus Alex's email read separately | 1 Jobs pipeline. Collection twice a week, matching once. One table, one record per company and role | 1 agent, no dated sheets |
| D3 | Follow-ups | Outstanding tasks sweep every other day, plus a planned Follow-ups section, plus CRM tasks | 1 Follow-up queue fed by calls, mail and CRM tasks. Weekly deep sweep on Monday, light check on Thursday | About 5 runs a fortnight |
| D4 | KPI capture | Manual sheet entry, an agent that reads the sheet and a planned inputs-to-outputs report | KPIs counted from activity. One weekly summary. The sheet becomes an export | Manual logging removed |
| D5 | Call write-ups | A hand-built sync task for one search (Dust CS) with client IDs written into the prompt | 1 Call-to-CRM agent, driven by a list of live searches. Covers every search | Per-search setup removed |
| D6 | Agent output | Outlook drafts, Drive docs, Drive sheets, push, email, chat and CRM | 1 inbox with types and statuses. Outlook drafts only for things that will be sent | 5 channels removed |
| D7 | Dedup logs | seen_posts_log and two topic logs, each maintained by its own agent, with drift already noted | Uniqueness rules on the jobs and content tables | 3 files removed |
| D8 | Home screens | KPI dashboard (10 Nov) and PMM Desk (11 Nov) | RecOS Today screen | 1 page removed |

### 6.2 Things that look like duplicates but are kept

- **Two Monday content sources.** Call-based drafts and news-based drafts answer different needs. They merge into one run but both sources stay.

- **Tuesday and Friday collection of hiring posts.** Posts go stale in days. Collection stays twice a week. Only the matching and reporting merge.

- **JobAdder and Spott.** This is the firm's decision, not a RecOS one. Section 20 covers both.

- **Weekly client calls and the Wednesday check-in.** Both stay. RecOS produces one search status view that serves both.

### 6.3 Agent register before and after

| Before (10)                         | After (7)                    |
|-------------------------------------|------------------------------|
| Weekly PMM KPI summary for Olly     | A1 Weekly review             |
| Weekly LinkedIn drafts from Granola | A2 Content engine            |
| PMM Content Report                  | Merged into A2               |
| Recruitment Content Report          | Merged into A2               |
| LinkedIn PMM Hiring Report          | A3 Jobs pipeline (collect)   |
| Jobs and specs                      | A3 Jobs pipeline (match)     |
| Top 50 signals                      | A4 Relationship signals      |
| Outstanding tasks sweep             | A5 Follow-up queue           |
| Dust CS Lead Friday sync            | A6 Call-to-CRM, all searches |
| Event ideas                         | A7 Event ideas               |

### 6.4 Runs per week

|                         | Before       | After                  |
|-------------------------|--------------|------------------------|
| Content                 | 10           | 3                      |
| Job leads               | 3            | 3 (2 collect, 1 match) |
| Follow-ups              | 3 to 4       | 2                      |
| KPI, signals, call sync | 3            | 3                      |
| Event ideas             | 0.25         | 0.25                   |
| **Total**               | **About 19** | **About 11**           |

The content agents are the largest cost today because they run most often and do open web research each time. Cutting them from ten runs a week to three removes over a third of all agent runs.

### 6.5 One risk to manage during consolidation

The hiring report sends LinkedIn connection requests automatically, with a fixed note, to every lead it finds. LinkedIn's terms do not allow automated activity, and a restricted account would stop the desk. Some automated sending is wanted, so RecOS keeps this step as an option with three limits: a cap on requests per run, an immediate stop if LinkedIn shows any warning, and a manual queue as the fallback. The cap is the owner's decision (section 26).

## 7. Product principles

Ten rules decide every design choice in RecOS. Where a feature conflicts with one, the feature changes.

1.  **One front door.** Everything starts from the Today screen. If a task needs another tool, RecOS opens it at the right record.

2.  **The CRM is the record.** RecOS stores a link and a handful of display fields for each CRM record, and nothing more. Notes, CVs and contact details stay in the CRM.

3.  **Automate the routine, approve the personal.** Each message type has a send level: automatic, one-click or draft only. Nothing goes out above its level.

4.  **One inbox.** Every agent writes to the same queue in the same shape. No agent has its own report format.

5.  **Activity counts itself.** If a KPI needs someone to remember to log it, the design is wrong. Manual entry exists only as a correction.

6.  **Every conversation leaves with a next step.** A call cannot be marked as handled until it has a next action and a date, or is closed on purpose.

7.  **Weekly by default.** An agent runs once a week unless a faster run changes what the user does that day.

8.  **Templates over one-offs.** A new search, event or campaign starts from a template. Anything built for one client is built so the next client can use it.

9.  **Show where numbers come from.** Every count links to the items behind it, so a KPI can be checked in seconds.

10. **Plain and fast.** Pages load in under 2 seconds and read at a glance. No setting, chart or field is added without a decision it supports.

### What this rules out

| Tempting feature | Why it is out |
|----|----|
| A full contact database inside RecOS | Breaks principle 2 and the firm's data rules |
| Bulk cold outreach sent without review | Breaks principle 3. The 9 November plan was clear that generic automated messages get deleted |
| A separate dashboard per agent | Breaks principle 4 |
| Daily research agents | Breaks principle 7 unless posts are going stale |
| A custom build for each client search | Breaks principle 8 |

## 8. Information architecture and navigation

RecOS has eight top-level areas, a global search bar and a quick-capture button. Everything is two clicks or fewer from Today.

### 8.1 Site map

| Area | Pages inside it | Main question it answers |
|----|----|----|
| Today | Home | What needs me now? |
| Inbox | All items, by type, by agent | What have the agents found? |
| Business development | Jobs and specs, Exec coaching, Referrals, Follow-ups, UK to US, Outreach campaigns | Where is new work coming from? |
| Relationships | Top 100 league, Signals, Account growth | Who should I be speaking to? |
| Searches | All searches, one workspace per search, Offers and references | Where is each live role? |
| Candidates | A-star pool, Calls this week, Warm specs, Placed | Who do I have and who is moving? |
| Content | Calendar, Drafts, Ideas, Testimonials and case studies | What am I posting this week? |
| Events | Pipeline, Ideas, Guest lists | What is the next event? |
| KPIs | This week, Trend, Quarterly, Weekly review, Funnel | Am I on track? |
| Settings | Agents, Integrations, Targets, ICP, Templates, Data and privacy | How is it set up? |

### 8.2 Layout

- **Left rail** with the eight areas plus Settings. Each shows a count badge when it has open items.

- **Top bar** with global search, a quick-capture button, the current week and a sync status dot.

- **Main panel** for the page.

- **Right drawer** that slides in for any record (a person, job, search or inbox item) so the page behind stays in place. This is the main way context switching is avoided inside the app.

### 8.3 Global search

One box searches people, companies, searches, jobs, inbox items and call notes. Results from the CRM and Granola are fetched live and shown as links, so nothing is copied into RecOS to make search work. Keyboard shortcut: /.

### 8.4 Quick capture

A single button, also on the keyboard as c, opens a small form with five options. Each takes under 15 seconds.

| Capture        | Fields                           | Where it goes   |
|----------------|----------------------------------|-----------------|
| Referral       | Name, company, who referred them | Referrals       |
| Follow-up      | Person, action, date             | Follow-up queue |
| Content idea   | One line                         | Content ideas   |
| Job lead       | Company, role, link              | Jobs and specs  |
| KPI correction | Measure, number, reason          | KPIs            |

### 8.5 Deep links out

Every record carries buttons that open the source tool at the right place.

| Button       | Opens                                                     |
|--------------|-----------------------------------------------------------|
| Open in CRM  | The candidate, company or job record in JobAdder or Spott |
| Open call    | The Granola note for that call                            |
| Open thread  | The Outlook conversation                                  |
| Open profile | The LinkedIn profile, in the user's own browser           |
| Open draft   | The Outlook draft an agent prepared                       |

### 8.6 Routes

Each page has a stable address so it can be bookmarked and shared with a reviewer: /today, /inbox, /bd/jobs, /bd/coaching, /bd/referrals, /bd/follow-ups, /bd/uk-us, /relationships/league, /relationships/signals, /searches, /searches/{id}, /candidates, /content, /events, /kpis, /settings.

### 8.7 Phone view

The phone layout shows Today, Inbox and Follow-ups only, in one column. It is for clearing items between calls and on trips to New York. Everything else is desktop first.

## 9. Today screen

Today is the page opened every morning. It answers three questions in order: am I on track, what needs me, and what is happening today.

The current PMM Desk page is version 0 of this screen. RecOS keeps its layout and adds the calendar, searches and follow-ups.

### 9.1 Panels, top to bottom

| \# | Panel | Shows | Source |
|----|----|----|----|
| 1 | Week strip | 4 weekly KPIs against target with progress bars, days left in the week | KPI engine |
| 2 | Needs you today | Inbox items with status New, newest first, grouped by type, with approve, edit and bin buttons | Inbox |
| 3 | Follow-ups due | People with a next action due today or overdue, oldest first | Follow-up queue |
| 4 | Today's calls | Calls from the calendar with a prep link for each: who they are, which search, last contact | Outlook calendar, CRM |
| 5 | Live searches | One line per search: stage counts, days since last client contact, a red, amber or green flag | CRM, Granola |
| 6 | Agents | Each agent, last run, next run and whether the last run worked | Agent runner |
| 7 | Quarter strip | Events, blogs and testimonials against quarterly targets | KPI engine |

### 9.2 Behaviour

- **Loads in under 2 seconds** from cached data, then refreshes each panel in the background.

- **Empty states say what will appear and when**, for example which agent fills the panel and its next run.

- **Each panel fails on its own.** If Outlook is unreachable, the calls panel says so and the rest still shows.

- **Clearing an item takes one click** and updates the count straight away.

- **Search flags** are worked out by rule: red if a client has had no contact in 7 days or a candidate at interview stage has had none in 5, amber at 5 and 3 days, green otherwise. Thresholds are set in Settings.

- **A focus button** hides everything except panels 2 and 3 for the Monday follow-up block.

### 9.3 Call prep card

Clicking a call in panel 4 opens a prep card in the right drawer.

| Call type | What the card shows |
|----|----|
| Candidate screen | Role being discussed, the brief in 5 lines, the candidate's last contact, questions the client cares about |
| Exec coaching | The person's league tier, last contact, and the 3 or 4 commercial questions to ask |
| Client update | Stage counts, changes since the last call, candidates waiting on feedback, open questions |
| Reference call | The standard reference questions and what the client wants documented |
| Internal check-in | Live roles summary and KPI position |

### 9.4 Acceptance criteria

- The four weekly KPIs match the KPI page to the unit.

- An item approved on Today is marked Done in the inbox within 1 second.

- A call booked in Outlook appears on Today within 15 minutes.

- With every integration unreachable, the page still renders with a clear message in each panel.

- The page is usable at phone width with no sideways scrolling.

## 10. Module: business development

Business development is the first module to go live. It turns the outreach half of the 9 November plan into six working pages, each with a target and an agent behind it.

### 10.1 Ideal client profile

The ICP is stored once in Settings and used by every BD agent.

| Field | Value |
|----|----|
| Sector | B2B SaaS |
| Company size | Up to about 1,000 people |
| Buyer | VP or senior director of product marketing with 2 or 3 reports |
| Locations | New York first, then Austin, Boston and San Francisco, plus remote US |
| Second angle | UK or European company with a US presence, global marketing head in the UK, hiring PMMs in the US |
| Excluded | Very large companies, agencies posting on behalf of clients, non-US roles |

This ICP is for the PMM desk. Leads outside it are not thrown away. If a lead fits another 3Search team, it goes to the wider business list in section 10.9.

### 10.2 Jobs and specs

One list of live PMM jobs from three sources, matched against candidates worth putting forward.

**Sources**

| Source | Arrives | How it is read |
|----|----|----|
| Alex's weekly leads email | Monday evening | Read from Outlook |
| LinkedIn hiring posts | Collected Tuesday and Friday | The user's saved content searches, reviewed in their own browser |
| LinkedIn job advert alerts | Through the week | Alert emails read from Outlook |
| Manual | Any time | Quick capture |

**Features**

- One record per company and role, showing every source it came from.

- A fit score against the ICP, with the reason shown.

- Up to 3 suggested candidates per job from the A-star pool and warm specs, each with a one-line reason.

- A draft spec message of under 90 words, with no candidate surname or current employer.

- Stages: New, Chased, Replied, Meeting booked, Job won, Dead.

- Moving a job to Chased adds 1 to the posts chased KPI.

- A job that reaches Job won opens a new search workspace from the template (section 12).

- The hiring manager behind any job is offered as a candidate for the top 100 league.

**Target:** 20 posts chased a week.

### 10.3 Exec coaching

LinkedIn audits and CV reviews for senior PMM leaders, used as the main way into a relationship.

- A list of sessions booked, done and followed up, read from the calendar.

- Before each session, a prep card with the person's background and the commercial questions to ask.

- After each session, the agent pulls the answers from the call notes into fields: where they have interviewed, who else is looking, who they would refer, events they rate.

- Each answer creates a lead, a referral or a signal automatically.

- Sources of sessions: inbound LinkedIn messages, open-to-work signals and the top 100.

**The standing questions**

1.  Where have you interviewed recently that you did not join, and are they still hiring?

2.  Who else in your network is looking, or would get value from a session like this?

3.  How does your current or last company hire PMMs, and who owns it?

4.  Which events or communities are worth your time right now?

**Target:** 5 a week.

### 10.4 Referrals

Every name given on a call, held in one list so none are lost.

- Captured two ways: pulled from call notes by the Call-to-CRM agent, or added by quick capture.

- Each referral records who gave it, when and in what context.

- Stages: New, Contacted, Spoken, Added to league, Not relevant.

- The person who gave the referral gets a thank-you prompt once their referral has been contacted.

**Target:** 2 or 3 names per coaching call.

### 10.5 Follow-ups

The queue that fixes the main weakness named in the plan. Detailed in section 17 because it serves every module.

**Target:** nobody spoken to last week is without a follow-up by Monday midday.

### 10.6 UK to US

A quarterly project to build and work a list of UK and European companies hiring PMMs in the US.

- A company list built by research: UK or European headquarters, US presence, under 1,000 people, global marketing lead based in the UK.

- Signals per company: US job adverts, funding, new US leadership hires.

- Links to Alex's weekly research, which already covers UK funding rounds.

- Existing 3Search clients in the UK are flagged, so the first approach goes through whoever owns that account.

### 10.7 Outreach campaigns

A tracker for campaigns run in other tools, so results sit next to the rest of BD.

- Campaign name, audience, tool used, number contacted, replies, calls booked.

- RecOS does not send. It records what was sent elsewhere and what came back.

- Voice notes and personal messages to first connections are logged as touches against the person.

### 10.8 BD funnel

The funnel is counted by stage so the conversion between each step is visible.

| Stage       | Counted from                           |
|-------------|----------------------------------------|
| Leads found | Jobs and signals created               |
| Chased      | Jobs moved to Chased, signals actioned |
| Replies     | Replies logged                         |
| Meetings    | Client meetings in the calendar        |
| Jobs won    | New searches opened                    |
| Placements  | Placements recorded in the CRM         |

### 10.9 Wider business leads

Business development is not only for the PMM desk. Leads for the rest of 3Search, such as UK roles at existing clients and account executive hires, are captured, passed to the right colleague and tracked to an outcome.

**Where these leads come from**

| Source | Example |
|----|----|
| Client conversations | A PMM client mentions a sales, customer success or RevOps hire |
| Placements | After a PMM hire, an introduction to the head of sales or the CRO |
| Exec coaching and league calls | A leader says where the vacancies are if they are not in PMM |
| The weekly leads email | Roles outside the PMM patch, including UK roles |
| Existing UK clients | A UK client hiring in the US, or a US client hiring in the UK |
| Job posts | Non-PMM roles seen while chasing PMM posts at ICP companies |

**The page**

- One list of leads, each with company, role, function, location (UK or US), source and the contact who mentioned it.

- An owner field: the colleague or team it was passed to, and the date.

- A status: Spotted, Passed, Meeting booked, Job won, Placed or Not pursued.

- The split agreed for that account, recorded before the introduction is made.

- A prompt after every client call and placement: is there another hire here for someone else in the business?

- A warm introduction draft to the colleague, with the context from the call.

**How it connects**

- The Jobs pipeline routes non-PMM roles and UK roles at existing clients here, so they are not dropped for failing the PMM ICP.

- Account growth (section 11.6) is the planned version of this. Wider business leads is the list of what actually came up.

- If the desk keeps a lead and runs the search itself, it opens a normal search workspace tagged as non-PMM.

**Measures**

| Measure | Definition |
|----|----|
| Leads passed | Leads handed to a colleague in the period |
| Meetings from passed leads | Client meetings that followed |
| Jobs won from passed leads | Searches opened by colleagues |
| Split revenue | The desk's share of fees on placements from passed leads |

These sit beside the PMM desk's own KPIs on the KPI page and in the Monday review, so cross-selling is visible and credited.

## 11. Module: relationships and the top 100 league

The league is a list of 100 people, kept warm on a set cadence, whose purpose is commercial: 50 senior leaders who will build teams and 50 A-star candidates who will fill them.

The plan is explicit that this must not become 100 people who simply like the recruiter. Every conversation should produce something: a job, a referral, market information or a name.

### 11.1 Structure

| Half | Who | Why they are on it |
|----|----|----|
| Senior leaders (50) | VPs, heads and senior directors of product marketing at ICP companies | They are, or will be, hiring managers |
| A-star candidates (50) | The best mid-level PMMs in the market, whether or not they are looking | Engagement is hard to win late, so the relationship is built early |

Each half is split into three tiers.

| Tier | Size per half | Contact cadence | What they get |
|----|----|----|----|
| Premier League | 20 | Every 2 to 3 weeks | Calls, coaching, event invites, referrals, first sight of content |
| Championship | 15 | Monthly | A personal message or call, event invites, content |
| League One | 15 | Every 6 to 8 weeks | A message worth reading, newsletter or salary guide |

Tier sizes and cadences are settings, and are a starting point to change after the first quarter.

### 11.2 What counts as a touch

A touch is a real exchange: a call, a coaching session, a meeting, an event invitation or a personal message that got a reply. A like or a comment does not count. Touches are detected from Granola calls, Outlook mail and calendar, and can be logged by hand for LinkedIn messages and voice notes.

### 11.3 League page

- A table per half with tier, name, company, role, last touch, next due date and a status of on track, due or overdue.

- Sort by most overdue by default.

- A row opens the person in the right drawer with their touch history, open follow-ups, referrals given and any signals.

- A commercial value column: jobs briefed, referrals given, introductions made. This is what decides promotion.

- Weekly, the page proposes who to contact this week to stay on cadence, capped at a number that fits the BD hours available.

### 11.4 Signals

Signals are reasons to add someone to the league or to contact someone already on it.

| Signal | Strength | Suggested action |
|----|----|----|
| Started a new VP or head of PMM role in the last 90 days | Highest | Congratulate, offer market view, add to league |
| Promoted into a VP or head of PMM role | High | Same as above |
| Their company has just raised funding | High | Get in touch about hiring plans |
| Their company is advertising PMM roles | High | Chase the job, add the hiring manager |
| Has started looking for work | Medium | Offer exec coaching |
| Placed by the desk in the past | Medium | Keep warm, ask for a testimonial and referrals |
| Would be a strong event speaker | Medium | Invite to speak |
| Referred by someone on the league | Medium | Contact with the referrer's name |

Signals arrive once a week on Friday from LinkedIn alert emails and Alex's funding research. Each lands in the inbox with a short draft message.

### 11.5 Promotion and relegation

Once a quarter, with Olly, the league is reviewed.

- RecOS proposes moves from the data: promote people with commercial value and regular contact, relegate people with no reply across two cadence cycles.

- People who change to a role outside the ICP are flagged for removal.

- Candidates who are placed move to a Placed list with a slower cadence.

- The review produces a one-page summary: who moved, why and the commercial value from each tier.

### 11.6 Account growth

A short page listing current clients where a wider relationship is possible.

- For each client: who the contact reports to, which other functions hire, and whether Nick or Sandra has been introduced.

- The split agreed in principle is recorded per account so it is clear before any introduction is made.

- Decided case by case. RecOS prompts the question after each placement and does not automate the introduction.

### 11.7 Where this data lives

The league is network data: names, roles, companies, tiers and touch dates. Whether it may live in RecOS or must live in the CRM is an open question for the firm (section 26). The design works either way: as a RecOS table, or as a CRM list that RecOS reads and writes.

## 12. Module: clients and live searches

Every live search gets the same workspace, built from one template, so the setup that exists for one client today exists for all of them.

### 12.1 Searches list

One row per search, sorted by priority.

| Column | Shows |
|----|----|
| Client and role | With a confidential flag where needed |
| Priority | Focus, Active, Maintenance or Dormant, set weekly with Olly |
| Stage counts | Sourced, Spoken, Submitted, First stage, Later stages, Offer |
| Days open | Since the brief |
| Last client contact | Days since the last call or email |
| Waiting on | Client feedback, candidate availability or the desk |
| Next step | One line and a date |
| Health | Red, amber or green by rule |
| Forecast | Expected close month and confidence, for the desk forecast |

The priority bands come from how the desk already talks about its roles: a small number in focus, some ticking over and some dormant until the client moves.

### 12.2 Search workspace template

Opening a search creates a workspace with nine tabs.

| Tab | Contents | Fed by |
|----|----|----|
| Brief | Role, level, location, compensation range, must-haves, interview process, who decides | Intake call notes |
| Market map | Tiered target companies with reasons and search strings | US market map skill |
| Pipeline | Candidates by stage, read from the CRM | CRM |
| Calls | This search's candidate calls with a write-up status for each | Granola, Call-to-CRM agent |
| Calibration | Client reactions to real candidates and the updated spec | Candidate pool recalibration skill |
| Client updates | A draft weekly update: stage counts, movement, blockers, questions | Generated before each client call |
| Interviews | Schedule, prep sent, feedback received or awaited | Calendar, CRM |
| Offer and references | Offer terms, references taken, start date, risks | Reference call notes |
| Close-out | Placement record, testimonial request, referral ask, account growth prompt | Checklist |

### 12.3 Search lifecycle

The stages follow standard recruitment practice so the numbers can be compared across searches.

1.  **Intake.** Briefing call recorded. Brief tab filled from the notes. Unknowns listed as questions for the client.

2.  **Map.** Market map built. Longlist started.

3.  **Source.** Outreach in the CRM and LinkedIn. Candidate calls booked.

4.  **Screen.** Calls held. Notes written to the CRM in the standard format within 24 hours.

5.  **Submit.** Shortlist sent. Client feedback tracked with a clock on it.

6.  **Interview.** Prep sent before each stage. Feedback chased after each stage.

7.  **Offer.** References, offer terms, competing processes and notice period tracked.

8.  **Close.** Placement recorded in the CRM of record. Start date and check-ins scheduled.

9.  **Aftercare.** Check-ins at week 1, month 1 and month 3. Testimonial and referral requests.

### 12.4 Standard call note format

The structured note already used for one search becomes the default for all. Sections can be adjusted per search.

- **Introduction:** location, background, career in a line, availability.

- **Reason for leaving:** active or passive, what is prompting a move, what they would move for.

- **Main experience:** roles in order, with detail on the most relevant. Role-specific points set in the brief.

- **Compensation and location:** current package, expectations, other processes, notice, working pattern, right to work.

Rules carried over from the existing task: the call is the main source and the CV fills gaps, nothing is invented, anything not said is written as not stated, and no duplicate records are created.

### 12.5 Feedback clock

Slow client feedback is a recurring problem. Each submission starts a clock.

| Days without feedback | What happens |
|----|----|
| 2 working days | A nudge is drafted for the client |
| 4 working days | The search turns amber and the item appears on Today |
| 7 working days | The search turns red. A draft to the client notes the risk of candidates leaving the process |

### 12.6 References and offers

- Reference calls use a fixed question set: working relationship, strengths, development areas, concerns, would they rehire.

- A reference summary for the client is drafted from the call notes for approval.

- The offer tracker records base, bonus, equity, start date, progression points, competing offers and what would swing the decision.

- Risks are listed in plain words, such as a competing process or hesitation after meeting the team.

### 12.7 Weekly client update

Before each client call, RecOS drafts a one-page update: where each candidate stands, what changed since last week, what is needed from the client and the plan for the week ahead. It takes its numbers from the pipeline tab. It is a draft for the call, not something sent on its own.

### 12.8 Search metrics

| Metric | Definition |
|----|----|
| Time to shortlist | Days from brief to first submission |
| Submission to first interview | Share of submitted candidates who get a first interview |
| First interview to offer | Share of first-stage candidates who reach offer |
| Offer acceptance | Share of offers accepted |
| Time to fill | Days from brief to acceptance |
| Client response time | Average days to feedback on a submission |
| Fill rate | Share of searches opened that end in a placement |

### 12.9 Non-PMM searches

Searches outside product marketing use the same workspace. They are tagged so that BD reporting for the PMM desk can include or leave them out.

## 13. Module: candidates

The candidates module shows who the desk has, who is moving and who is owed something, without holding candidate records itself.

### 13.1 Views

| View | Shows | Source |
|----|----|----|
| Calls this week | Every candidate call with write-up status: written to CRM, CV received, added to a search, follow-up set | Granola, CRM |
| A-star pool | The 50 A-star candidates from the league, plus new suggestions from the weekly A-star feed | League, Emma's feed |
| Warm specs | Strong candidates worth putting in front of companies proactively | Flagged by hand |
| In process | Candidates at interview or offer across all searches | CRM |
| Waiting on me | Candidates owed feedback, a CV request, prep or a decision | Follow-up queue |
| Placed | Placed candidates with aftercare dates | CRM |

### 13.2 Call write-up checklist

Each candidate call shows five ticks. The Call-to-CRM agent completes the first four where it can and reports what is missing.

1.  Record exists in the CRM, with no duplicate.

2.  CV attached, or requested if missing.

3.  Structured note written and linked to the candidate and the search.

4.  Added to the right search at the right stage.

5.  Follow-up set with a date.

Calls that are not clearly for a known search are listed as needing confirmation and are not written up until confirmed.

### 13.3 A-star feed

The weekly feed of 10 to 15 strong candidates, built by a colleague, is reviewed inside RecOS.

- Each suggestion shows as a card with good and not good buttons.

- Good adds the person to the A-star half of the league at League One and to the relevant outreach sequence in the CRM.

- The 5 new A-star candidates a week KPI counts people marked good and then spoken to.

### 13.4 Candidate experience standards

These are service levels the system enforces through the follow-up queue. They reflect accepted good practice in agency recruitment.

| Moment | Standard |
|----|----|
| After a first call | Follow-up message within 1 working day |
| After submitting to a client | Candidate told the same day |
| After an interview | Candidate called within 1 working day, with or without client feedback |
| Client says no | Candidate told within 1 working day, with a reason where one was given |
| Candidate out of work | Contact at least every 2 weeks while active |
| After placement | Check-ins at week 1, month 1 and month 3 |

### 13.5 Interview prep

- Before each interview, a prep pack is drafted from the brief, the interviewer's background and earlier feedback on the role.

- Prep packs are sent by the user from Outlook.

- After the interview, a debrief call is prompted and the feedback is captured to the search.

### 13.6 Matching

Matching candidates to jobs in Jobs and specs uses only what RecOS is allowed to read.

- In version 1: the A-star pool, warm specs and recent call notes.

- Once the CRM is connected: a live CRM search by title, location and sector, with results shown as links.

- A match is always a suggestion with a reason. It is never sent to a client without the candidate's agreement, which is recorded before any spec goes out.

### 13.7 What is not stored

CVs, contact details, compensation details and call notes are not stored in RecOS. Each candidate appears as a name, a current title, a CRM link and status fields. Section 21 sets out the full list.

## 14. Module: content and personal brand

Three weekly content runs share one draft format and feed a single calendar, so two good posts go out every week with less reading and less cost.

### 14.1 Targets

| Measure | Target |
|----|----|
| LinkedIn posts | 2 a week to start, rising towards 1 a day |
| Mix | 2 or 3 personal brand posts for each job post |
| Blog posts for the website | 3 a quarter |
| Testimonials or case studies | 3 a quarter |
| Video | To explore |

### 14.2 Voice rules

These are carried over from the existing content tasks and stored once in Settings.

- Written as a recruiter who sees many PMMs and many hiring processes. Never as an in-house PMM.

- Two subjects only: PMM hiring, careers and the talent market, or recruitment and hiring in general.

- Lessons from non-PMM searches are reframed into one of those two subjects, with the specifics removed.

- Audience: founders, CMOs, hiring managers and senior PMM candidates.

- First line under 15 words and able to stand alone. 40 to 90 words for short posts. No emojis. At most 2 hashtags.

- No client, candidate or company named. Figures rounded. Anything that cannot be made anonymous is dropped.

- Plain British English with a Northern voice, written for American readers.

### 14.3 Content engine

Three runs a week, one per source, all writing drafts in the same format.

| Source | What it looks at | Typical output |
|----|----|----|
| Calls | Last week's Granola notes | Lessons on hiring, levelling, compensation, candidate behaviour |
| PMM community | Product marketing publications, communities and newsletters | A hiring-manager angle on what PMMs are discussing |
| Recruiting news | Layoff trackers, hiring surveys, regulation, job market data | A talent-market angle, with unconfirmed items flagged |

Each run adds its drafts to one list, ranked together, with a short list of themes held for later. Topics used in the last 8 weeks are excluded by rule.

**Schedule**

| Run | When (UK time) | Changed on 14 November |
|----|----|----|
| Calls | Monday 8:58 | No change |
| PMM community | Monday 9:15 | Was daily, now weekly, with data points added |
| Recruiting news | Thursday 9:30 | Was twice a week, now weekly, with data points added |

**One draft format**

Every draft from every run follows the same shape, so drafts can be compared and ranked side by side.

| Part | Rule |
|----|----|
| Hook | Line 1, under 15 words, a clear and slightly contrarian opinion, on its own line |
| Body | 40 to 90 words in short lines with white space |
| Close | One line: a takeaway or a question that invites comments |
| Style | No emojis, 0 to 2 hashtags, plain British English for American readers |
| Confidentiality | No client, candidate or company named |
| Angle label | Hiring manager, talent market or candidate. For you only, not posted |
| Data point label | The number used and its source link. For you only |
| Source label | Which call, article or report prompted it. For you only |

**Data points**

The two research runs must each find at least 3 hard numbers from the last 30 days, each with a link, and every research draft must use one. If fewer than 3 can be found, the run says so and invents nothing.

| Data point | Where it comes from |
|----|----|
| PMM job postings by level and city | Job boards and LinkedIn job counts for New York, Boston, Austin and San Francisco |
| Salary bands on PMM adverts | Adverts in pay-transparency locations such as New York, California, Colorado and Washington |
| PMM and marketing survey figures | Community and analyst reports |
| Tech hiring, layoffs and funding | Layoff trackers, funding news, official US job openings and hiring releases |
| The desk's own numbers | Anonymised counts from RecOS: roles seen, time to shortlist, interview stages, offer acceptance |

The last row is the one nobody else has. Once RecOS has a quarter of data, the desk's own anonymised numbers become the strongest source for posts and for a market report to share with the league.

### 14.4 Pages

- **Calendar.** A week view with planned, drafted, approved and posted items. Posting is done by hand on LinkedIn, then marked as posted, which counts towards the KPI.

- **Drafts.** Each draft with edit, approve and bin. Edits are kept so the voice rules can be refined.

- **Ideas.** A backlog fed by quick capture, held themes and event ideas.

- **Performance.** Impressions, comments and inbound messages per post, entered by hand weekly in version 1.

- **Testimonials and case studies.** A pipeline of requests: who was asked, when, status and where the result was used.

### 14.5 Testimonial trigger

Every placement creates two requests in the close-out tab: one to the client and one to the candidate. Each has a draft ask and a suggested date, usually after the start date. A strong placement story is also offered as a case study outline for the website.

### 14.6 Blog and website

- Blog posts are drafted from the two or three strongest themes each month.

- The firm's marketing lead is the route for publishing on the website.

- A small public PMM site, listing live PMM roles and content, is noted as a later idea and is outside version 1.

### 14.7 Content to pipeline

Inbound messages that follow a post are logged against that post. This shows which subjects bring in coaching requests, candidates and client conversations, and it feeds exec coaching in section 10.

## 15. Module: events and community

One event a quarter for senior product marketing leaders, planned from a single pipeline page and built on themes that come from real conversations.

### 15.1 Why events sit in RecOS

Events are the highest-effort part of personal branding and the one most likely to slip. They also touch every other module: the guest list comes from the league, speakers come from signals, themes come from calls and attendance creates touches and follow-ups.

### 15.2 Event pipeline

| Stage | What is decided | Typical timing before the event |
|----|----|----|
| Idea | Theme, angle and format | 10 to 12 weeks |
| Planned | City, date, venue, budget, co-host if any | 8 weeks |
| Speakers confirmed | 2 or 3 speakers or a host | 6 weeks |
| Invites out | Guest list drawn from the league and ICP | 4 to 5 weeks |
| Final numbers | Confirmations chased, reminders sent | 1 week |
| Held | Attendance recorded | Event day |
| Followed up | Every attendee contacted | Within 3 working days |

### 15.3 Event record

- Name, city, date, format (dinner, breakfast round table, panel, happy hour) and venue.

- Theme and one-line pitch.

- Speakers, each linked to their league record.

- Guest list with invited, accepted, declined, attended and no-show.

- Budget and actual cost.

- Outcomes: new contacts, coaching sessions booked, jobs briefed, referrals.

### 15.4 Event ideas

On the 1st of each month an agent reads 30 days of call notes and proposes 3 ideas. Each has a working title, the angle, why it would draw VPs and heads of PMM, the best city and format, and 2 or 3 speaker suggestions. Speakers must be people already met or discussed, or well-known public names in the field. No client or candidate is named as the source of a theme.

### 15.5 Guest list builder

- Starts from the league, filtered by city and tier.

- Adds people with recent signals in that city, such as new VPs.

- Shows a balance of hiring managers to candidates, with a default of two thirds hiring managers.

- Produces a list to invite by hand. Invitations count as touches.

### 15.6 After the event

- Each attendee gets a follow-up in the queue with a draft that refers to the event.

- People who accepted and did not attend get a lighter follow-up.

- A content prompt is created: one post about the event and one on the main theme discussed.

- A short review records what worked, cost per attendee and commercial outcomes at 30 and 90 days.

### 15.7 Community

A recurring community was discussed and set aside for now because of the time needed to nurture one. RecOS keeps a simple marker on league members who attend more than one event. If that group grows, it becomes the base for a community later.

### 15.8 Cities

New York is the default. Boston and Austin are the next two, because the business already has clients or people on the ground there. San Francisco is held back until the time difference can be worked around.

## 16. Module: KPIs and reporting

KPIs are counted from activity in the app, shown against the targets agreed with Olly and turned into the Monday summary without manual entry.

### 16.1 Weekly input KPIs

These four were agreed on 9 November 2026.

| KPI | Weekly target | Counted when | Source |
|----|----|----|----|
| Job posts chased | 20 | A job in Jobs and specs is moved to Chased | Jobs table |
| Exec coaching calls | 5 | A call tagged as coaching is held | Calendar, Granola |
| LinkedIn posts | 2 | A content item is marked as posted | Content calendar |
| New A-star candidates | 5 | A candidate marked good is spoken to for the first time | A-star feed, Granola |

### 16.2 Quarterly KPIs

| KPI | Quarterly target | Counted when |
|----|----|----|
| Events | 1 | An event is marked as held |
| Blog posts | 3 | A blog is marked as published |
| Testimonials or case studies | 3 | A testimonial is marked as received |

### 16.3 Output KPIs

Inputs only matter if they turn into outputs. The plan with Olly asks for a report that links the two. RecOS tracks these outputs alongside the inputs.

| Output | Definition |
|----|----|
| Client meetings | First meetings with a hiring manager or buyer |
| Jobs won | New searches opened from desk BD |
| Shortlists sent | First submissions on a search |
| First interviews | Candidates reaching first stage |
| Offers | Offers made |
| Placements | Offers accepted |
| Revenue | Fees on placements, against the desk target set with Olly |
| Referrals received | Names captured |
| League on cadence | Share of the top 100 contacted within their tier's window |
| Follow-ups on time | Share of follow-ups completed by their due date |

### 16.4 Ratios

Ratios show where the funnel leaks. They are shown on a rolling 8-week basis because weekly numbers are too small to read.

| Ratio                           | Reads as                                  |
|---------------------------------|-------------------------------------------|
| Posts chased to replies         | Is the first message working?             |
| Replies to meetings             | Is the follow-up working?                 |
| Meetings to jobs won            | Is the pitch working?                     |
| Coaching calls to referrals     | Are the commercial questions being asked? |
| Submissions to first interviews | Is the shortlist quality right?           |
| First interviews to offers      | Is the brief right?                       |
| Offers to acceptances           | Is the close right?                       |

### 16.5 Pages

- **This week.** The four inputs against target, with the items behind each number one click away.

- **Trend.** Each KPI by week for the last 12 weeks.

- **Quarterly.** The three quarterly targets and the output KPIs.

- **Funnel.** The BD funnel and the search funnel with conversion between stages.

- **Forecast.** Live searches with expected close month and confidence, summed against the desk target.

- **Weekly review.** The page used in the Monday meeting.

### 16.6 Weekly review page

The Monday review is 30 minutes: 10 on last week, then the plan. The page follows that shape.

1.  Last week's four inputs against target.

2.  Outputs and anything that moved in the funnel.

3.  What was learned, written by the user in two or three lines.

4.  What changes this week.

5.  Next week's plan, including which quarterly item gets time.

The weekly review agent fills items 1 and 2 and drafts the summary email to Olly at 8:17 on Monday. Items 3 to 5 are prompts for the user. If they are empty, the draft says so and does not make anything up.

### 16.7 Manual correction

Any KPI can be corrected by hand with a reason. Corrections are shown with a marker so a number that was typed in can be told apart from one that was counted.

### 16.8 Reviewer view

Olly can be given a read-only link to the KPI pages and the searches list. No inbox, mail, call notes or candidate detail is visible in that view.

### 16.9 Export

The KPI log continues to be written to the existing Google Sheet once a week, so the history is kept in a format that outlives the app.

## 17. Inbox and approval flow

The inbox is the one place agents put their work and the one place the user approves it. The follow-up queue sits beside it and uses the same pattern.

### 17.1 Item types

| Type | Created by | Typical action |
|----|----|----|
| Job lead | Jobs pipeline | Chase, spec a candidate or bin |
| Signal | Relationship signals | Add to league, get in touch, offer coaching or bin |
| Content draft | Content engine | Edit, approve for the calendar or bin |
| Event idea | Event ideas | Pick for next quarter or hold |
| Call write-up | Call-to-CRM | Confirm the search, check the note, request the CV |
| Follow-up | Follow-up queue | Send, snooze or close |
| Referral | Call-to-CRM, quick capture | Contact or bin |
| Client nudge | Feedback clock | Send or snooze |
| System notice | Agent runner | Fix an integration or re-run an agent |

### 17.2 Item shape

Every item has the same fields, which is what lets one screen handle all of them.

| Field            | Purpose                                              |
|------------------|------------------------------------------------------|
| Type and agent   | What it is and where it came from                    |
| Title            | One line that can be read at a glance                |
| Who and where    | Person, company, role and location, where they apply |
| Why it matters   | One or two lines of reasoning                        |
| Suggested action | What the agent thinks should happen next             |
| Draft            | The message, post or note, ready to edit             |
| Source links     | The email, post, call or record behind it            |
| Status           | New, Approved, Done, Snoozed or Binned               |
| Dates            | Created, due, snoozed until, actioned                |

These fields match the columns already in the PMM OS Inbox sheet, so existing items carry over unchanged.

### 17.3 States and actions

1.  **New.** Shown on Today and in the inbox.

2.  **Approved.** The user accepts the suggestion. What happens next depends on the message type's send level in section 17.8.

3.  **Done.** The user confirms the action happened. This is the point at which KPIs count.

4.  **Snoozed.** Hidden until a chosen date.

5.  **Binned.** Closed with an optional reason. Reasons are used to tune the agent.

Keyboard shortcuts: a approve, e edit, d done, s snooze, x bin, j and k to move between items.

### 17.4 Rules

- An item never disappears without the user acting on it.

- Duplicates are merged on arrival: same company and role for jobs, same person and signal type within 30 days for signals.

- Items older than 14 days are marked stale and offered for bulk clearing.

- Bulk actions apply to a filtered list, such as binning all job leads outside the ICP.

- Every edit to a draft is kept alongside the original, to improve prompts over time.

### 17.5 Follow-up queue

The queue is built from three sources and worked in one list.

| Source | How a follow-up is created |
|----|----|
| Calls | Every external call creates a follow-up due the next working day, with a draft based on the call notes |
| Email | The Monday sweep finds unanswered requests and commitments made in sent mail, checking sent items before listing anything |
| CRM tasks | Open tasks assigned to the user are shown alongside |

Rules carried over from the existing sweep, because they were learned the hard way:

- Nothing is listed as outstanding on the evidence of the inbox alone. Sent mail is always checked first.

- Items handled by phone, LinkedIn or in person can be marked as handled offline and are not raised again.

- Requests the user is waiting on from others are shown separately as chases, after 5 days of silence.

- Automated mail, booking confirmations and newsletters are ignored.

### 17.6 Monday follow-up block

A focus view for the Monday block shows everyone spoken to the previous week, grouped by type of call, with a draft for each. Most drafts are the same short message with two details changed. The block is a 90 minute timebox. Anything left moves to Thursday's light check, and the time taken is recorded.

### 17.7 Acceptance criteria

- An agent run of 20 items appears in the inbox within 1 minute of the run finishing.

- No two open items refer to the same job or the same signal.

- Marking a job lead Done raises the posts chased KPI by exactly 1.

- A follow-up created from a call links to that call's notes.

- Nothing is sent to anyone outside the firm except under the send policy in section 17.8.

### 17.8 Send policy

Some messages go out automatically. Each message type has one of three send levels, set in Settings and changeable at any time.

| Level | What happens | Use for |
|----|----|----|
| Automatic | Sent without review, inside caps, and logged | Routine, low-risk messages where speed matters more than wording |
| One-click | Drafted and queued. One click sends it from RecOS | Messages that are mostly standard with a personal detail |
| Draft only | Left as a draft for you to edit and send yourself | Anything commercial, sensitive or relationship-led |

**Suggested starting levels**

| Message type | Channel | Suggested level | Why |
|----|----|----|----|
| Thank-you and next steps after a first candidate call | Email | Automatic | Standard wording, speed matters |
| CV request after a call | Email | Automatic | Standard wording |
| Interview confirmation and prep pack | Email | Automatic once the prep is approved for that role | Same pack per stage |
| Confirmation to a candidate that they were submitted | Email | Automatic | A service standard |
| Aftercare check-ins at week 1, month 1 and month 3 | Email | One-click | Light personal touch needed |
| Monday KPI summary to Olly | Email | Automatic or one-click | Internal |
| Follow-up after exec coaching | Email | One-click | Carries the referral ask |
| League cadence messages | Email or LinkedIn | Draft only | The relationship is the point |
| Job post chase and spec messages | Email or LinkedIn | Draft only | First impression with a buyer |
| Client nudges for feedback | Email | One-click | Tone depends on the client |
| Rejections | Email or call | Draft only | Should be personal |
| LinkedIn connection request with a note | LinkedIn | Automatic, capped | Already running today. See the limits below |
| LinkedIn messages, InMails and voice notes | LinkedIn | Draft only | Highest account risk and most personal |
| LinkedIn posts | LinkedIn | Draft only, posted by hand | Public and in your name |

These are a starting point. Which types move to automatic is your decision, listed as an open question in section 26.

**Safeguards on automatic sending**

- **Templates are approved first.** A message type can only be set to automatic once its template has been approved. The agent fills in names and details and cannot change the wording.

- **Caps.** A daily and weekly limit per message type. LinkedIn connection requests start low, for example 10 per run and 20 a week, well under what a person would send by hand.

- **A stop switch.** One control in Settings pauses all automatic sending at once.

- **Automatic pause.** Sending stops on its own if LinkedIn shows a warning or restriction, if an email bounces repeatedly, or if someone replies asking not to be contacted.

- **Checks before each send.** Do-not-contact flags, duplicates and anyone messaged in the last 7 days are skipped.

- **Sending hours.** Messages go out during the recipient's working day in their time zone.

- **A send log.** Every automatic message is listed with who, what and when, and appears on Today as sent while you were away.

- **No bulk cold outreach.** Automatic sending covers people already in a conversation with you, plus capped connection requests. Campaigns to cold lists stay in the outreach tools built for them.

**LinkedIn in particular**

LinkedIn's terms do not allow automated activity on a member account, and restrictions are applied without warning. Automated connection requests can continue, but they remain the single action most likely to cost the desk its main channel. The cap, the automatic pause and a weekly check of account health are what keep the risk low.

## 18. Agents and automation

Seven agents do the background work. Each has one job, one schedule, a fixed list of things it may read and a fixed list of places it may write.

### 18.1 Agent register

| ID | Agent | Schedule (UK time) | Reads | Writes |
|----|----|----|----|----|
| A1 | Weekly review | Mon 8:17 | KPI counts, searches, calendar | KPI summary, Outlook draft to Olly |
| A2 | Content engine | Calls Mon 8:58, PMM Mon 9:15, recruiting Thu 9:30 | Last week's call notes, PMM community sources, recruiting news, topics used | Drafts in one format to the inbox, with data points |
| A3 | Jobs pipeline | Collect Tue and Fri 13:00, match Wed 7:41 | Alex's leads email, hiring posts, job alert emails, A-star pool, warm specs | Jobs table, job lead items with matches and drafts |
| A4 | Relationship signals | Fri 12:47 | LinkedIn alert emails, funding research, league | Signal items with drafts, league due list |
| A5 | Follow-up queue | Mon 7:30 deep, Thu 7:30 light, plus after each call | Call notes, Outlook inbox and sent items, CRM tasks | Follow-up items with drafts |
| A6 | Call-to-CRM | Mon to Thu 19:30, Fri 16:30 with a catch-up | Call notes, calendar, CVs received by email, live searches list | CRM records and notes, referrals, write-up items |
| A7 | Event ideas | 1st of month 10:13 | 30 days of call notes | 3 event idea items |

### 18.2 On-demand actions

These run when asked, from a button on the relevant page. They are the existing skills, attached to the place they are used.

| Action | Where the button is | What it produces |
|----|----|----|
| Build market map | Search workspace, Map tab | Tiered companies, search strings, companies file |
| Enrich longlist | Search workspace, Pipeline tab | Titles, companies, locations and profile links for booked candidates |
| Recalibrate pool | Search workspace, Calibration tab | The longlist re-tiered against client feedback |
| Interview prep | Search workspace, Interviews tab | A prep pack for one candidate |
| Client update | Search workspace, Client updates tab | A draft weekly update |
| Reference summary | Search workspace, Offer tab | A client-ready summary of a reference call |
| Call prep | Today, calls panel | A prep card for the next call |

### 18.3 Guardrails

Every agent follows the same rules. They are enforced by permissions, not only by prompt.

1.  **Sending by policy.** Agents send only the message types set to automatic in section 17.8, inside their caps. Everything else is left as a draft.

2.  **No CRM deletes.** Agents can create and update records and add notes. They cannot delete or merge.

3.  **No invention.** Anything not found in a source is written as not stated. Figures, motivations and personal details are never guessed.

4.  **Confidentiality in content.** No client, candidate or company is named in any draft meant for public posting.

5.  **Check before creating.** A record is looked up by name and email before a new one is made.

6.  **Uncertain means ask.** Anything the agent cannot place with confidence becomes a needs-confirmation item.

7.  **Source on everything.** Each item links to the email, call or page it came from.

8.  **Stop on failure.** If a source cannot be read, the agent reports that plainly and does not return an empty result as if nothing was found.

### 18.4 Run log

Each run records when it started and finished, what it read, how many items it created, how many were merged as duplicates, any errors and an estimate of cost. The log is visible in Settings and summarised in the agents panel on Today.

### 18.5 Failure handling

| Failure | Response |
|----|----|
| A source is unreachable | Retry once after 10 minutes, then raise a system notice |
| A run fails twice in a row | Agent is marked red on Today with the reason |
| An agent returns nothing for 3 runs | A notice asks whether the source has changed, for example alerts no longer arriving |
| A sign-in has expired | A notice with a reconnect link |

### 18.6 Cost control

- Weekly by default. The only daily agent is Call-to-CRM, because notes written within 24 hours are a service standard.

- Each agent has a monthly budget. At 80 per cent a notice is raised. At 100 per cent the agent pauses until approved.

- Agents that only read and sort use a cheaper, faster model. Agents that draft for people to read use a stronger one.

- Research agents keep a list of sources and stop when those are read, with no open-ended browsing.

- Any agent can be run by hand from Settings.

### 18.7 Prompts as configuration

Each agent's instructions are stored as editable text in Settings with version history. The ICP, voice rules, note format and service standards are shared blocks that agents refer to, so changing the ICP once changes it everywhere.

### 18.8 Improving agents over time

- Bin reasons and draft edits are collected per agent.

- Once a month a short report shows approval rate, edit rate and the most common bin reasons for each agent.

- An agent with an approval rate under 30 per cent for a month is reviewed: its prompt is changed, its sources are changed or it is switched off.

## 19. Data model

RecOS owns 14 tables of its own and holds references, not copies, to records that belong in the CRM.

### 19.1 Three kinds of data

| Kind | Examples | Where it lives |
|----|----|----|
| Firm records | Candidates, client contacts, companies, jobs, applications, placements, CVs, call notes | The CRM. RecOS stores an ID, a link and a few display fields |
| Desk operations | Inbox items, follow-ups, KPIs, agent runs, content, events, settings | RecOS |
| Network data | The league, signals, referrals, job leads from public sources | RecOS by default, or a CRM list if the firm prefers (section 26) |

### 19.2 Tables RecOS owns

| Table | One row is | Key fields |
|----|----|----|
| inbox_items | A thing an agent found | type, agent, title, person, company, role, location, source, link, why, suggested_action, draft, status, dates |
| follow_ups | A next action owed to someone | person_ref, reason, source_call or source_email, draft, due, status, handled_offline |
| job_leads | A live job at a company | company, role, location, sources, fit_score, hiring_manager, stage, matched_candidates, first_seen, chased_on |
| league_members | A person on the top 100 | person_ref or name, company, role, half, tier, city, last_touch, next_due, commercial_value, added_on |
| touches | One real contact with a person | person_ref, date, channel, source_link, note |
| signals | A reason to contact someone | person, company, signal_type, strength, source, date, status |
| referrals | A name given by someone | referred_name, company, referred_by, context, date, stage |
| searches | A live search | crm_job_id, client, role, priority, confidential, opened_on, forecast_month, confidence, tags |
| search_notes | Working notes for a search | search_id, tab, content, updated_on |
| content_items | A post, blog or testimonial | kind, source, draft, final, status, planned_date, posted_on, metrics |
| events | An event | name, city, date, format, stage, budget, outcomes |
| event_guests | A person invited to an event | event_id, person_ref, status |
| kpi_events | One thing that counted | kpi, date, source_table, source_id, manual, reason |
| agent_runs | One run of an agent | agent, started, finished, items_created, duplicates, errors, cost |

Settings tables hold targets, the ICP, voice rules, note templates, agent prompts and integration status.

### 19.3 References to CRM records

A person or company that exists in the CRM is stored in RecOS as a reference.

| Field | Purpose |
|----|----|
| crm | Which CRM the record is in |
| crm_id | The record's ID there |
| crm_url | A link that opens it |
| display_name | So lists can be read without a lookup |
| display_title and display_company | The same |
| refreshed_on | When the display fields were last checked |

No email address, phone number, CV, compensation figure or note text is held in a reference. Display fields are refreshed weekly and removed if the CRM record is deleted.

### 19.4 Rules

- **Uniqueness.** A job lead is unique on company and role. A signal is unique on person and type within 30 days. A league member is unique on the person.

- **KPIs are derived.** A KPI figure is always the count of rows in kpi_events for that measure and week. It is never stored as a number that can drift.

- **Everything is dated.** Created and updated times on every row.

- **Soft delete.** Binned and closed items are kept for 12 months for reporting, then removed.

- **History.** Changes to league tier, search priority and job stage are logged, so trends can be shown.

### 19.5 Mapping from today's sheets

| Today | RecOS table |
|----|----|
| PMM OS Inbox sheet, 13 columns | inbox_items, same fields |
| PMM Weekly KPI Log sheet | kpi_events for the numbers, weekly review notes for the text |
| seen_posts_log | job_leads, with first_seen |
| Hiring report sheets, one per run | job_leads |
| Topic logs | content_items, with source and status |
| Content report docs, one per run | content_items |

### 19.6 Portability

Every RecOS table can be exported as CSV from Settings. Agent prompts, templates and settings export as one file. Together these are enough to stand the system up somewhere else. Firm records are not part of the export because RecOS never held them.

## 20. Integrations

RecOS connects to seven systems. Each connection is built behind a common interface so one can be swapped, most importantly the CRM, without changing the rest of the app.

Vendor capabilities below reflect how the tools are used on the desk today. Anything marked to confirm needs checking with the vendor before build.

### 20.1 Summary

| System | Direction | Used for | Phase |
|----|----|----|----|
| Microsoft 365 (Outlook mail and calendar) | Read, create drafts, send by policy | Calls, leads email, alerts, follow-up sweep, drafts | 1 |
| Granola | Read | Call notes and transcripts | 1 |
| Google Drive | Read and write | Existing sheets during migration, weekly KPI export | 0 and 1 |
| CRM (JobAdder or Spott) | Read and write | Searches, pipeline, candidate and company records, notes | 2 |
| LinkedIn | None direct | Alerts by email, manual review in browser | 1 |
| Outreach tools (Source Whale, Spark) | Manual or import | Campaign results | 3 |
| Calendly | Through the Outlook calendar | Call bookings | 1 |

### 20.2 Microsoft 365

- **Sign-in and data use the same Microsoft account**, so there is one login.

- **Mail:** read access to find the leads email, LinkedIn alerts, CVs sent by candidates and unanswered threads. Write access covers drafts, plus sending for the message types set to automatic.

- **Calendar:** read access to show the day's calls and to count coaching calls and client meetings.

- **Send permission** is used only for the message types set to automatic in section 17.8. Every automatic send is logged.

- **To confirm:** nothing with IT. Mail and calendar are reached through the existing Claude connection, and sign-in asks only for your name and email.

### 20.3 Granola

- Read call notes by date range and by attendee. Read transcripts only when a note is too thin.

- Calls are matched to searches by attendee, calendar title and the role named in the notes.

- Transcripts are never quoted in anything client-facing. They are a source for notes written in the desk's own words.

- **To confirm:** the supported way for a hosted app to read Granola notes outside a Claude session.

### 20.4 CRM adapter

RecOS talks to the CRM through one internal interface with a fixed set of operations. Two adapters implement it.

| Operation | Used by |
|----|----|
| Find person by name or email | Call-to-CRM, matching, league |
| Create candidate, with or without a CV | Call-to-CRM |
| Add a note linked to a person and a job | Call-to-CRM, references |
| List jobs owned by the user | Searches list |
| List applications for a job by stage | Pipeline tab, stage counts |
| Add a person to a job at a stage | Call-to-CRM |
| Move an application to a new stage | Pipeline tab |
| List open tasks | Follow-up queue |
| Get recent activity for a company | Feedback clock, client contact days |
| Record a placement | Close-out |

|  | JobAdder | Spott |
|----|----|----|
| Status at the firm | CRM of record | On trial, decision due late November |
| Used by the desk today for | Signed placements | Notes, applications and campaigns on live searches |
| Already connected to Claude | No | Yes |
| Route for a hosted app | Vendor API, to confirm access and cost | To confirm whether an API is offered beyond the Claude connector |

Until the CRM decision is made, RecOS runs without a CRM adapter. Searches are entered by hand as a client, a role and a link, and stage counts are typed in weekly. That is enough for the Today screen and BD to work.

### 20.5 LinkedIn

LinkedIn is the most important source and the one with the tightest limits, so the approach is deliberately cautious.

- **In:** job change, promotion, open-to-work and job advert alerts are sent by LinkedIn to the work mailbox and read from there.

- **In:** hiring posts are found by the user's own saved searches, opened in their own browser.

- **Out:** connection requests with a note can be automated inside the cap in section 17.8. Messages, InMails, voice notes and posts are done by hand from drafts RecOS prepares.

- **Logged:** each manual action is marked as done in RecOS, which records the touch and counts the KPI.

- **Risk being managed:** the current automated connection requests (section 6.5).

### 20.6 Leads email

The weekly leads email from the research team arrives on Monday evening with PMM roles and funding rounds. It is read by the Jobs pipeline and the Relationship signals agent. Feedback on lead quality is captured from bin reasons and can be sent back to the sender as a monthly summary, to make the leads more relevant.

### 20.7 A-star feed

The weekly A-star candidate feed arrives by email. RecOS reads it into the A-star review cards. **To confirm:** the sender address and subject line, so the agent finds it reliably.

### 20.8 Google Drive

During migration RecOS reads and writes the existing sheets. After migration Drive is used only for the weekly KPI export and for files a client asks for.

### 20.9 Claude

In phases 0 and 1 the agents run as Claude scheduled tasks using the connectors already in place, and write to RecOS. In phase 3, agents can move to run inside the hosted app's own back end if that proves cheaper or more reliable. The agent definitions in section 18 are written so either route works.

### 20.10 Health checks

Each integration has a status in Settings: connected, needs sign-in or failing, with the time of the last successful read. A failing integration raises a system notice in the inbox.

## 21. Sign-in, security and data protection

RecOS is opened with the user's Microsoft work account, holds as little personal data as it can and treats recruitment data protection as a design input, not a later check.

This section describes good practice for a recruitment tool. It is not legal advice. The firm's data protection lead should review it before any personal data is held.

### 21.1 Sign-in

- **Sign in with Microsoft** using the 3Search work account. No separate password.

- Sign-in uses Microsoft's standard login for work accounts, so the firm's own rules apply: multi-factor authentication, device rules and the ability to switch access off centrally.

- Access is limited to named accounts. In version 1 that is one owner account and, optionally, one reviewer account.

- Sessions end after 12 hours or on sign-out. A new device needs a fresh sign-in.

- **No IT request needed:** sign-in asks Microsoft only for your name and email, which a work account can normally approve for itself. If the account blocks that, the fallback is a one-time sign-in link emailed to the same address.

### 21.2 Permissions requested

| Permission | Why | Not requested |
|----|----|----|
| Basic profile | To identify the user | Directory access |
| Read mail | Leads email, alerts, CVs, follow-up sweep | Access to other mailboxes |
| Create and edit drafts | To leave drafts for approval | Sending outside the send policy |
| Read calendar | Today's calls, call counts | Create or change events |

Only the first row is asked for at sign-in. Mail and calendar are reached through the Claude connections already set up on this account, so nothing new needs approving while agents run in Claude. A fully self-contained build (Route B in section 22.3) would need those permissions granted inside Microsoft, and that is the one point where IT would have to be involved.

### 21.3 Roles inside the app

| Role | Can see | Can do |
|----|----|----|
| Owner | Everything | Everything |
| Reviewer | KPIs, searches list, forecast | View only |
| Agent | Only the sources listed for it in section 18 | Write to the inbox, drafts and permitted CRM actions |
| Builder | Configuration and logs | No access to mail, call notes or inbox content |

### 21.4 Data minimisation

What RecOS does and does not hold about people.

| Held in RecOS | Never held in RecOS |
|----|----|
| Name, current title, company | CVs and attachments |
| City | Email addresses and phone numbers of CRM records |
| CRM link | Compensation details |
| League tier and touch dates | Call notes and transcripts |
| Signals from public or alert sources | Right-to-work, health or other sensitive information |
| Status on a search | Reference call content |

Drafts prepared by agents may contain personal details for a short time. They are kept for 30 days after the item is closed, then removed.

### 21.5 Lawful basis and transparency

- The firm is the controller of candidate and client contact data. RecOS is one of its tools and should appear in its record of processing.

- Recruitment firms generally rely on legitimate interests for sourcing and business development contact, and on steps taken at the person's request once they engage. The firm's existing basis should be applied to RecOS without change.

- People added from public sources, such as a league member spotted through a job change, should be told how their data is used at first contact, in line with the firm's privacy notice.

- A candidate's agreement is recorded before their details go to any client, including speculative approaches.

### 21.6 UK and US rules

The user is in the UK and the people in the data are mostly in the US, so both sets of rules matter.

| Area | What it means for RecOS |
|----|----|
| UK GDPR and the Data Protection Act 2018 | Applies to processing by a UK business. Covers lawful basis, minimisation, retention, security and individual rights |
| Transfers | Data on US individuals handled by a UK firm, and any hosting outside the UK, should be covered by the firm's transfer arrangements |
| US state privacy laws | Several states give residents rights over their data, with thresholds that depend on company size and volume. The firm should confirm which apply |
| Marketing email | US and UK rules on commercial email apply to outreach campaigns. These are sent from other tools, and RecOS records only results |
| Fair hiring | Matching and scoring must use job-relevant factors only. No protected characteristic is used, inferred or stored |

### 21.7 Individual rights

- **Access and deletion.** A search by name returns every RecOS row that mentions a person, with one action to export or delete them. CRM records are handled in the CRM.

- **Objection.** A do-not-contact flag removes a person from the league, signals and matching, and is checked before any draft is prepared.

- **Correction.** Display fields refresh from the CRM, so a correction made there flows through.

### 21.8 Retention

| Data | Kept for |
|----|----|
| Closed inbox items and drafts | 30 days for drafts, 12 months for the item record |
| Job leads | 12 months |
| Signals not acted on | 90 days |
| League members | While on the league, then 12 months |
| Touches and referrals | 24 months |
| KPI events | Indefinitely, with no personal data in them |
| Agent run logs | 90 days |

### 21.9 Use of AI

- AI drafts and sorts. It makes no decision about a person. Every shortlist, rejection and match is a human decision.

- Agents process mail and call notes to produce drafts. The AI provider's terms should confirm that this data is not used to train models.

- Candidates are not scored or ranked automatically in a way that decides whether they progress.

- Recording: calls are recorded by Granola. The firm's practice on telling participants should be followed on every call, noting that some US states require all parties to agree to recording.

### 21.10 Security controls

- Encryption in transit and at rest.

- Row-level access rules in the database, so the reviewer role cannot read anything beyond its views.

- Secrets and access tokens stored in a managed vault, never in the browser or the code.

- An audit log of sign-ins, exports, deletions and settings changes.

- Daily backups kept for 30 days, with a tested restore.

- No third-party analytics or trackers on the app.

### 21.11 Ownership and leaving

The app, its design, prompts and templates are the owner's. Firm records never leave the firm's systems. Network data is the part that needs an explicit agreement with the firm, and that question is listed in section 26. If access to the Microsoft account ends, RecOS can no longer be opened, so the export in section 19.6 should be run on a schedule.

## 22. Technical architecture and hosting

RecOS is a hosted web app with four layers: a front end, a database with sign-in, an agent runner and connectors to the outside systems.

<img src="media/image2.png" style="width:6in;height:2.66071in" alt="RecOS architecture · 4 layers, 4 outside systems" />

RecOS architecture · 4 layers, 4 outside systems

Agents read the outside systems and write items into the database. The app shows them and records what you do. LinkedIn does not appear because nothing connects to it directly: its alerts arrive through Outlook.

### 22.1 Layers

| Layer | Job | Recommended choice | Alternative |
|----|----|----|----|
| Front end | The screens in sections 8 to 17 | A web app built in Lovable | A hand-built React app |
| Database and sign-in | The tables in section 19, access rules, Microsoft login | Supabase, which pairs with Lovable and supports Microsoft sign-in | A database inside the firm's Microsoft tenant |
| Agent runner | Runs the seven agents on schedule | Claude scheduled tasks to start | Scheduled functions in the app's back end calling the Claude API |
| Connectors | Read and write to Outlook, Granola, the CRM and Drive | Claude connectors to start | Direct API calls from the back end |

Lovable is recommended for the front end because a licence and expert help are available through a personal contact, and because it produces a standard codebase that can be exported and hosted anywhere. **To confirm:** current Lovable and Supabase support for Microsoft work-account sign-in and for the hosting region the firm needs.

### 22.2 How data moves

1.  An agent runs on schedule and reads its sources through connectors.

2.  It writes items to the inbox table and, where allowed, drafts to Outlook and notes to the CRM.

3.  The front end reads the tables and shows Today, the inbox and each module.

4.  The user approves, edits or bins. Each action is written back to the tables.

5.  Actions marked Done write a KPI event.

6.  Live panels, such as today's calls and search stage counts, are fetched on page load and cached for a few minutes.

### 22.3 Two build routes

|  | Route A: Claude-run agents | Route B: self-contained app |
|----|----|----|
| Agents run | As Claude scheduled tasks | Inside the app's back end |
| Connections used | The connectors already set up | New API connections for each system |
| Time to first version | Short. Most pieces exist | Longer. Each integration is built |
| Depends on | A Claude subscription and its connectors | API access from each vendor |
| Running cost | Within the Claude plan, limited by usage | Per-use API charges plus hosting |
| Portability | Agents are prompts, easy to move | Full code ownership |
| Best for | Phases 0 to 2 | Phase 3 onward, if needed |

The recommendation is Route A now, with the data model and agent definitions written so that a move to Route B later changes where agents run and nothing else.

### 22.4 The write path for agents

The one new piece Route A needs is a safe way for agents to write into the RecOS database. Two options:

- **A small write endpoint** in the app's back end that accepts inbox items with a secret key and nothing else. Simple and tightly scoped.

- **A database connector** for Claude, if one is available for the chosen database.

Until either is in place, agents keep writing to the PMM OS Inbox sheet and RecOS reads that sheet. This is how phase 0 works today.

### 22.5 Environments

- **Live.** The app the user works in.

- **Test.** A copy with sample data for trying changes to screens and prompts. Agents in test never touch real mail or the CRM.

### 22.6 Hosting and domain

- Hosted by the app platform, with the database in a UK or EU region where the provider offers one.

- A simple address, such as a subdomain of a domain the owner controls, so the app does not depend on the firm's web domain.

- HTTPS only.

### 22.7 Build and change process

- Screens are built module by module in the order in section 25.

- Each module has acceptance criteria in this spec. A module is live when they pass.

- Prompts and settings are changed in the app. Screen changes go through the test environment first.

- A short change log is kept in Settings.

### 22.8 What exists already

| Piece | Status |
|----|----|
| Home screen prototype (PMM Desk) | Live, reading two sheets |
| Inbox store | Live as a Google Sheet with the right columns |
| KPI store | Live as a Google Sheet |
| Agents A3, A4 and A7 | Scheduled, first runs 18 November to 1 December |
| Agents A1, A2, A5 and A6 | Exist as earlier tasks, to be merged and repointed |
| Microsoft sign-in, database, CRM adapter | Not started |

## 23. Non-functional requirements

RecOS has to be fast, dependable and cheap to run, because it is opened dozens of times a day by one person between calls.

### 23.1 Requirements

| Area | Requirement |
|----|----|
| Speed | Today loads in under 2 seconds from cache. Any page responds to a click in under 300 milliseconds |
| Freshness | Inbox and follow-ups are current to the last agent run. Calendar and CRM panels are no more than 15 minutes old |
| Availability | Usable during UK and US East Coast working hours, 07:00 to 23:00 UK time, Monday to Friday. Planned changes happen outside those hours |
| Resilience | Each panel loads on its own. A failed integration never blanks the page |
| Data safety | Daily backup, 30 days kept, restore tested once a quarter |
| Recovery | Back in use within 1 working day of an outage, with no more than 24 hours of data lost |
| Browser support | Current Chrome and Edge on Windows, Safari on iPhone |
| Accessibility | Keyboard use throughout, visible focus, readable contrast in light and dark themes, no meaning carried by colour alone |
| Language | British English in the interface. Drafts follow the voice rules |
| Time zones | All times shown in UK time, with US Eastern shown beside call times |
| Cost | Agent spend visible per agent per month, with budgets and alerts |
| Privacy | The minimisation and retention rules in section 21 are enforced by the system |
| Maintainability | Settings, prompts, targets and templates changed without a developer |
| Portability | Full export of RecOS data and configuration at any time |

### 23.2 Scale

The numbers RecOS needs to handle are small, which keeps the build simple.

| Item           | Expected volume                          |
|----------------|------------------------------------------|
| Users          | 1 owner, 1 reviewer                      |
| Calls          | 30 to 50 a week                          |
| Inbox items    | 50 to 100 a week                         |
| Job leads      | 20 to 40 a week                          |
| League members | 100, plus about 200 in history           |
| Live searches  | 8 to 12                                  |
| Agent runs     | About 9 a week plus daily call write-ups |

### 23.3 Monitoring

- A status page in Settings showing each integration and each agent.

- A weekly health line in the Monday summary: runs completed, failures and items created.

- A notice in the inbox when anything needs the user, such as a sign-in that has expired.

### 23.4 Testing

- Each module is checked against its acceptance criteria before going live.

- Each agent is run in test against a fixed week of sample data, and its output compared with an expected set.

- The send policy is tested directly: an agent asked to send a message type that is not set to automatic must be unable to.

- KPI counts are reconciled by hand against the source items for the first four weeks.

## 24. Migration plan

Every existing workflow, agent, file and client search has a named destination in RecOS. Nothing is switched off until its replacement has run cleanly for two weeks.

### 24.1 Agents

| Existing task | Action | Becomes | Phase |
|----|----|----|----|
| Weekly PMM KPI summary for Olly | Keep, repoint from the sheet to KPI counts | A1 Weekly review | 1 |
| Weekly LinkedIn drafts from Granola | Keep. Shares the draft format with the other two runs | A2 Content engine | 1 |
| PMM Content Report (daily) | Now weekly with data points. Becomes a run of A2 | A2 source: PMM community | 1 |
| Recruitment Content Report | Now weekly with data points. Becomes a run of A2 | A2 source: recruiting news | 1 |
| LinkedIn PMM Hiring Report | Keep collection, write to the jobs table, cap automated connection requests | A3 Jobs pipeline (collect) | 1 |
| Jobs and specs | Keep, read from the jobs table | A3 Jobs pipeline (match) | 1 |
| Top 50 signals | Keep, add league due list | A4 Relationship signals | 1 |
| Outstanding tasks sweep | Keep the rules, change to Monday and Thursday, add calls as a source | A5 Follow-up queue | 1 |
| Dust CS Lead Friday sync | Generalise: replace fixed client IDs with the live searches list | A6 Call-to-CRM | 2 |
| Event ideas | Keep | A7 Event ideas | 1 |

### 24.2 Skills

| Skill | Destination |
|----|----|
| US market map | Button on the search workspace, Map tab |
| Candidate sheet enrichment | Button on the search workspace, Pipeline tab |
| Candidate pool recalibration | Button on the search workspace, Calibration tab |
| Search interview prep | Button on the search workspace, Interviews tab |
| Morning brief | Replaced by the Today screen |

### 24.3 Files

| File | Action |
|----|----|
| PMM OS Inbox sheet | Import rows to inbox_items. Keep the sheet as the agent write target until the write endpoint exists |
| PMM Weekly KPI Log | Import history. Keep as the weekly export |
| seen_posts_log | Import to job_leads, then retire |
| Topic logs | Import to content_items as used topics, then retire |
| Dated hiring report sheets | Import the last 8 weeks to job_leads, archive the rest |
| Dated content report docs | Archive. Drafts worth keeping are added to Ideas |
| PMM Desk page | Replaced by Today. Keep until phase 1 is live |

### 24.4 Client searches

Each live search is set up in the workspace template. The order follows current priority.

| Order | Search | What moves in | Notes |
|----|----|----|----|
| 1 | Dust, Customer Success Lead | Search pack, pipeline, note format, Friday sync | The reference build. Its setup becomes the template |
| 2 | Dust, Product Marketing Manager | Brief, candidates submitted, outreach campaign results | Shares the client record with search 1 |
| 3 | GrailPay, Product Marketing Manager | Brief, 5 submissions, feedback clock started from submission dates | Feedback clock is the main need |
| 4 | Yoobic, Head of Product Marketing | Briefing notes, retail sector requirement, market map | Marked confidential. New, so a clean first use of the template |
| 5 | Tive, Director of Product Marketing | Offer and references, close-out checklist, testimonial request | Mostly close-out and aftercare |
| 6 | Diversis Capital, AI Operating Partner | Pipeline, interview schedule | Non-PMM tag |
| 7 | Concept 80 | Pipeline, weekly call | Non-PMM tag, shared with a colleague |
| 8 | Nitra | Ad applicants to review, weekly update | Dormant priority |
| 9 | LeadPulse | Pipeline | Non-PMM tag |
| 10 | Moneypenny | Brief only | Dormant until the client moves |

### 24.5 Projects and documents

| Today | Destination |
|----|----|
| PMM Business plan project and its three docs | Settings: targets, ICP, BD structure. The build plan stays as a reference document |
| One Claude project per workflow | The matching RecOS module. Project instructions become shared prompt blocks |
| One Claude project per client search | The search workspace. Search packs go in the Brief and Map tabs |
| Whiteboard photo of the plan | Already captured in sections 10, 11 and 16 |

### 24.6 Manual workflows

| Workflow | First system support | Phase |
|----|----|----|
| Follow-ups after calls | Follow-up queue | 1 |
| Exec coaching | Coaching page and prep cards | 1 |
| Referrals | Referrals list and quick capture | 1 |
| Top 100 league | League page, seeded with a first 20 names | 1 |
| Weekly client updates | Draft update per search | 2 |
| Reference calls | Question set and client summary | 2 |
| Offer management | Offer tracker | 2 |
| Testimonials and case studies | Close-out trigger and pipeline | 3 |
| Outreach campaigns | Campaign tracker | 3 |
| Account growth | Prompt after each placement | 3 |

### 24.7 Cutover rules

1.  Old and new run side by side for two weeks.

2.  Outputs are compared each Monday. The new agent must find at least what the old one found.

3.  The old task is paused, not deleted, for a further four weeks.

4.  Any search in offer stage is not migrated until the offer is closed, to avoid disruption at the point that matters most.

### 24.8 Inputs needed from the owner

- [ ] The first 20 to 30 names for the league, with a tier for each

- [ ] The sender and subject line of the weekly A-star feed

- [ ] LinkedIn alerts set to arrive at the work email address

- [ ] Links to each existing Claude project, so their instructions can be read and merged

- [ ] A choice of which messages send automatically

- [ ] Last week's KPI numbers, to start the trend

## 25. Delivery roadmap and phases

RecOS is delivered in four phases over about 12 weeks. Each phase ends at a gate with a clear test, and each leaves the desk with something usable.

### 25.1 Phases

| Phase | Weeks | What is delivered | Gate to pass |
|----|----|----|----|
| 0\. Prototype | Done and running, 11 Nov to 1 Dec | PMM Desk home screen, inbox sheet, three new agents | First runs of A3, A4 and A7 produce usable items |
| 1\. Core and BD | Weeks 1 to 4 | Hosted app with Microsoft sign-in, Today, Inbox, Follow-up queue, Jobs and specs, Exec coaching, Referrals, League, KPIs counted automatically, content runs aligned to one format | Two Monday reviews run from RecOS with no manual KPI entry |
| 2\. Searches and candidates | Weeks 5 to 8 | CRM adapter for the chosen CRM, search workspace template, Call-to-CRM for all searches, feedback clock, client updates, references and offers, candidate views | Every live search has a workspace and call notes reach the CRM within 24 hours for two weeks |
| 3\. Brand, events and polish | Weeks 9 to 12 | Content calendar and performance, testimonials pipeline, events module, campaign tracker, UK to US list, forecast, reviewer view, exports | One event planned in RecOS, quarterly targets visible, old tasks retired |

### 25.2 Phase 1 in detail

Phase 1 is the largest step, so it is broken into weekly slices.

| Week | Build | Outcome |
|----|----|----|
| 1 | App shell, Microsoft sign-in, database tables, import of the inbox and KPI sheets | Today and Inbox work from real data |
| 2 | Write path for agents, Jobs and specs page, KPI events | Posts chased is counted automatically |
| 3 | Follow-up queue with calls and mail as sources, coaching page, referrals, quick capture | The Monday follow-up block runs from RecOS |
| 4 | League page with a first 20 to 30 names, signals, content drafts in one list, weekly review page | First full Monday review from RecOS |

### 25.3 Dependencies

| Dependency | Needed by | Owner |
|----|----|----|
| Lovable licence and a first session with the Lovable contact | Phase 1, week 1 | Jason |
| Microsoft sign-in set up with name and email only, no IT request | Phase 1, week 1 | Jason |
| Decision on where network data may live | Phase 1, week 4 | Jason with the firm |
| CRM decision when the Spott trial ends | Phase 2, week 5 | The firm |
| API or connector access to the chosen CRM | Phase 2, week 5 | The firm and vendor |
| First league names | Phase 1, week 4 | Jason |

### 25.4 If a dependency slips

- **Microsoft sign-in blocked on the work account.** Phase 1 uses a one-time sign-in link emailed to the work address. Agents already read mail through the existing Claude connection.

- **No CRM decision.** Phase 2 starts with searches entered by hand and Call-to-CRM pointed at whichever CRM is in use that week. The adapter is finished once the decision lands.

- **No Lovable licence.** Phase 1 continues on the PMM Desk prototype, extended page by page, until the licence arrives.

### 25.5 Effort

A rough guide for planning, not a quote. It assumes Lovable for screens and Claude-run agents.

| Phase | Owner time                                        | Build time     |
|-------|---------------------------------------------------|----------------|
| 1     | 2 to 3 hours a week of review and decisions       | 30 to 40 hours |
| 2     | 2 hours a week, plus one hour per search migrated | 30 to 40 hours |
| 3     | 1 to 2 hours a week                               | 20 to 30 hours |

### 25.6 After version 1

Ideas held for later, in rough priority order.

1.  A public PMM microsite listing live roles and content.

2.  Agents moved inside the app's back end (Route B).

3.  A second recruiter using the same system with their own league and KPIs.

4.  A salary and market data view built from anonymised call data, to share with league members.

5.  A light client portal showing the weekly update for a search.

6.  Video content planning.

## 26. Risks, assumptions and open questions

The three risks most likely to stop RecOS delivering are a LinkedIn account restriction, an unresolved data ownership question and the system being built but not used.

### 26.1 Risks

| \# | Risk | Likelihood | Impact | Response |
|----|----|----|----|----|
| R1 | LinkedIn restricts the account because of automated activity | Medium | High | Cap automated connection requests and pause on any warning. Read alerts by email. Messages by hand |
| R2 | The firm objects to network data living outside the CRM | Medium | High | Agree the line before phase 1 ends. Design supports a CRM list instead |
| R3 | The system is built and then not opened daily | Medium | High | Today is the browser start page. Monday review runs only from RecOS. Olly reviews from it |
| R4 | The work account blocks self-approved Microsoft sign-in | Medium | Medium | Fall back to an emailed sign-in link. Keep agents on the existing connection |
| R5 | The chosen CRM offers no usable access for a hosted app | Medium | Medium | Keep CRM work on Claude-run agents. Show CRM data as links |
| R6 | Agent drafts read as automated and reply rates fall | Medium | Medium | Automatic sending limited to routine messages on approved templates. Track reply rate as a guardrail. Tune from edits |
| R7 | Agent costs rise as more is automated | Low | Medium | Weekly default, budgets per agent, cheaper models for sorting |
| R8 | A call is written to the wrong search or person | Low | High | Needs-confirmation step. No deletes or merges by agents |
| R9 | Confidential search details appear in content | Low | High | Content rules ban names. Confidential searches are excluded from the content source |
| R10 | Scope grows and phase 1 never finishes | Medium | Medium | Gates per phase. New ideas go to the later list |
| R11 | The owner changes firm and loses access | Low | High | Scheduled export of RecOS data and configuration. App hosted on an address the owner controls |
| R12 | Call recording rules are not met in some US states | Low | Medium | Follow the firm's recording practice on every call |

### 26.2 Assumptions

- The four weekly and three quarterly targets stay as agreed on 9 November until the first quarterly review.

- Granola continues to record every call.

- LinkedIn alert emails can be sent to the work mailbox.

- The weekly leads email and A-star feed continue in their current form.

- One user for at least the first two quarters.

- The Claude plan in use continues to include scheduled tasks and the current connectors.

### 26.3 Open questions

| \# | Question | Who decides | Needed by |
|----|----|----|----|
| Q1 | JobAdder or Spott? | The firm | Phase 2 |
| Q2 | May the league and referrals live in RecOS, or must they be a CRM list? | Jason with the firm | End of phase 1 |
| Q3 | Does the work account allow self-approved Microsoft sign-in, or is the emailed sign-in link needed? | Jason | Phase 1, week 1 |
| Q4 | Which message types send automatically, and what weekly cap applies to LinkedIn connection requests? | Jason | Before phase 1 |
| Q5 | Does the chosen CRM offer access a hosted app can use? | Vendor | Phase 2 |
| Q6 | What is the supported way to read Granola notes from a hosted app? | Vendor | Phase 2 |
| Q7 | Should Olly have a login or receive the Monday summary only? | Jason and Olly | Phase 3 |
| Q8 | Which hosting region does the firm require? | The firm | Phase 1 |
| Q9 | What desk revenue target and forecast format does Olly want on the KPI page? | Olly | Phase 3 |
| Q10 | Are non-PMM searches counted in the desk's KPIs or reported separately? | Jason and Olly | Phase 2 |
| Q11 | Which chats and projects were meant to be referenced in this spec? The request listed none, and other chats cannot be read from here | Jason | Next revision |

### 26.4 What this spec was built from

This version draws on the planning conversation of 11 November, the three documents in the PMM Business plan project, the whiteboard photo of the plan, the ten scheduled tasks and their full instructions, the reusable skills, call notes from 15 October to 13 November, the leads email thread and the job list in the CRM on trial. The connected PLATFORM folder was empty. Other chats and projects could not be read, so anything that lives only there is not yet reflected.

## 27. Appendices

The appendices hold the working detail a builder needs: a full specification for each agent, user stories by module, templates, an acceptance checklist and a glossary.

### Appendix A. Agent specifications

#### A1. Weekly review

|  |  |
|----|----|
| Purpose | Prepare the Monday review and the summary to Olly |
| Runs | Monday 8:17 |
| Reads | KPI events for the week just ended, search stage counts, meetings held, follow-ups on time |
| Steps | Count each KPI against target. List hits and misses. Add outputs and one line on meetings held. Pull the user's notes on what was learned and next week's plan |
| Writes | Weekly review page. An Outlook draft to Olly titled with the week commencing date |
| Rules | Never invent a number. If a measure has no data, say so and list what is missing. Keep the email short and plain |
| Done when | The draft's figures match the KPI page exactly |

#### A2. Content engine

|  |  |
|----|----|
| Purpose | Produce the week's post drafts from three sources |
| Runs | Three weekly runs: calls Monday 8:58, PMM community Monday 9:15, recruiting news Thursday 9:30 |
| Reads | Last week's call notes, a fixed list of PMM community sources, a fixed list of recruiting news sources, topics already used |
| Steps | Pick the strongest insights from calls. Check each source for what is new in the last 7 days. Rank candidate angles for the audience. Find at least 3 sourced data points in each research run. Draft posts in the shared format. Note which source inspired each |
| Writes | Content draft items in the shared format. A short list of held themes |
| Rules | No names of clients, candidates or companies. Reframe non-PMM lessons. Flag unconfirmed news as unconfirmed. Skip any topic used in the last 8 weeks. Confidential searches are excluded as a source |
| Done when | Every draft follows the shared format and each research draft cites a data point |

#### A3. Jobs pipeline

|  |  |
|----|----|
| Purpose | Keep one list of live PMM jobs and suggest who to put forward |
| Runs | Collect on Tuesday and Friday at 13:00. Match on Wednesday at 7:41 |
| Reads | The weekly leads email, hiring posts from the user's saved searches, job alert emails, the A-star pool, warm specs, recent candidate calls |
| Steps | Collect new jobs. Drop agencies and aggregator accounts. Send non-PMM roles and UK roles at existing clients to the wider business list. Merge duplicates on company and role. Score fit against the ICP. For each new job, suggest up to 3 candidates with reasons. Draft a spec message |
| Writes | Job lead rows and inbox items. One summary draft on Wednesday |
| Rules | Never copy candidate data out of the CRM. No candidate surname or employer in a spec draft. LinkedIn connection requests only inside the cap in section 17.8. Lookback window covers every day since the last run |
| Done when | No company and role appears twice, and every job has a fit reason |

#### A4. Relationship signals

|  |  |
|----|----|
| Purpose | Tell the user who to add to the league and who to contact this week |
| Runs | Friday 12:47 |
| Reads | LinkedIn alert emails from the last 7 days, the funding list in the leads email, the league with last touch dates |
| Steps | Classify each alert by signal type. Drop people outside the ICP. Write one line on why it matters and a first message under 60 words. List league members who fall due next week |
| Writes | Signal items. A due list on the league page. One summary draft |
| Rules | Skip anyone added in the last 30 days. Respect do-not-contact flags. If no alert emails arrived, say so and prompt a check of LinkedIn alert settings |
| Done when | Every signal has a type, a reason and a draft |

#### A5. Follow-up queue

|  |  |
|----|----|
| Purpose | Make sure nobody who was spoken to or who asked for something is left waiting |
| Runs | Monday 7:30 in full, Thursday 7:30 in brief, and after each recorded call |
| Reads | Call notes, Outlook inbox and sent items for 14 days, open CRM tasks |
| Steps | Create a follow-up for each external call. Find requests and questions awaiting an answer. Find commitments made in sent mail. Check sent items before listing anything. List chases where the user is waiting on someone for 5 days or more |
| Writes | Follow-up items with drafts, grouped as due, owed and waiting on them |
| Rules | Never report an item on inbox evidence alone. Respect items marked handled offline. Ignore automated mail |
| Done when | Every external call from the previous week has a follow-up or a closed reason |

#### A6. Call-to-CRM

|  |  |
|----|----|
| Purpose | Write every candidate call into the CRM in the standard format |
| Runs | Mon to Thu 19:30, Fri 16:30 with a catch-up for the whole week |
| Reads | The day's call notes, calendar entries, CVs received by email, the live searches list with CRM job IDs |
| Steps | Match each call to a search. Check for an existing CRM record. Import the CV or create the record and flag the missing CV. Add the candidate to the job at the right stage. Write one structured note per call. Pull out referrals and commercial answers |
| Writes | CRM records and notes. Referral rows. Write-up items showing what was done and what is missing |
| Rules | No duplicates. No invention. Not stated where unknown. Where the call and CV disagree, note both. Client and internal calls are skipped. Unclear calls go to needs confirmation |
| Done when | Each candidate call shows four of five ticks, with the fifth set by the follow-up queue |

#### A7. Event ideas

|  |  |
|----|----|
| Purpose | Suggest events based on what the market is talking about |
| Runs | 1st of each month at 10:13 |
| Reads | 30 days of call notes |
| Steps | Find themes that came up more than once. Propose 3 events with title, angle, city, format and speakers |
| Writes | 3 event idea items |
| Rules | Speakers must be real people already met or publicly known. No client or candidate named as a source |
| Done when | 3 ideas exist, each with a city and a format |

### Appendix B. User stories by module

| Module | As the owner I want to | So that |
|----|----|----|
| Today | See my four KPIs the moment I open the app | I know where the week stands |
| Today | See every call today with a prep card | I never join a call cold |
| Today | See which searches are red | I act before a client or candidate goes quiet |
| Inbox | Approve, edit or bin an item with one key | I clear 20 items in 10 minutes |
| Inbox | Snooze an item to a date | It comes back when it is useful |
| BD | See one list of jobs from all sources | I never chase the same company twice |
| BD | See who I could spec for each job | I chase with something to offer |
| BD | Capture a referral in 15 seconds | Names given on calls are not lost |
| BD | See the answers to my commercial questions after each coaching call | Each call fills next week's diary |
| Relationships | See who is overdue on the league | I keep to the cadence |
| Relationships | Get new VP and head of PMM moves every Friday | I reach them in their first 90 days |
| Relationships | Review promotions and relegations each quarter | The league stays commercial |
| Searches | Open a new search from a template | Setup takes minutes |
| Searches | See a draft client update before each call | I walk in prepared |
| Searches | Be warned when feedback is slow | Candidates do not drift |
| Searches | Have reference calls summarised for the client | Offers move faster |
| Candidates | See which calls are not yet written up | The CRM stays current |
| Candidates | Review the weekly A-star feed with good and not good | The pool grows by 5 a week |
| Content | Get ranked drafts in one list each week | I post twice without starting from a blank page |
| Content | See which posts brought inbound messages | I write more of what works |
| Events | Plan an event from one page | The quarterly event happens |
| Events | Build a guest list from the league by city | The right people are in the room |
| KPIs | Have numbers counted for me | The Monday review needs no preparation |
| KPIs | Click a number and see what is behind it | I trust it and so does Olly |
| Settings | Change a target, the ICP or a prompt myself | I do not need a developer |
| Settings | Export everything | The system can move with me |

### Appendix C. Templates

#### C1. Search brief

| Field | Notes |
|----|----|
| Client, role title and level | With the level the client says and the level the market would call it |
| Confidential | Yes or no, and what can be said to candidates |
| Location and working pattern | City, days in the office |
| Reports to and team | Line manager, reports, peers |
| Why the role exists | New, replacement or restructure |
| Must-haves | No more than 5 |
| Nice-to-haves | No more than 5 |
| Sector or background required | For example a particular customer type |
| Compensation | Base range, bonus, equity, and the desk's view of the market rate |
| Interview process | Stages, who is met, any task or scorecard |
| Decision maker and timeline | Who signs off and the target start date |
| Selling points | Why a strong candidate would move |
| Risks | Anything that could slow or stop the hire |
| Commercial terms | Fee basis, any retainer, split arrangement |
| Open questions for the client | Carried into the next call |

#### C2. Weekly client update

1.  Headline: one sentence on where the search stands.

2.  Pipeline by stage, with the change since last week.

3.  Candidates to discuss, each with one line and what is needed.

4.  Feedback outstanding from the client, with dates submitted.

5.  Market feedback: what candidates are saying about the role, level and package.

6.  Plan for the coming week.

7.  Decisions needed from the client.

#### C3. Reference call

1.  How do you know the candidate and for how long did you work together?

2.  What was their role and what were they responsible for?

3.  What are their greatest strengths?

4.  Where could they develop further?

5.  How do they work with peers, senior leaders and their own team?

6.  Is there anything the new employer should know to get the best from them?

7.  Any concerns or red flags?

8.  Would you hire or work with them again?

#### C4. Follow-up message types

| After | Message covers |
|----|----|
| First candidate call | Thanks, what happens next, anything requested such as a CV |
| Exec coaching session | Thanks, the two or three points of advice, the referral ask |
| Client meeting | Thanks, what was agreed, next step and date |
| Submission | Confirmation to the candidate that they have been put forward |
| Interview | Check-in with the candidate, then feedback when it arrives |
| Rejection | The decision, the reason where given, and what else may suit |
| Placement | Congratulations, start details, check-in dates |
| Event | Thanks for coming, one thing discussed, a next step |
| League cadence | Something worth reading: a market note, an introduction or an invitation |

#### C5. League entry

| Field | Notes |
|----|----|
| Name, title, company, city | Display fields |
| Half and tier | Senior leader or A-star candidate, and which league |
| Why they are on the list | One line |
| Last touch and next due | Set by the system |
| Commercial value so far | Jobs, referrals, introductions |
| Notes for next contact | What to ask or offer |

### Appendix D. Acceptance checklist for version 1

**Sign-in and security**

- [ ] Sign-in works with the Microsoft work account and nothing else

- [ ] The reviewer role sees KPIs and searches only

- [ ] No agent can send anything outside the send policy

- [ ] A person can be found and deleted across all RecOS tables in one action

- [ ] Full export of data and configuration works

**Today and inbox**

- [ ] Today loads in under 2 seconds

- [ ] Each panel loads independently and shows a clear message if its source fails

- [ ] Every agent writes to the inbox in the standard shape

- [ ] No duplicate job or signal items

- [ ] Approve, edit, done, snooze and bin work by keyboard

**Business development and relationships**

- [ ] Jobs from all three sources appear in one list

- [ ] Each job shows a fit reason and up to 3 candidate suggestions

- [ ] Moving a job to Chased adds 1 to posts chased

- [ ] Every external call creates a follow-up

- [ ] The league shows last touch and next due for every member

- [ ] Friday signals arrive with a draft each

**Searches and candidates**

- [ ] A new search workspace is created from the template in under 10 minutes

- [ ] Candidate calls are written to the CRM within 24 hours

- [ ] The feedback clock raises a nudge at 2 working days

- [ ] A draft client update is ready before each weekly call

- [ ] No CV, contact detail or call note is stored in RecOS

**Content, events and KPIs**

- [ ] All three content runs produce drafts in the same format

- [ ] Marking a post as posted adds 1 to LinkedIn posts

- [ ] Event ideas arrive on the 1st of the month

- [ ] The four weekly KPIs need no manual entry

- [ ] The Monday summary draft matches the KPI page

- [ ] Every KPI number links to the items behind it

**Migration**

- [ ] The three content tasks run weekly in one format

- [ ] All live searches have a workspace

- [ ] The dedup logs are imported and retired

- [ ] Old tasks are paused for four weeks, then removed

### Appendix E. Glossary

| Term | Meaning |
|----|----|
| 360 | One recruiter handles business development, the client and the candidates |
| A-star candidate | A top mid-level PMM worth knowing whether or not they are looking |
| Ad chase | Contacting a company because it has posted about hiring |
| BD | Business development: winning new clients and roles |
| Calibration | Using client reactions to real candidates to sharpen the brief |
| CRM | The system holding client and candidate records, also called an applicant tracking system |
| Exec coaching | A LinkedIn audit and CV review offered to senior leaders |
| Flip | Turning a candidate conversation into a lead at their current or former employer |
| ICP | Ideal client profile |
| League | The top 100 list, split into Premier League, Championship and League One |
| PMM | Product marketing manager, or product marketing as a function |
| Signal | A sign that someone is about to hire or move, such as a new role or funding |
| Spec | Putting a strong candidate in front of a company that has not asked for one |
| Split | Sharing a fee between the people who won the account, managed it and filled the role |
| Touch | A real exchange with someone on the league |
| Warm spec | A spec to a company where there is already a relationship or a known need |
