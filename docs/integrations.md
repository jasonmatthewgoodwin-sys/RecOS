# The outside services RecOS connects to

One line per service: what it is for, how RecOS signs in to it, what moves each way, and where it stands. Nothing here holds a secret; every key and token lives in Supabase function secrets or the agent's own task settings (CLAUDE.md, rule 3).

| Service | What for | Sign-in | RecOS reads | RecOS writes | Status | Ticket |
| --- | --- | --- | --- | --- | --- | --- |
| Supabase (Postgres, Auth, Edge Functions, pg_cron) | The database, sign-in, the server functions and the nightly job | Project URL and public key in the browser; service role key in function secrets only | Everything through row-level security | Everything | Live on the test project | P1-01 onwards |
| Microsoft sign-in (Entra ID) | Jason signs in with the work account. Name and email only, never mail or calendar permissions (rule 7) | OAuth through Supabase Auth; client ID and secret in the auth provider settings | Name, email | Nothing | Not yet registered; the emailed link and the password work meanwhile | P1-05 |
| Microsoft Graph, Outlook mail | Send the automatic and one-click emails, open drafts in Outlook, read replies for the follow-up sweep | A connection Jason authorises once, token held in function secrets, scoped to Mail.ReadWrite and Mail.Send on his own mailbox | Replies in threads RecOS started (A5, section 21) | Drafts and sends through the send engine only (rule 5) | Not built | P1-27, check P6 |
| Microsoft Graph, Outlook calendar | Calls today on Home, the prep cards, meetings for the weekly review | Same connection, Calendars.Read | Today's events, last week's external meetings | Nothing | Not built; `calendar_today` is filled by A5 through agent-write for now | P1-33 |
| Granola | Call notes that A6 turns into follow-ups, referrals, coaching answers and touches | Granola's own connector in the Claude task; a reference per call, never note text (rule 1) | Call references, times, who was on the call, the write-up ticks | Nothing | The write contract takes the results; the `calls` table waits | P1-36 |
| CRM: Spott today, JobAdder to confirm (check P5) | The record for every person and search. RecOS keeps only an ID, a link, a name, a title and a company | The CRM's API key in function secrets; through the Claude connector for Spott | Person references, search stages, submission and interview dates | Person refresh only. Candidates are imported into a search by Add candidate (phase 2) | Not built | P2-01, 24.5 |
| LinkedIn | Job posts, alerts about people, connection notes | No API. Alerts arrive as emails to the work address and A4 reads them; connection notes go through the LinkedIn sender with a daily cap | Alerts, job posts | Connection notes at automatic level, capped; everything else a draft to copy | Agents read; sending waits for the send engine | P1-27, 20.7 |
| Claude scheduled tasks (the seven agents) | A1 to A7 run outside RecOS and post through `agent-write` | An agent key per agent, made in Settings, Agents, sent as `X-Agent-Key` | `run-start` and `context` | `agent-write` and `run-finish` | Endpoints live on the test project. Jason is moving the agents to cloud routines | P1-14 to P1-16, P1-25, P1-33 |
| Vercel | Hosts the front end at https://rec-os-gules.vercel.app | Jason's own Vercel team, deploys on push to main | Nothing | Nothing | Live | Hosting |
| GitHub | The code | Jason's account; Mia pushes as a collaborator | Nothing | Nothing | Live | Setup |
| OneDrive or Google Drive | The weekly full export saved to Jason's own drive (34.9), later the research sources for A2 | A scheduled task with Jason's own connector | Nothing yet | The export file | Not built; Export everything downloads to the browser today | P1-46, 34.9 |
| Email for sign-in links | The emailed one-time link | Supabase's built-in mail, 2 an hour, or custom SMTP in Jason's name | Nothing | Sign-in links | Built-in mail; custom SMTP recommended | P1-05 |

## The order to connect them

1. Microsoft sign-in, so the emailed link and the password are a fallback rather than the way in.
2. Outlook mail, because nothing can leave until the send engine has a sender (P1-27), and the Monday summary, thank-yous and CV requests all wait on it.
3. Outlook calendar, so Calls today and the prep cards come from the real diary.
4. Granola and the CRM, which A6 needs for calls and the record behind each person.
5. The drive, for the weekly export.

## What never connects

RecOS does not record calls, does not read the whole mailbox, does not ask for directory permissions, loads no analytics and sets no third-party cookies (34.4, 34.8).

## Every source has a link (14 November 2026)

Every lead, signal, draft and inbox item carries the address it came from, and the app shows it as a link whose label says where it goes: Open the email for an Outlook message, Open on LinkedIn for a post or profile, Open the call notes for Granola, Open source for anything else. Agents that read mail (the hiring reports from Alex's leads among them) write the message's own web address as `source_url`: in Microsoft Graph that is the message's `webLink`, which opens the email in Outlook on the web for the signed-in owner. Never the mailbox address or the sender's email; only the link to the message.
