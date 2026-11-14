# Handover: where the build stands

Written 14 November 2026 for Jason, picking this up on another computer. Mia set up the repository and Claude Code built as much of week 1 as it could without the Supabase projects.

## In one paragraph

The app runs. Home shows its four numbers, the sentence and the Start button, on invented sample data. The nine file tabs, the routes and the keyboard shortcuts work. The database for week 1 is written as SQL files with access rules on every table, and 25 tests prove those rules in a throwaway database. Nothing has touched Supabase or Microsoft yet, because those accounts are yours to create.

## Get it running on your computer

1. Install Git, Node.js (current long-term version) and Claude Code.
2. Clone the repository. Not inside OneDrive. `C:\dev\recos` is fine.
3. In a terminal:

```bash
cd app
npm install
npm run dev
```

4. Open the address it prints. You should see Home.

To run the checks:

```bash
cd app
npm test
```

```bash
cd db
npm install
npm test
```

## What is done

| Ticket | State |
| --- | --- |
| P1-02 Repository and structure | Done |
| P1-03 Theme | Done. Default typefaces in use |
| P1-04 Components and gallery | Done. See `/gallery` while running `npm run dev` |
| P1-05 Microsoft sign-in | Written. Not yet tried against Microsoft |
| P1-06 Allow-list and roles | Written and tested locally |
| P1-07, P1-08 Tables | Written and tested locally. 19 tables |
| P1-09 Access rules | Written. 25 tests pass |
| P1-10 Seeds | Written. Sample week is invented |
| P1-12 Shell | Done |
| P1-13 Home | Done on sample data. T-HOME-1 to 7 pass |

Not started: P1-01 (create the projects) and P1-11 (import the KPI log and inbox sheet). Both need you.

`docs/build-log.md` has one line per ticket with what is left open. `docs/decisions.md` lists every choice made on your behalf. Four are marked Pending and need your yes or no.

## What Claude Code needs from you, in order

1. **Look at Home and say yes or what to change.** Use the checklist in section 7 of `docs/build-instructions.md`. Is it calm? Could anything go?
2. **Two typefaces, or a yes to the defaults** (Space Grotesk and Space Mono).
3. **Create the two Supabase projects**, `recos-test` and `recos-live`, in London if offered. Section 4 of `docs/build-instructions.md`. Give Claude Code the test project's URL and public key. Never paste a database password or the service role key into a chat.
4. **Your work email address**, for the allow-list.
5. **Set up Microsoft sign-in.** Section 6 of `docs/build-instructions.md`. If your firm blocks it, do not chase it: the emailed link works instead.
6. **The KPI log and the inbox sheet**, for the import.
7. **A yes or no on the four Pending rows** in `docs/decisions.md`.

## First message to send Claude Code

Open a terminal in the repository folder, start Claude Code and paste this:

> Read CLAUDE.md, HANDOVER.md, docs/build-log.md and docs/decisions.md. Do not write any code yet. Tell me in plain English what is built, what you need from me to finish week 1, and the first thing we should do together.

## What was not checked

- Nothing has run against a real Supabase project. The SQL was tested in an in-memory Postgres with a small stand-in for Supabase's roles. Expect small fixes when it first meets the real thing, most likely in the two sign-in hooks.
- Sign-in has not been tried against Microsoft.
- Screens were checked by eye in the paper theme at laptop and phone width. The night theme was not reviewed.
- Server functions, the Inbox and everything from week 2 on are not started.
