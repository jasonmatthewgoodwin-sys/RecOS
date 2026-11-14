# Handover: where the build stands

Updated 14 November 2026, early afternoon. Written so the build can be picked up in a fresh Claude Code session, on this computer or another, under any Claude account.

## In one paragraph

Most of week 1 is built. The app runs: Home shows its four numbers, the sentence and the Start button; the nine file tabs, routes and keyboard shortcuts work. The database is live in Jason's Supabase test project with access rules on every table. Jason has **not yet signed in**, so the targets and the sample week are not loaded and Home has not been seen on real data. Week 2 is not started.

## Where everything is

| Thing | Where |
| --- | --- |
| Code | `https://github.com/jasonmatthewgoodwin-sys/RecOS` (private, Jason's account). On Mia's computer it is at `C:\dev\recos` |
| Original documents | Mia's `Desktop\PLATFORM SPEC` folder. Converted copies are in `docs/` |
| Supabase test project | Ref `vbnzdugfgoletjlumxba`, in Jason's Supabase account. Shown in the dashboard as "jasonmatthewgoodwin-sys's Project". Region not yet checked |
| Supabase live project | Not created |
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

Both pass as of this note: 25 app tests, and 25 database tests run twice under two grant models.

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
| P1-10 Seeds | Settings, agents and send policies are in. Targets and sample week **not loaded yet** |
| P1-11 Import KPI log and inbox sheet | Not started. Needs the sheets from Jason |
| P1-12 Shell | Done |
| P1-13 Home | Done. T-HOME-1 to 7 pass. Seen only on sample data so far |

## What was done in the Supabase dashboard

Done by Claude through Chrome, signed in as Jason, on 14 November:

- Ran the whole of `db/migrations`, `db/policies` and `db/views` in the SQL editor, as one file built by `node db/bundle.mjs`.
- Authentication, Auth Hooks: switched on **Customize Access Token** (`custom_access_token_hook`) and **Before User Created** (`before_user_created_hook`).
- Authentication, URL Configuration: Site URL set to `http://localhost:5173`.

Nothing else was changed. No secret key or database password has been seen by Claude or written anywhere.

## The next steps, in order

### 1. Get Jason signed in (blocked until about 14:20 on 14 November)

Supabase's free email service sends only about two emails an hour and the limit was hit at 13:15. After 14:20:

1. Open `http://localhost:5173` on the computer running the app.
2. Click **Email me a sign-in link**, enter `jason@3searchgroup.com`, press **Send link** once.
3. Open that email **on the same computer** and click the link. Any browser on that computer works. A phone or another laptop will show "site can't be reached", because the app only exists on the computer running it.
4. Only the newest email works. Older links are dead.

What went wrong earlier, so it is not repeated: links were opened on another device, and repeat requests used up the hourly limit. The app shows "a link is on its way" whether or not an email was sent, by design, so it cannot be used to test addresses.

### 2. Load the data, once Jason has signed in

In the Supabase SQL editor for the test project, run `db/seed/targets.sql`, then `db/seed/sample_week.sql`. Both need the owner to have signed in once. Home should then show 07, 03, the calls left today, and 2/4.

### 3. Jason reviews Home

Against the checklist in section 7 of `docs/build-instructions.md`. Is it calm? Could anything go?

### 4. Tidy-ups Jason should decide

- Check the test project's region (Project Settings, General). The design asks for UK or EU. If it is in the US, recreate it now: `node db/bundle.mjs` rebuilds the one-file setup.
- Rename the project `recos-test`, and create `recos-live` in the same region. Leave live empty.
- Microsoft sign-in (section 6 of `docs/build-instructions.md`). Optional. The emailed link is the designed fallback.
- The three rows still marked Pending in `docs/decisions.md`.

### 5. Week 2

Tickets P1-14 to P1-25 in section 38.2 of `docs/low-level-design.md`. A sensible order that needs nothing more from Jason at first:

1. P1-18 business-development tables (section 9), then P1-19 KPI triggers (section 22).
2. P1-14 to P1-16 and P1-20: the agent endpoints and the write endpoint with its fit score (sections 15, 16, 23.1). These are Supabase Edge Functions. Deploying them needs the Supabase command line tool and Jason's login; no function has been written yet.
3. P1-21 Deck and Card components, P1-22 Inbox, P1-23 Jobs page (sections 27, 28).

New database changes are new numbered files in `db/migrations` (next is 0018), with a policy file for every new table. `npm test` in `db/` fails if a table has no policy file. Apply new files to the test project through the SQL editor.

## Working habits that matter

- The rules in `CLAUDE.md` under "Rules that are never broken" are binding. Thin person records, row-level security on every table, no secrets in the browser or repository, agents write through one endpoint, only the send engine sends, KPIs are events written by triggers.
- One ticket, one commit, with the ticket ID in the message. Add a line to `docs/build-log.md` each time.
- Never ask for, paste or store the Supabase secret key, the service role key or a database password. Jason sets secrets himself.
- Use invented names in seeds, fixtures and tests.
- The brief says to stop at the end of each week's tickets for Jason's review. Mia asked for week 1 to be built in one sitting; that is recorded in `docs/decisions.md`.

## What has not been checked

- Signing in end to end. The hooks refuse strangers and accept Jason's address, but no session has been completed, so the role in the token and the owner's view of the data are untested on the real project.
- Microsoft sign-in.
- The night theme.
- Anything from week 2 on.

## First message to paste into a new Claude Code session

Open a terminal in the repository folder, start Claude Code and paste:

> Read CLAUDE.md, HANDOVER.md, docs/build-log.md and docs/decisions.md. Do not write any code yet. Tell me in plain English what is built, what is blocked, and what you need from me. Then we will get Jason signed in, load the sample week, and start the week 2 tickets in the order HANDOVER.md gives.
