# RecOS: handover prompt for Claude Code

Save this file in the root of the repository as `CLAUDE.md` so it is read at the start of every session. The first message to send is at the bottom.

---

## What you are building

RecOS is a private web app for one recruiter, Jason, who runs a product marketing recruitment desk into the US market from London. It gives him one calm place to see what needs doing, act on it and know whether the week is on track. Seven background agents do the finding, sorting, drafting and reminding. They already run as Claude scheduled tasks outside this codebase and will post into RecOS through one endpoint.

There is one user (the owner) and optionally one read-only reviewer. This is not a multi-user product and should not be built like one.

## Read these first, in this order

1. `docs/high-level-design.md` (about 15 pages). The shape of the system and the decisions already made.
2. `docs/low-level-design.md`, section 3 (experience and visual design) and section 4 (technology). Read section 3 twice.
3. `docs/low-level-design.md`, section 38 (build backlog). This is your work order.
4. The rest of the low-level design, section by section, as each ticket calls for it. Every ticket names the sections it implements.
5. `docs/product-spec.md` only when you need to know why a feature exists.
6. `docs/ui-inspiration/`. Five reference images. Look at them before writing any front-end code.

The low-level design is long. Do not try to hold all of it at once. Read the sections a ticket names, build, test, move on.

## When the documents disagree

- The product spec wins on what the system should do.
- The low-level design wins on layout, visual design and how things are built. It carries a later design brief. The spec's older layout (a left menu, a seven-panel Today page, charts) is superseded. Ignore it.
- This file wins over both on tooling. The low-level design mentions Lovable as the front-end builder in sections 4.6 (check P2) and 36.1 (step 8). That has changed: you build the front end by hand in this repository. Skip check P2.
- The markdown exports have placeholders where wireframe diagrams were. The written rules in section 3 and the screen sections (26 to 32) are complete without them.

If something is still unclear after that, stop and ask. Do not guess on anything that touches data, sending or sign-in.

## Stack

| Layer | Use |
| --- | --- |
| Front end | React, TypeScript, Vite |
| Styling | Tailwind CSS, driven by the design tokens in section 25 of the low-level design |
| Database | Postgres on Supabase |
| Sign-in | Supabase Auth with Microsoft as the provider. Name and email only. Emailed one-time link as fallback |
| Server functions | Supabase Edge Functions, TypeScript |
| Tests | Vitest for units, Playwright for screens, pgTAP or SQL scripts for access rules |
| Hosting | A static host for the front end. Not yet chosen, so keep the build host-neutral |

Do not add a chart library, a state management framework or a component kit. Fetch data with the Supabase client and a small data layer in `app/src/lib`. If you think you need another dependency, ask first and say why.

## Repository layout

Use the structure in section 4.4 of the low-level design:

```text
recos/
  CLAUDE.md
  app/                 front end
    src/
      routes/          one folder per file tab
      components/      shared components from section 3.9
      lib/             data client, formatters, keyboard
      theme/           tokens
  db/
    migrations/        numbered SQL files
    seed/              sample week for test
    policies/          row-level security, one file per table
    views/             KPI and funnel views
  functions/
    agent-write/
    send/
    person/
    export/
    run-agent/
  agents/
    prompts/           one file per agent, mirrored into the database
    fixtures/          sample inputs and expected outputs for tests
  docs/
```

## The design rules are requirements

Jason gets distracted and overwhelmed by busy screens. The look and feel is the product. A screen that breaks any rule below is not finished, however well it works.

1. Home is nearly blank: the date, a greeting, four numbers (Needs you, Follow-ups, Calls today, This week), one sentence and one Start button. Nothing else.
2. Navigation is nine file tabs along the top of a single sheet: Home, Inbox, Leads, People, Searches, Candidates, Content, Events, Numbers. Settings sits behind a small cog. There is no side menu.
3. Sub-pages are small text tabs inside the sheet.
4. No page other than Home shows more than two large numbers.
5. No charts of any kind. Progress is a fraction with a row of ticks. A trend is one sentence. A funnel is a line of numbers.
6. Grey and black only. Paper `#EFEDE8`, sheet `#F6F4F0`, ink `#1C1C1A` and the greys in the token file. No red, amber or green. No accent colour.
7. State is shown with a solid or hollow dot, font weight and plain words such as Late, Cold or Auto. Never with colour.
8. Inbox and Follow-ups show one item at a time, like a track in a music player, with the full list one click away.
9. One primary button per screen.
10. Clicking a row lifts a card over the right half of the sheet. The page behind stays put.
11. One sans typeface and one mono typeface. Mono for numbers, dates and labels.
12. Nothing moves on its own. No pop-ups, no toasts stacking up, no numbered badges, no live updates pushing into view. One dark note for system messages, used rarely.
13. Everything works by keyboard and reads correctly in greyscale.

Section 3.16 of the low-level design has a review checklist. Run every screen against it before you call the ticket done.

## Rules that are never broken

1. **The CRM is the record.** RecOS stores a thin reference to a person: an ID, a link, a name, a title and a company. Never store CVs, phone numbers, email addresses of candidates or clients, pay details or call note text. If a ticket seems to need one of these, stop and ask.
2. **Row-level security on every table**, written and tested in the same ticket as the table. No table ships without its policy file and a test that proves the reviewer and an anonymous user cannot read it.
3. **No secrets in the browser or in the repository.** The service role key, agent keys and the Microsoft client secret live in server function secrets only. Commit a `.env.example` with names and no values.
4. **Agents write through one endpoint only**, `agent-write`. It validates the record kind against what that agent is allowed to send, refuses unknown fields and builds duplicate keys itself. Agents never get database access.
5. **Only the send engine can cause a message to leave.** It checks the level, the ceiling, the caps, the sending window, the do-not-contact list and the stop switch, and logs every decision. No other code path sends.
6. **KPIs are events written by database triggers**, unique on KPI and source row. Never store a running total. Never let the front end write a KPI event directly.
7. **Sign-in asks Microsoft for name and email only.** Never request mail, calendar or directory permissions.
8. **Migrations are numbered files and are never edited once applied.** A change is a new file.
9. **Work in the test project.** Never run anything against the live project unless Jason has said so in that session.
10. **Use invented sample data** in seeds, fixtures and tests. No real names of clients or candidates anywhere in the repository.

## How to work

- Follow section 38 of the low-level design ticket by ticket, starting at P1-01. Respect the dependencies in 38.5.
- One ticket at a time. For each: read the sections it names, say in two or three lines what you are about to do, build it, write the tests, run them, then report.
- Commit after each ticket with the ticket ID in the message, for example `P1-07 core tables and shared functions`.
- At the end of each week's tickets, stop. Give a short summary: what works, what is stubbed, what you need from Jason. Wait for him before starting the next week.
- For every screen, send a screenshot at desktop width, and at phone width for Home, Inbox and Follow-ups.
- If a pre-build check fails (section 4.6), use the fallback in the same table and tell Jason.
- If you need to depart from the design, say what, why and what it affects, and wait for a yes. Small naming choices are yours. Anything touching data, access, sending or the calm rules is not.
- Keep a file `docs/build-log.md`: one line per ticket with the date, what was done and anything left open. Keep `docs/decisions.md` for any agreed departure from the design.
- Write plain British English in the interface. Short words. No exclamation marks. The words in section 3.14 are the house style.

## What Jason will give you

He is not a developer. Ask for these one at a time, in plain words, and tell him exactly where to find each one:

- The test and live Supabase project URLs and public keys
- Confirmation that secrets have been set (never ask him to paste a secret into the chat; tell him the command or the settings page instead)
- The Microsoft sign-in client ID
- His choice of two typefaces, or a yes to the defaults in section 3.7
- Which message types may send automatically from day one
- The cap for LinkedIn connection notes
- The first names for the top 100 league (he enters these himself in the app, not in the repository)
- Where the front end will be hosted

## What done looks like for phase 1

- Jason signs in with his Microsoft work account and lands on a Home with four real numbers.
- The agents post into the Inbox through `agent-write` and duplicates are merged.
- Marking a job lead as chased moves the weekly number by itself.
- A thank-you email sends on its own under the rules and shows in the send log. The stop switch halts all sending.
- The Monday follow-up block and the Monday review both run from RecOS.
- Acceptance scripts 1, 3, 4, 5, 6 and 7 in section 35 pass in test, then in live.
- Every table has a tested access policy and nothing in the repository or the browser holds a secret.

---

## First message to send

> Read CLAUDE.md, then docs/high-level-design.md, then sections 3, 4 and 38 of docs/low-level-design.md, and look at the images in docs/ui-inspiration. Do not write any code yet. Tell me in plain English: what you understand you are building, the tickets for week 1 in the order you will do them, and what you need from me before you can start P1-01.
