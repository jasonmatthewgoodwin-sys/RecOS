# RecOS: build instructions

How to get from a folder of documents to a running build. Written for Jason and for anyone helping him. No coding knowledge is assumed. Where a step depends on a supplier's screen that may have changed, it says so.

## 1. What is in the PLATFORM folder

| File | What it is | Who reads it |
| --- | --- | --- |
| `RecOS product spec.docx` | What RecOS does and why | People |
| `RecOS high-level design.docx` | The parts and how they fit, about 15 pages | People. Share this one first |
| `RecOS low-level design.docx` | Every table, endpoint, agent and screen | People who are building or checking |
| `docs/product-spec.md` | The same three documents as plain text | Claude Code |
| `docs/high-level-design.md` |  | Claude Code |
| `docs/low-level-design.md` |  | Claude Code |
| `CLAUDE_CODE_PROMPT.md` | The brief Claude Code works from | Claude Code |
| `BUILD_INSTRUCTIONS.md` | This file | You |
| `UI inspiration/` | The five reference images | You and Claude Code |

To share the project with someone, send the high-level design and this file. That is enough for them to understand it.

## 2. What you need before starting

Allow about two hours for this section. None of it needs IT.

### Accounts

| Account | For | Notes |
| --- | --- | --- |
| Claude Code | Does the build | Runs on your Claude plan. Install it from Anthropic's Claude Code page |
| GitHub | Keeps the code safe and versioned | Free. Make the repository private |
| Supabase | Database, sign-in and server functions | Start on the free tier. Create it under an email you will keep if you change firm |
| A front-end host | Puts the app on a web address | Vercel, Netlify and Cloudflare Pages all work. Decide by week 4, not now |
| A web address (optional) | So the app sits on a name you own | A few pounds a year. Can be added later |

### On your computer

- Git
- Node.js, the current long-term version
- Claude Code
- The Supabase command line tool

If any of these are new to you, open Claude Code first and ask it to check what is installed and walk you through the rest. It can do that.

### A note on where this lives

Put the repository and the Supabase account under your own control, not the firm's, unless the firm asks otherwise. The app holds very little personal data by design, but the firm is still responsible for client and candidate data. Tell whoever looks after data protection that the tool exists before real data goes in. This is good practice, not legal advice.

## 3. Set up the repository

1. In GitHub, create a private repository called `recos`.
2. Clone it to your computer. Not inside OneDrive: syncing a code folder causes problems. Somewhere like `C:\dev\recos` is fine.
3. Inside it, create a `docs` folder.
4. Copy the three `.md` files from `PLATFORM\docs` into `recos\docs`.
5. Copy the `UI inspiration` folder into `recos\docs` and rename it `ui-inspiration`.
6. Copy `CLAUDE_CODE_PROMPT.md` into the top of `recos` and rename it `CLAUDE.md`.

You should now have:

```text
recos/
  CLAUDE.md
  docs/
    high-level-design.md
    low-level-design.md
    product-spec.md
    ui-inspiration/   (5 images)
```

## 4. Create the two Supabase projects

1. In Supabase, create a project called `recos-test` and one called `recos-live`.
2. Choose a UK or EU region for both. London if it is offered. Write down which you chose.
3. Save each database password in your password manager. You will not need to type them often, but you cannot get them back.
4. For each project, note the project URL and the public (anon) key. These two are safe to share with Claude Code.
5. Do not copy the service role key anywhere yet. Claude Code will tell you the command to store it as a secret when it is needed. It never goes in a file or a chat.

Everything is built and tested in `recos-test`. `recos-live` stays empty until the end of week 1 at the earliest.

## 5. Run the pre-build checks

Five short tests remove the main unknowns. Do P1 and P4 yourself. Ask Claude Code to help with the rest when it reaches them.

| # | Check | How | If it fails |
| --- | --- | --- | --- |
| P1 | Microsoft sign-in works with name and email only | See section 6 below | Use the emailed one-time link to sign in. Nothing else changes |
| P3 | A Claude scheduled task can post to RecOS | Claude Code builds a test endpoint. One test task posts one item to it | Agents keep writing to the Google Sheet and RecOS collects from it every 5 minutes |
| P4 | The database is in a region the firm is happy with | Done when you chose the region in section 4 | Pick the nearest and record it |
| P5 | An agent can read and write the CRM | Already true for Spott. To confirm for JobAdder once the firm decides | Searches are entered by hand until it can |
| P6 | Outlook can send through the existing Claude connection | Send one test message to yourself | Automatic sending is limited to creating drafts |

Check P2 in the low-level design was about Lovable. It no longer applies.

## 6. Set up Microsoft sign-in

This lets you open RecOS with your work login. It asks Microsoft for your name and email and nothing else.

1. Go to the Microsoft Entra admin centre and sign in with your work account.
2. Find App registrations and choose New registration.
3. Name it `RecOS`. For account types, choose your organisation only.
4. For the redirect address, use the callback address shown in Supabase under Authentication, Providers, Azure. There is one for each project, so add both.
5. Create a client secret and copy it straight into the Supabase provider settings for each project, along with the client ID and tenant ID.
6. Leave the permissions at the default. Do not add mail or calendar.
7. Try signing in.

Two things can stop this, and neither is a problem. Some firms switch off app registration for staff, and some require an admin to approve new apps. If you hit either, do not chase it. RecOS falls back to a one-time link sent to your email, which is just as safe and needs nobody's permission. You can come back to Microsoft sign-in later if you ever want to.

The names of these screens change from time to time. If something does not match, ask Claude Code and it will look up the current steps.

## 7. Start the build

1. Open a terminal in the `recos` folder and start Claude Code.
2. Paste the first message from the bottom of `CLAUDE.md`. It asks Claude Code to read everything and tell you its plan before writing any code.
3. Read the plan. If it mentions a side menu, charts or colour, it has read the wrong section. Tell it to re-read section 3 of the low-level design.
4. Give it the test project URL and public key when it asks.
5. Tell it to start at ticket P1-01.

From then on the rhythm is simple. It builds one ticket, tests it, shows you and commits. You look at the result and say yes or what to change. At the end of each week's tickets it stops and waits for you.

### What to check on every screen

You do not need to read code. Look at the screenshot and ask:

- Is it calm? Could anything be removed?
- More than two big numbers (four on Home)? Send it back.
- Any colour other than grey and black? Send it back.
- Any chart? Send it back.
- More than one main button? Send it back.
- Does anything move or pop up without being asked? Send it back.

If a screen feels busy, it is wrong, even if you cannot say why. Say so and ask for it to be simpler.

### Keeping credit use down

- One ticket per request. Do not ask for a whole week in one go.
- Start a fresh Claude Code session each working day. It re-reads `CLAUDE.md` and the build log and picks up where it left off.
- Let it read only the sections of the low-level design the ticket names. The brief already tells it to.
- Fix design problems as they appear. Reworking six screens at once costs far more than correcting the first.

## 8. Phase gates

Do not move on until the gate is met.

| Phase | Weeks | Delivers | Gate |
| --- | --- | --- | --- |
| 1. Core and leads | 1 to 4 | Sign-in, Home, Inbox, Follow-ups, Leads, People, Numbers, the send engine, agents pointed at RecOS | Two Monday reviews run from RecOS with no manual KPI entry |
| 2. Searches and candidates | 5 to 8 | CRM adapter, the search workspace, call write-ups for every search, Candidates | Every live search has a workspace. Call notes reach the CRM within 24 hours for two weeks |
| 3. Brand and polish | 9 to 12 | Content calendar, Events, UK to US, forecast, exports, handover | One event planned in RecOS. Old tasks retired |

Inside phase 1:

| Week | You will see |
| --- | --- |
| 1 | Home shows four real numbers after you sign in |
| 2 | Agents feed the Inbox. Posts chased counts itself |
| 3 | Thank-you emails send on their own. The Monday block runs from RecOS |
| 4 | A full Monday review from RecOS |

The weeks are a guide to order, not a promise on dates. With Claude Code doing the building the work may go faster. The time that cannot be squeezed is the two weeks of running old and new side by side.

## 9. Going live

At the end of week 1, once Home works in test:

1. Ask Claude Code to apply the migrations to `recos-live`. This is the one time you tell it to touch live.
2. Add your work email to the allow-list in live.
3. Set the server secrets for live. Claude Code gives you the commands.
4. Publish the front end to your host and sign in.

After that, every change goes to test first, then live, outside your working hours.

## 10. Pointing the agents at RecOS

The scheduled tasks you already have keep running throughout. Each one is switched over on its own, in this order: jobs pipeline, follow-up queue, relationship signals, weekly review, content engine, call-to-CRM, event ideas.

For each agent:

1. Claude Code creates a key for that agent. You paste it into the task's settings, not into a chat.
2. The task's prompt is changed to post to RecOS as well as the sheet. This is done from Claude, not from Claude Code.
3. Both run for two weeks. RecOS must find at least what the sheet found.
4. The sheet write is switched off. The old task is paused, not deleted, and kept for four more weeks.

Do not move a search that is at offer stage until the offer closes.

## 11. Decisions needed from you

| # | Decision | Needed by |
| --- | --- | --- |
| 1 | Two typefaces, or accept the defaults | Week 1 |
| 2 | Which message types send automatically from day one | Week 3 |
| 3 | The cap for LinkedIn connection notes. The design suggests 10 a run and 20 a week | Week 3 |
| 4 | The first names for the top 100 league | Week 4 |
| 5 | The sender and subject line of the A-star candidate email | Phase 2 |
| 6 | Whether Olly gets a read-only login or the Monday summary only | Phase 2 |
| 7 | Where the front end is hosted, and on what address | Week 4 |
| 8 | JobAdder or Spott. The firm's call | Phase 2 |
| 9 | Whether the league and referrals may live in RecOS or should be a CRM list | Before live data goes in |

## 12. If something goes wrong

| Problem | What to do |
| --- | --- |
| Something was sent that should not have been | Settings, Send rules, turn the stop switch on. Everything stops at once. Then look at the send log |
| An agent is producing rubbish | Settings, Agents, pause that agent. Its items can be binned in one go from the Inbox list |
| You cannot sign in | Use the one-time email link |
| The app is down | Agents fall back to the Google Sheet on their own. Nothing is lost. Work from the sheet until it is back |
| Claude Code has gone down the wrong path | Tell it to stop. Ask it to show what changed since the last commit and to undo it. Every ticket is its own commit, so you can always go back one |
| A key or secret has ended up in a chat or a file | Treat it as leaked. Ask Claude Code how to rotate it and do it the same day |

## 13. A caution on LinkedIn

LinkedIn does not allow automated activity on its site, and connection notes sent by an agent carry a real risk of the account being restricted. The design keeps this to capped connection notes only, pauses on any warning and leaves everything else to be done by hand. That lowers the risk. It does not remove it. If your LinkedIn account matters more to you than the time saved, set that message type to draft only and send them yourself.
