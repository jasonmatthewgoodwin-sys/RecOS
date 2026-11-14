# Business development: what Jason asked for on 14 November 2026, and what it means to build

Written from Jason's spoken notes, relayed by Mia. Nothing here is built yet unless it says so. Each piece names what exists today, what is new, what it needs from outside RecOS, and what to decide first.

## 1. Jobs: from the scraper to a conversation

**What Jason said.** Leads come from the scraper the business already runs. It finds the hiring managers who posted PMM jobs on LinkedIn. An agent should connect with each one on LinkedIn (second-degree connections get the short note: "I'm the only product marketing headhunter in the world. Let's connect."), and once they accept, send the first message. Both messages are staged in RecOS, the agent's activity is visible in RecOS, and Jason can mark replies by hand (interested, not interested).

**What exists.** `job_leads` with the poster's name, title and profile link; the Jobs page with the stage filter; the agent contract (`agent-write`) that A3 Jobs already writes leads through; the send engine's rules (levels, caps, windows, the stop switch); the cap for LinkedIn connection notes in Send rules.

**What is new.**
- A per-person outreach ladder on every job lead: Found, Connection sent, Connected, Messaged, Replied (interested / not / no answer), with the date of each step. One row per hiring manager, not per job.
- Two staged messages per lead, editable in RecOS before anything goes: the connection note and the first message. Templates live in Settings, Templates; the lead's copy is the thing the agent sends.
- A new write kind, `outreach_step`, so the agent records each step through `agent-write` (never by touching the database), and a mirror of the state on the Jobs page: a steps strip on the tile and the card, with "Mark replied" by hand.
- The scraper itself feeds `job_lead` records as it does now, with `poster_profile_url`, so every lead has a LinkedIn link.

**What it needs from outside.** A way to send on LinkedIn. LinkedIn has no public API for connection requests or messages. The scraper tool the business built is the only route, and automated sending is against LinkedIn's terms and can get an account restricted. The send engine should hold these as `one_click` (Jason presses Send in RecOS, the tool sends) until he decides otherwise. Decide first: which tool sends, under which account, and what daily cap.

## 2. Referrals become Referrals and leads

**What Jason said.** Referrals come from coaching calls with senior candidates ("I know someone hiring, reach out to X") and from candidates who say "I've just interviewed at Y", which is really a lead. On the call he should be asking: who is the hiring manager, did they go through a recruiter or direct, is the job open.

**What exists.** `referrals` with a kind, the referrer and the Contacted / Spoken / Added to league stages; the coaching card with its questions; the call agent (A6) writing referrals after a call.

**What is new.**
- Rename the tab Referrals and leads. A referral carries a kind: person or company lead.
- Three more fields for a company lead: hiring manager (name and LinkedIn link), sourced via (recruiter, direct, unknown), job open (yes, no, unknown). The coaching card asks these three on the call.
- One click to turn a company lead into a job lead, which drops it onto the outreach ladder above.

## 3. Follow-ups: remove the tab

**What Jason said.** Delete follow-ups from Business development. The after-call "share feedback" prompt is not business development.

**Watch out.** The brief's phase-1 acceptance says the Monday follow-up block runs from RecOS, and the follow-up engine is what writes thank-yous and owed replies. The safe reading is: take the tab off Business development and stop the after-call prompts, but keep the engine behind Inbox and People so owed thank-yous still surface. Decide first: tab only, or the whole engine.

## 4. UK to US: a signal source, then leads

**What Jason said.** UK-headquartered companies hiring product marketers in the US, or likely to: they have raised money, their CMO or VP Marketing sits in the UK, they are building a US team. Pre-emptive, not only live jobs. Claude knows the company profile.

**What is new.**
- A sub-tab under Business development, UK to US, showing companies and the people at them, with the same outreach ladder.
- The signals agent (A4) gets a second brief: UK HQ, US hiring or funding in the last 90 days, marketing leadership in the UK. It writes `signal` and `person` records as now, with a `uk_to_us` flag so they land on this tab.
- Sources it can use today: LinkedIn (through the scraper), Companies House and funding news through Claude's own browsing. No new connection needed to start.

## 5. Campaigns: paused, and they belong under Content

**What Jason said.** Pause campaigns. When they come, they sit under Content, with a crossover into Business development: a spec campaign is the step-by-step plan for sending one matched candidate's profile to one lead (email, then a call, then a message), built from a job lead or a referral once a candidate is matched.

**What is new, later.** A `campaigns` table with ordered steps, a link to the lead and the candidate, and the send engine running each step under its level. Nothing to build now.

## 6. Wider business: the group's clients, and his own accounts

**What Jason said.** Wider should mean Eleven Investments: every client across the group, checked for hiring. And the other way round: his own accounts and hot contacts, so colleagues in other parts of the business (Sam Church was the example) get people found for them.

**What exists.** `wider_leads`, the Wider page, passing a lead to a colleague with the split, and the `leads_passed` number.

**What is new.**
- A clients list for the group, held in RecOS as thin references (company, who owns it, the CRM link), that an agent checks each week for hiring signals and job posts. Those become wider leads with the client marked.
- A second list, Jason's accounts, where a hiring signal becomes a lead for a colleague rather than for him.
- The CRM is the record for both lists; RecOS keeps the reference and the link.

## 7. The agent behind every tab

**What Jason said.** In every section he cannot tell which agent is working, what it was told, or when it last ran. He wants a button on each tab that opens the agent: its criteria, patterns and rules, which connections it uses (the LinkedIn scraper, his inbox, the Claude API, Granola, the CRM), when it last ran and what happened, Run now, and the ability to edit it.

**What exists.** Settings, Agents: the seven agents, on and off, the last runs with their counts and errors, the prompt with versions, Run now (through `request_run`), the keys.

**What is new.**
- An Agent button at the top right of every tab's header (beside the status key), opening the agent that feeds that page as a window: last run and result in one line, the criteria as plain fields (lookback, caps, the ICP lines), the prompt, the connections it uses with a tick for each one that is set up, Run now, and a link to the full page in Settings.
- `agents.connections`, a list per agent of the outside services it uses, so the window can show them and so a missing one shows as not set up. The agents are Claude cloud routines, so the honest line is "runs in Claude on this schedule; last heard from at ...".
- A mapping of page to agent: Jobs → A3, Referrals and leads → A6, UK to US and Signals → A4, Wider → A3 and A6, Content → A2, Inbox → all, Numbers → A1.

## Suggested order

1. The Agent button on every tab (7). It is mostly a window over what Settings already holds, and it answers the loudest complaint.
2. The outreach ladder on job leads with staged messages held at one click (1), then the scraper's link to it.
3. Referrals and leads with the three call questions and the one-click conversion (2).
4. Remove the Follow-ups tab from Business development once Jason confirms the engine stays (3).
5. UK to US as a second signals brief and a sub-tab (4).
6. The group's clients and Jason's accounts under Wider (6).
7. Campaigns under Content, after a spec can be matched to a candidate (5).

## To decide before building

- Which tool sends on LinkedIn, under whose account, and the daily cap. Until then, every LinkedIn message is one click, never automatic.
- Follow-ups: the tab only, or the engine too.
- The first names of the group's clients and of Jason's accounts: he enters them in the app, not in the repository.
