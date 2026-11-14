# Handover: where the build stands

Updated 14 November 2026, mid afternoon. Written so the build can be picked up in a fresh Claude Code session, on this computer or another, under any Claude account.

## In one paragraph

Most of week 1 is built. The app runs: Home shows its four numbers, the sentence and the Start button; the nine file tabs, routes and keyboard shortcuts work. The database is live in Jason's Supabase test project with access rules on every table. Jason has **not yet signed in**, so the targets and the sample week are not loaded and Home has not been seen on real data. Week 2 has started: the business-development tables and their KPI triggers (P1-18, P1-19) are built and tested locally but **not yet applied to the test project**.

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
| P1-10 Seeds | Settings, agents and send policies are in. Targets and sample week **not loaded yet** |
| P1-11 Import KPI log and inbox sheet | Not started. Needs the sheets from Jason |
| P1-12 Shell | Done |
| P1-13 Home | Done. T-HOME-1 to 7 pass. Seen only on sample data so far |
| P1-18 Business development tables | Done locally: migration 0018 and six policy files. **Not applied to the test project** |
| P1-19 KPI triggers for the BD tables | Done locally: migration 0019. **Not applied to the test project** |
| P1-21 Deck, Card, Draft, Note, Switch, Field | Done. See `/gallery` |

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

### 2. Apply the week 2 migrations to the test project

In the Supabase SQL editor for the test project, run in this order: `db/migrations/0018_business_development.sql`, `db/migrations/0019_kpi_bd_triggers.sql`, then the six new files in `db/policies` (`job_leads`, `coaching_sessions`, `referrals`, `wider_leads`, `campaigns`, `target_companies`). This does not need Jason to have signed in. Do it before step 3: the sample week now writes to these tables.

### 3. Load the data, once Jason has signed in

In the Supabase SQL editor for the test project, run `db/seed/targets.sql`, then `db/seed/sample_week.sql`. Both need the owner to have signed in once. Home should then show 07, 03, the calls left today, and 2/4.

### 4. Jason reviews Home

Against the checklist in section 7 of `docs/build-instructions.md`. Is it calm? Could anything go?

### 5. Tidy-ups Jason should decide

- Check the test project's region (Project Settings, General). The design asks for UK or EU. If it is in the US, recreate it now: `node db/bundle.mjs` rebuilds the one-file setup.
- Rename the project `recos-test`, and create `recos-live` in the same region. Leave live empty.
- Microsoft sign-in (section 6 of `docs/build-instructions.md`). Optional. The emailed link is the designed fallback.
- The three rows still marked Pending in `docs/decisions.md`.

### 6. The rest of week 2

Tickets P1-14 to P1-25 in section 38.2 of `docs/low-level-design.md`. P1-18, P1-19 and P1-21 are done. A sensible order for the rest:

1. P1-14 to P1-16 and P1-20: the agent endpoints and the write endpoint with its fit score (sections 15, 16, 23.1). These are Supabase Edge Functions. Deploying them needs the Supabase command line tool and Jason's login; no function has been written yet. They can be written and unit-tested without deploying.
2. P1-23 Jobs page and job card (section 28) needs nothing from Jason and can run alongside item 1. P1-22 Inbox (section 27) depends on P1-15.
3. P1-17 bridge sheet pull and P1-24 import need the sheets from Jason.

New database changes are new numbered files in `db/migrations` (next is 0020), with a policy file for every new table. `npm test` in `db/` fails if a table has no policy file. Apply new files to the test project through the SQL editor.

## Hosting on Vercel, so Jason can sign in from a web address

Mia chose Vercel on 14 November, in Jason's own Vercel account, so the address belongs to him like the repository and the database. Nothing is deployed yet. `app/vercel.json` is in place so every route serves the app. The app sends sign-in links back to whatever address it runs on, so no code changes with the host.

Mia is setting this up in Jason's name (14 November). It is done once and takes about ten minutes:

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
- Migrations 0018 and 0019 on a real Supabase project. They pass in the in-memory Postgres under both grant models.
- Anything else from week 2 on.

## First message to paste into a new Claude Code session

Open a terminal in the repository folder, start Claude Code and paste:

> Read CLAUDE.md, HANDOVER.md, docs/build-log.md and docs/decisions.md. Do not write any code yet. Tell me in plain English what is built, what is blocked, and what you need from me. Then we will get Jason signed in, load the sample week, and start the week 2 tickets in the order HANDOVER.md gives.
