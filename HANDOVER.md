# Handover: where the build stands

Updated 14 November 2026, mid afternoon. Written so the build can be picked up in a fresh Claude Code session, on this computer or another, under any Claude account.

## In one paragraph

Week 1 is built and four week 2 tickets are done, the latest being the Leads Jobs page and job card (P1-23). The app is live at `https://rec-os-gules.vercel.app` and runs on Jason's Supabase test project, which now holds every migration to 0019, access rules on all 25 tables, the targets and the sample week. Jason has signed in twice by emailed link. Home has not yet been seen by him on the real data. The rest of week 2 is being built in the cloud.

## Where everything is

`docs/integrations.md` lists the outside services RecOS connects to (Microsoft, Outlook, Granola, the CRM, LinkedIn, the agents, Vercel, GitHub, the drive) with how each signs in and what is built.

| Thing | Where |
| --- | --- |
| Code | `https://github.com/jasonmatthewgoodwin-sys/RecOS` (private, Jason's account). On Mia's computer it is at `C:\dev\recos` |
| Original documents | Mia's `Desktop\PLATFORM SPEC` folder. Converted copies are in `docs/` |
| Supabase test project | Ref `vbnzdugfgoletjlumxba`, in Jason's Supabase account. Shown in the dashboard as "jasonmatthewgoodwin-sys's Project". Region not yet checked |
| Supabase live project | Not created |
| The app, on the web | `https://rec-os-gules.vercel.app`. Vercel project `rec-os` in Jason's Vercel team `rec-os`, connected to the GitHub repository with root directory `app`. Every push to `main` deploys in about a minute |
| The brief | `CLAUDE.md`. Read first, every session |
| Per-ticket record | `docs/build-log.md` |
| Choices made, and those awaiting Jason's yes | `docs/decisions.md` |

## Get it running

You need Git, Node.js (current long-term version) and Claude Code. On Mia's computer all three are installed.

1. Get the code. On another computer, clone the repository, not inside OneDrive. On Mia's computer it is already at `C:\dev\recos`.
2. Create the file `app/.env.local` with these two lines. Both values are safe for a browser. The file is deliberately not in the repository.

```text
VITE_SUPABASE_URL=https://vbnzdugfgoletjlumxba.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_Tlc-Gir9YN6UerFeyQBdbw_gkvT3pWT
```

3. Start it:

```bash
cd app
npm install
npm run dev
```

4. Open `http://localhost:5173`. It must be port 5173: Supabase sends the sign-in link back to that address.

Without `app/.env.local` the app runs on invented sample data and skips sign-in, which is handy for building screens.

Checks:

```bash
cd app
npm test
```

```bash
cd db
npm install
npm test
```

Both pass as of this note: 42 app tests, and 31 database tests run twice under two grant models.

To look at the components without signing in, add a file `app/.env.gallery` holding `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=` (both empty), then run `npm run dev -- --mode gallery --port 5174` in `app` and open `http://localhost:5174/gallery`. The file is ignored by git.

## What is done

| Ticket | State |
| --- | --- |
| P1-01 Projects | Test project created and set up. Live not created. Region not confirmed |
| P1-02 Repository | Done |
| P1-03 Theme | Done. Jason said yes to Space Grotesk and Space Mono |
| P1-04 Components and gallery | Done. `/gallery` while running `npm run dev` |
| P1-05 Microsoft sign-in | Code written. Not set up in Microsoft Entra, not tried |
| P1-06 Allow-list and roles | Done and working on Supabase. Only `jason@3searchgroup.com` is accepted. A made-up address was refused |
| P1-07, P1-08 Tables | Done. Migrations 0001 to 0017 applied to the test project |
| P1-09 Access rules | Done. Every table refuses anonymous reads on the real project |
| P1-10 Seeds | Settings, agents and send policies are in. Targets and the sample week loaded on the test project on 14 November |
| P1-11 Import KPI log and inbox sheet | Not started. Needs the sheets from Jason |
| P1-12 Shell | Done |
| P1-13 Home | Done. T-HOME-1 to 7 pass. Seen only on sample data so far |
| P1-18 Business development tables | Done. Migration 0018 and six policy files applied to the test project on 14 November |
| P1-19 KPI triggers for the BD tables | Done. Migration 0019 applied to the test project on 14 November |
| P1-21 Deck, Card, Draft, Note, Switch, Field | Done. See `/gallery` |
| P1-30 Follow-up lifecycle | Done. Migration 0020 applied to the test project on 14 November |
| P1-37, P1-38 Lists, league, touches, signals | Done. Migration 0021, five policy files, `league_due_view`, `lists.sql` and `sample_league.sql` applied to the test project on 14 November |
| P1-35 Search and quick capture | Done. Keys / and c, or the icons at the top right of the tabs |
| P1-14, P1-15, P1-16 Agent endpoints and the write contract | Done in the database (migration 0025, applied to the test project on 14 November) with thin edge functions in `functions/`. Not deployed: see `functions/README.md` |
| P1-48 Phone layout for Home, Inbox, Follow-ups | Done. Other pages say Best on a laptop at phone width. Not yet seen on an iPhone |
| P1-47 Retention job, nightly sweeps, monitoring checks | Done as `nightly()` in migration 0024, applied to the test project on 14 November. `db/jobs/schedule.sql` (pg_cron) still to run on the test project |
| P1-46 Settings: Profile and Data, person find, export and delete | Done as database functions the page calls. Migration 0023 applied to the test project on 14 November |
| P1-45 Settings: Agents, Send rules, Targets, Templates | Done, Templates as a line until P1-29. Migration 0022 applied to the test project on 14 November |
| P1-43 Numbers Quarter and Review | Done. `/numbers/quarter`, `/numbers/review`. `db/views/kpi_quarter_view.sql` applied to the test project on 14 November. The A1 repoint (the agent posting its summary through agent-write) waits for P1-14 |
| P1-42 KPI views, streak sentence, Numbers This week | Done. `/numbers/this-week`. `db/views/kpi_week_view.sql` re-run on the test project on 14 November (it now holds three views) |
| P1-40 Signals page and card | Done. `/people/signals`, card by `?card=signal:id`. Not yet seen on the test project's data |
| P1-39 People lists and person card | Done. `/people/senior-network`, `/people/top-candidates`, `?show=all`, card by `?card=person:id`. Not yet seen on the test project's data |
| P1-34 Coaching, Referrals, Wider business | Done. `/people/coaching`, `/leads/referrals`, `/leads/wider`. Not yet seen on the test project's data |
| P1-31 Follow-ups deck, list, Monday focus | Done. `/leads/follow-ups`, `?view=list`, `?focus=monday`. Not yet seen on the test project's data |
| P1-22 Inbox deck and list | Done. `/inbox`, with `?view=list`, `?view=sent` and the card by `?card=item:id`. Not yet seen on the test project's data by Jason |
| P1-23 Leads, Jobs page and job card | Done. `/leads/jobs` and the card by `?card=job:id`. Built in a cloud session, landed from its patch on 14 November. Not yet seen on the test project's data by Jason |

## What was done in the Supabase dashboard

Done by Claude through Chrome, signed in as Jason, on 14 November:

- Ran the whole of `db/migrations`, `db/policies` and `db/views` in the SQL editor, as one file built by `node db/bundle.mjs`.
- Authentication, Auth Hooks: switched on **Customize Access Token** (`custom_access_token_hook`) and **Before User Created** (`before_user_created_hook`).
- Authentication, URL Configuration: Site URL set to `http://localhost:5173`.

Nothing else was changed. No secret key or database password has been seen by Claude or written anywhere.

## The next steps, in order

### 1. Jason signs in at the web address

Open `https://rec-os-gules.vercel.app` on any device, click **Email me a sign-in link**, enter `jason@3searchgroup.com`, press **Send link** once, and open the newest email on the same device within 10 minutes. Older links are dead.

**The emails are rationed.** Supabase's built-in mail service sends only a few sign-in emails an hour per project (the exact figure is under Authentication, Rate Limits). Two were used on 14 November at 13:15 and 14:22; a request inside the same hour sends nothing, and the app still says "a link is on its way", by design, so the form cannot be used to test addresses. If a link does not arrive, wait an hour and ask once. The lasting fix is to connect the project's own mail sender under Authentication, SMTP Settings (a Resend or Postmark account in Jason's name), which lifts the limit and sends from his own address. That is Jason's decision and his account to create.

**A password, once set, avoids the email altogether.** On a device where Jason is signed in, open the cog, Profile, and set a password of 12 characters or more. From then on the sign-in view's third choice, Sign in with a password, works on any device with no email. If the password is forgotten, the emailed link still works, and a new password can be set in Profile. This is a departure from the design, marked Pending for Jason in `docs/decisions.md`.

What went wrong on 14 November, so it is not repeated: before the Site URL was changed, links were sent back to `localhost:5173`, which only exists on the computer running the app; and a used or expired link showed "This account does not have access", which the app now words correctly.

### 2. Applied to the test project on 14 November, and what is waiting

Migrations 0018 and 0019, the six new policy files, `db/seed/targets.sql` and `db/seed/sample_week.sql` were all run in the SQL editor. Home should show 07, 03, the calls left today, and 2/4.

Migrations 0020 and 0021, with 0021's policies, view and seeds (`lists.sql`, `sample_league.sql`), were applied the same afternoon. Migrations 0022 to 0034, with their policies, views and seeds, are all applied as of 15 November. 0035 (content ideas), 0036 (pictures on problem reports) and 0037 (the outreach note) were applied on 15 November and checked. `docs/build-log.md` has a row per migration with the date it reached the test project.

### 3. Jason reviews Home

Against the checklist in section 7 of `docs/build-instructions.md`. Is it calm? Could anything go?

### 4. Tidy-ups Jason should decide

- Check the test project's region (Project Settings, General). The design asks for UK or EU. If it is in the US, recreate it now: `node db/bundle.mjs` rebuilds the one-file setup.
- Rename the project `recos-test`, and create `recos-live` in the same region. Leave live empty.
- Microsoft sign-in (section 6 of `docs/build-instructions.md`). Optional. The emailed link is the designed fallback.
- The three rows still marked Pending in `docs/decisions.md`.

### 5. The rest of week 2

Tickets P1-14 to P1-25 in section 38.2 of `docs/low-level-design.md`. P1-18, P1-19, P1-21 and P1-23 are done. A sensible order for the rest:

1. P1-14 to P1-16 and P1-20: the agent endpoints and the write endpoint with its fit score (sections 15, 16, 23.1). These are Supabase Edge Functions. Deploying them needs the Supabase command line tool and Jason's login; no function has been written yet. They can be written and unit-tested without deploying. A cloud session was started on these on 14 November; see the note on cloud sessions below before expecting a pull request from it.
2. P1-22 Inbox is done against `inbox_items` directly; the agents will fill it through the write endpoint once P1-15 exists.
3. P1-17 bridge sheet pull and P1-24 import need the sheets from Jason.

**Cloud sessions cannot push yet.** Claude Code cloud sessions push with Mia's own GitHub account (`mia61666`), which has no write access to `jasonmatthewgoodwin-sys/RecOS`. The P1-23 session hit a 403 and left its work as a patch file instead, which Mia landed by hand. To let cloud sessions open pull requests, Jason adds `mia61666` as a collaborator with write access on the repository (GitHub, repository Settings, Collaborators). Until then, any cloud session's work arrives as a patch to apply with `git am --3way`.

New database changes are new numbered files in `db/migrations` (next is 0020), with a policy file for every new table. `npm test` in `db/` fails if a table has no policy file. Apply new files to the test project through the SQL editor.

## Added on the evening of 14 November (Mia's asks)

- **Content.** Drafts deck (P1-44) and a month calendar with a composer window. Migration 0028 is applied to the test project. Ideas and Testimonials still say Not built yet.
- **Problems.** The flag at the top right of the tabs raises a problem report from any page; Settings, Problems is the queue. Migration 0029 is applied.
- **Profile summary.** Every person card links to LinkedIn and can ask the signals agent to pull in a short summary. Migration 0030 is applied. The agent's prompt needs one more instruction: read `requests` from run-start, and for each `profile:<person id>` write a `person` record with `profile_summary` (600 characters at most, no contact details).
- **Look.** Sunset sky on Home, the status key at the sheet's top right, a tighter density everywhere, windows that fit without scrolling.
- **Business development.** Jason's spoken notes are written up in `docs/business-development-brief.md` with a suggested order and the decisions needed first. Nothing from it is built yet.

## The night of 14 to 15 November (every phase built)

Mia asked for the whole build overnight, one push, no phases. In the morning no page says Not built yet; a test proves it. What landed:

- **Content** (0031): one calendar for posts and events, Events under Content, Drafts as a gallery.
- **Day view and source links**: Home shows the day under Calls today from the Outlook feed; every source has a labelled link and Outlook emails open in Outlook on the web.
- **Business development** (0032): the outreach ladder on job leads, Referrals with the three call questions, UK to US flags, accounts, the agent behind every tab. From Jason's notes; the brief is `docs/business-development-brief.md`.
- **Searches, candidates, calls** (0033): the search workspace (Brief, Pipeline, Calls, Offer, Close), This week write-ups with five ticks, In process, Warm specs, Placed, the A-star deck, Testimonials, Campaigns.
- **The send engine** (0034, P1-26 to P1-29): templates with versions and approval, the engine as database functions with every decision logged, the `send` function, Send on the Follow-ups deck, Settings, Templates and the Send log.
- **The test project**: migrations 0028 to 0034 were found never applied (an earlier run had been swallowed by the SQL editor's confirmation dialog). All of them, their policies and the templates seed are now applied and checked.

**What Jason does next, in order**

1. Sign in at https://rec-os-gules.vercel.app and click through every tab. Report anything wrong with the flag at the top right.
2. Settings, Templates: read the five starters and press Approve on the ones he is happy with. Nothing sends by itself until then.
3. Deploy the `send` function from his laptop: `supabase functions deploy send --no-verify-jwt` (see `functions/README.md`).
4. Settings, Agents: make an agent key named `sender`, then create the sender routine in Claude with his Outlook connector, as `functions/README.md` describes. Until it exists, queued emails wait and the log says so.
5. Add one instruction to the signals agent's prompt: read `requests` from run-start and write `profile_summary` back for each `profile:<person id>`.
6. Content, Drafts already holds ten ideas in his voice (0035 applied on 15 November); approve the good ones, bin the rest. Ten drafts in his voice appear; approve the good ones, bin the rest.
7. Decide the rows marked Pending in `docs/decisions.md` dated 15 November (Send leaves the follow-up open until sent; Open in Outlook as a compose link; the two-hour pause; no bounce hold yet; the sender routine), and the LinkedIn sending tool and caps from the business-development brief.

## Getting Jason's email sending, in plain steps

RecOS never calls Claude itself and needs no Claude API key. Emails leave through Jason's own Outlook, carried by a Claude routine on his claude.ai account, the same way the seven agents run. The engine in RecOS decides what may go and when; the routine only carries it.

1. **The send function is deployed** (Jason, 15 November, with `supabase/config.toml` listing it). Nothing to do here unless it changes; then `supabase functions deploy send --no-verify-jwt` from the repository folder.
2. **Approve the templates** in RecOS, Settings, Templates: open each of the five starters and press Approve. Nothing sends by itself until a template is approved. This is the owner's act and was left for him.
3. **Make the sender key.** Settings, Agents, open the row called Outlook sender (migration 0039), press Create key and copy the key once. RecOS does not show it again; if it is lost, Revoke and Create key again.
4. **Give the routines the key.** Jason has already made three sender routines in claude.ai (a routine runs at most hourly, so three of them, at :05, :25 and :45, tick every 20 minutes between 13:00 and 23:00 London time, which is 08:00 to 18:00 New York). Each reads `RECOS_URL` (`https://vbnzdugfgoletjlumxba.supabase.co/functions/v1`, the same value the agent routines use) and `RECOS_KEY_SENDER`. Paste the key from step 3 into `RECOS_KEY_SENDER` on each of the three. The prompt is `agents/prompts/sender.md`.
5. **Send one test to himself.** Settings, Send rules, open Thank-you after a call, press Send a test to yourself. It queues one email to his own inbox; the sender routine carries it on its next tick (within 20 minutes in the window) and the Send log (top right of Send rules) shows queued, then sent. One such test was queued for him on 15 November, so the first routine run with the key in place delivers it.
6. **Switch on automatic** one message type at a time in Send rules, starting with the thank-you after a call. The others stay at one click until he is happy.

Later, if he wants to drop the routine, the same function can send through Microsoft Graph directly: that needs an app registration in Microsoft Entra with Mail.Send on his mailbox and the token in the function's secrets (section 15.6, check P6). Not needed for day one.

## Email campaigns through Spott (15 November)

Mia chose Spott to run the email campaigns. Add to campaign on an ad and post chaser card makes the campaign in RecOS; a new agent, A8 Campaign runner, enrols the person in Spott and reports each step back. Jason does three things:

1. In Spott, make two sequences named exactly **RecOS spec** (for a hiring manager behind a job ad) and **RecOS candidate** (for a candidate being introduced). Their emails are written in Spott, where they belong.
2. In RecOS, Settings, Agents: open Campaign runner and press Create key (migration 0040 adds the row).
3. In claude.ai, a routine named RecOS campaign runner with the Spott connector attached, `RECOS_URL` and `RECOS_KEY_A8_CAMPAIGNS` in its environment, weekdays at 09:10 and 15:10 London time, and the bootstrap prompt from `agents/prompts/bootstrap.md` pasted in (it calls run-start as `a8_campaigns` and follows the stored prompt).

Then: Add to campaign on a chaser, and within a run the card under Content, Campaigns says In Spott since, the steps tick as Spott sends and the replies count moves.

## Hosting on Vercel, so Jason can sign in from a web address

Mia chose Vercel on 14 November, in Jason's own Vercel account, so the address belongs to him like the repository and the database. Nothing is deployed yet. `app/vercel.json` is in place so every route serves the app. The app sends sign-in links back to whatever address it runs on, so no code changes with the host.

**Done on 14 November.** The app is at `https://rec-os-gules.vercel.app`. Set up by Mia in Jason's name: Vercel team `rec-os`, project `rec-os`, GitHub app installed on the RecOS repository only, root directory `app`, the two public values set for Production and Preview. In Supabase the Site URL is the Vercel address and the redirect list holds `http://localhost:5173/**` and `https://rec-os-gules.vercel.app/**`. For the record, the steps were:

1. Go to vercel.com and choose Continue with GitHub, signed in as Jason's GitHub account, the one that owns the repository. Pick the free Hobby plan.
2. Add New, Project. When Vercel asks which repositories it may see, choose `RecOS` only. Then click Import next to `RecOS`.
3. On the import page: Root Directory, click Edit and choose `app`. Framework Preset should say Vite. Leave the build settings alone.
4. Open Environment Variables on the same page and add two: name `VITE_SUPABASE_URL` with the value `https://vbnzdugfgoletjlumxba.supabase.co`, and name `VITE_SUPABASE_ANON_KEY` with the value `sb_publishable_Tlc-Gir9YN6UerFeyQBdbw_gkvT3pWT`. Both are safe for a browser. Never add any other key here.
5. Click Deploy and wait for the tick. Note the address it gives you, something like `https://recos.vercel.app`, and write it in this file under "Where everything is".

Then in the Supabase dashboard (supabase.com, the test project), Authentication, URL Configuration:

6. Site URL: paste the Vercel address. Save.
7. Redirect URLs: add `http://localhost:5173/**` so the app still works on a laptop. Save.

Open the Vercel address, click Email me a sign-in link, and open the email on any device. It will work from a phone now.

After that, every push to `main` deploys on its own. The live project, when it exists, gets its own Vercel project with its own two values.

## Structure changes on 14 November, all Pending Jason's yes

Mia asked for these while directing the build; each is a row in `docs/decisions.md`:

- The Leads tab is called Business development (route still `/leads`).
- There are eight file tabs. Candidates has gone: its pages sit under Searches (Open, This week, In process, Warm specs, Placed), and the A-star feed under People.
- People has a page per list: Senior network (the `leader` half of the league, people who are or could be hiring managers) and Top candidates (the `a_star` half, A-grade people placeable widely), then A-star, Signals, Accounts and Coaching. More lists later come from a `lists` table, to be built with the league.
- In a search, candidates come from the CRM over its API: automatically where linked, or by Add candidate (search the CRM by name, or pick from a People list). Phase 2.

## Working habits that matter

- The rules in `CLAUDE.md` under "Rules that are never broken" are binding. Thin person records, row-level security on every table, no secrets in the browser or repository, agents write through one endpoint, only the send engine sends, KPIs are events written by triggers.
- One ticket, one commit, with the ticket ID in the message. Add a line to `docs/build-log.md` each time.
- Mia and Jason both push to `main` from their own computers. Run `git pull` before starting and again before pushing. Keep commits small. Say which ticket you are on so two people do not build the same one.
- Never ask for, paste or store the Supabase secret key, the service role key or a database password. Jason sets secrets himself.
- Use invented names in seeds, fixtures and tests.
- The brief says to stop at the end of each week's tickets for Jason's review. Mia asked for week 1 to be built in one sitting; that is recorded in `docs/decisions.md`.

## What has not been checked

- Signing in end to end. The hooks refuse strangers and accept Jason's address, but no session has been completed, so the role in the token and the owner's view of the data are untested on the real project.
- Microsoft sign-in.
- The night theme, and the new components on a phone.
- Home on the real data, as Jason sees it. The counts behind it were checked by query on the test project.
- Anything else from week 2 on.
- A real send. The engine is tested in the database (49 tests), but no email has left through the sender routine, because it does not exist yet and the `send` function is not deployed.
- The pages built on the night of 14 to 15 November on the test project's real data; all were seen on sample data and in tests.

## First message to paste into a new Claude Code session

Open a terminal in the repository folder, start Claude Code and paste:

> Read CLAUDE.md, HANDOVER.md, docs/build-log.md and docs/decisions.md. Do not write any code yet. Tell me in plain English what is built, what is blocked, and what you need from me. Then we will get Jason signed in, load the sample week, and start the week 2 tickets in the order HANDOVER.md gives.


## Tasks tab (16 November, cloud session)

Mia asked for the Inbox to become a master to-do list called Tasks, filled
automatically from every source, with colour for status, filters, reorder,
email from the task and context links. It is built on branch
`claude/tasks-main`, on top of main at `9163de4`, as three commits. The
cloud session could not push (GitHub refuses `mia61666`), so the commits are
also in `tasks-main.patch` beside this file when handed over: apply with
`git am --3way tasks-main.patch` on a branch from main, as the P1-23 patch was.

Applied to the test project already, through the Supabase management API on
16 November: migration 0049, `db/policies/task_overrides.sql` and
`db/views/tasks_view.sql`. The view returns 205 tasks on the live data and
write-up requests exist for this week's calls. Nothing else on the project
was changed. So once the patch lands and Vercel deploys, `/tasks` works on
the live data at once.

Decisions for Jason, Pending in `docs/decisions.md` dated 16 November:
Inbox becomes Tasks; the board opens first; the tone marks for status; the
write-up agent after each call.

Still to do for after-each-call write-ups: change A6's scheduled task in
Claude to every 30 minutes, Monday to Friday 9:00 to 19:30, with the prompt
told to finish at once when run-start returns no `requests`.

Note for anyone running `cd app && npm test` on a new computer: the page
tests spy on the live data object, so the file `app/.env.test` must hold
the two public lines from "Get it running" above, or 89 tests fail with a
stack overflow. The file is ignored by git.

## Task chat, the task assistant and the status rules (16 November, cloud session, later)

What changed: every task card has a chat at the bottom with three asks: Still relevant?, Change it (needs words) and Do this for me. The ask goes to a new agent, the task assistant (`a9_tasks`), which reads the task, the chat, the draft, the thread in Outlook and the call notes, then answers in the chat and either closes the task, rewrites its draft or does the work. Open in Outlook now makes the draft as a reply in the last thread with that person when Outlook is connected. A search's status (intake, open, offer, on hold) follows what the morning searches run finds. Job leads and ad chases never sit in Later.

Done on the project on 16 November (from the cloud session, at Mia's ask): migrations 0052 and 0053, both policy files, the tasks view, the searches prompt seed, the sample week removed (`db/seed/remove_sample_week.sql`, run once), and the send function redeployed.

What must still be done by hand:

1. In RecOS, Settings, Agents: Task assistant, Create key. Then make the four claude.ai routines in `agents/prompts/a9_tasks.md`. Until they exist, an ask in a task's chat waits.

