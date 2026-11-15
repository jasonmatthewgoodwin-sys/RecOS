# The outside services RecOS connects to

One line per service: what it is for, how RecOS signs in to it, what moves each way, and where it stands. Nothing here holds a secret; every key and token lives in Supabase function secrets or the agent's own task settings (CLAUDE.md, rule 3).

| Service | What for | Sign-in | RecOS reads | RecOS writes | Status | Ticket |
| --- | --- | --- | --- | --- | --- | --- |
| Supabase (Postgres, Auth, Edge Functions, pg_cron) | The database, sign-in, the server functions and the nightly job | Project URL and public key in the browser; service role key in function secrets only | Everything through row-level security | Everything | Live on the test project | P1-01 onwards |
| Microsoft sign-in (Entra ID) | Jason signs in with the work account. Name and email only, never mail or calendar permissions (rule 7) | OAuth through Supabase Auth; client ID and secret in the auth provider settings | Name, email | Nothing | Not yet registered; the emailed link and the password work meanwhile | P1-05 |
| Microsoft Graph, Outlook mail | Send the automatic and one-click emails, open drafts in Outlook, read replies for the follow-up sweep | A connection Jason authorises once, token held in function secrets, scoped to Mail.ReadWrite and Mail.Send on his own mailbox | Replies in threads RecOS started (A5, section 21) | Drafts and sends through the send engine only (rule 5) | The engine is built (0034). Open in Outlook is a compose link today; sends go through the sender routine with Jason's Outlook connector; no Graph app yet | P1-26, P1-27, check P6 |
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

## How a message leaves (15 November 2026)

Only the send engine can cause a message to leave (rule 5). An agent writes a `message` through `agent-write`; the engine decides at once (level, ceiling, approved template, do-not-contact, opt-out, caps, sending window, the stop switch) and logs the decision in `send_log`. An automatic message waits in the queue for its window. A one-click message waits on the Follow-ups deck until Jason presses Send, which queues it. A draft-only message opens in Outlook on the web from a compose link, Jason sends it there and presses Mark as sent. Queued messages are carried by the sender routine, which calls `/send/tick`, sends through Jason's Outlook connector and reports back. The stop switch under Settings, Send rules halts the queue at once.

## Campaign tools and LinkedIn state (15 November 2026)

Mia asked three things on the ad and post chaser card: a button that puts the poster into an email campaign that runs by itself, a pull of their details from SourceWhale, and a way for RecOS to know whether Jason has already reached out to someone on LinkedIn.

**What exists now.** Add to campaign creates the campaign in RecOS (Content, Campaigns) with the three steps: spec email, call, message. The card keeps the outreach ladder and an editable note on where he is. Nothing leaves RecOS yet.

**Spott, chosen by Mia on 15 November.** Spott is the CRM and the record, and it runs the email campaigns. The hand-off is built (0040): Add to campaign writes the campaign in RecOS; A8 Campaign runner, a Claude routine with Jason's Spott connector, reads planned campaigns through `context?want=campaigns`, enrols the person in the Spott sequence named RecOS spec (RecOS candidate for a candidate) and reports each step back through `agent-write` as a `campaign_step`. RecOS keeps the sequence reference and link only. No Spott key sits in the browser or the repository. Jason creates the two sequences in Spott and the routine; the prompt is `agents/prompts/a8_campaigns.md`.

**SourceWhale.** SourceWhale runs outreach sequences across email and LinkedIn and tracks each step, including whether a connection request was sent, accepted and messaged. It offers an API and webhooks to paying accounts; what exactly is exposed depends on the plan, so the first step is to ask SourceWhale for API access on Jason's account. With it: RecOS pulls a person's sequence status into the outreach ladder (connection sent, connected, messaged, replied) instead of Jason marking it by hand, and Add to campaign enrols the poster in a SourceWhale sequence. That would make SourceWhale the one source of truth for outreach state, which is the cleanest answer to the LinkedIn question below. The pull runs in a routine or in the `run-agent` context, never from the browser.

**LinkedIn.** LinkedIn has no API for a person's connection or message state, and the browser must not scrape it (CLAUDE.md, rule 1 and the calm rules). Three honest routes: (1) SourceWhale, if it sends the LinkedIn steps for Jason, already knows the state and can report it (above); (2) the LinkedIn scraper the business runs can be asked to include connection state for each poster it finds, and A3 Jobs writes it as an `outreach_step`; (3) a Claude routine with LinkedIn open in Chrome reads the state of a short list of profiles once a day and writes `outreach_step` records, which is slow and fragile and the last resort. Until one of these is in place, the ladder is marked by hand on the card.

**SourceWhale** stays the fallback if Spott's sequences prove too thin; the same `campaign_step` contract would carry it.
**Jason decides** which tool runs the email campaign (Spott or SourceWhale), and asks that tool for API access. Then the routine is a day's work.

## Direct connections: Outlook, Granola, Spott (15 November 2026)

Route B of 24.1, built but not deployed. Settings, Connections shows each app's state (Connected, Needs sign-in, Failing, Not connected), the account and when it last worked, and connects or disconnects it.

- **Outlook (Graph).** Jason presses Connect Outlook, signs in with his work account and consents as a user to `offline_access User.Read Mail.Send Mail.ReadWrite Calendars.Read`. The app registration is multi-tenant, in an Azure directory he owns. Function secrets `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, and optionally `MS_REDIRECT_URI` and `APP_URL`. The refresh token is kept in Supabase Vault, not in function secrets as the table above says, because it is per user and rotates. `functions/outlook/graph.ts` has the mail and calendar operations of 24.2 and 24.3 and `sendViaGraph` for the send engine. See `functions/outlook/README.md`.
- **Granola.** Jason pastes an API key (Granola: Settings, API; Business plan). It is checked with one notes read and kept in Vault.
- **Spott.** Jason pastes an API key (Spott: Settings, API; admin only). It is checked with a one-row candidate list (`GET https://api.gospott.com/candidates?limit=1`, `x-api-key`) and kept in Vault.

Keys and tokens never reach the browser; the browser reads status only, from `connections` (migrations 0040 and 0041). The agents' Claude connectors keep working as before; nothing uses the stored Granola or Spott key yet.
