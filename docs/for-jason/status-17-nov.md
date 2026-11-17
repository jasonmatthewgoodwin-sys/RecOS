# RecOS: state of play, 17 November 2026

## TLDR

- **The platform is built and live.** Tasks, Searches, Spec, leads with LinkedIn outreach, the send engine and the log of everything sent for you all work.
- **The agents are what stops it running by itself.** Most run on your laptop, so they stop when it sleeps. Three have never run at all, and the jobs agent has only ever run by hand.
- **Fix the set-up and RecOS keeps itself current.** That means four things: move the agents to the cloud, switch on the three missing ones, approve the LinkedIn note, and set up the LinkedIn sender on your laptop.

## The agents, one by one

| Agent | What it does | State today | What's wrong | Fix |
| --- | --- | --- | --- | --- |
| Weekly review | Monday review and numbers | Ran once, Mon 16 Nov, fine | Runs on the laptop | Move to the cloud |
| Content engine | Post drafts from calls and the market | Ran Mon 16 Nov | The community mode has no sources to read | Move to the cloud; add sources |
| Jobs pipeline | Finds hiring leads | Never run on its schedule. All 164 leads came from one import on 14 Nov | No new leads since 14 Nov | Move to the cloud; your hiring report posts leads straight in |
| Signals | Job moves and news on your contacts | Never run | Not set up | Set it up in the cloud |
| Follow-ups | Mail and calendar sweep for what you owe | Running, last today 08:47 | Runs on the laptop | Move to the cloud |
| Calls | Writes up each Granola call, keeps searches current, does research | Research and the morning searches run are working. The write-up ran once, on 16 Nov | It never recorded the calls themselves, so the Calls tabs were empty. Fixed today | Move to the cloud; run the write-up every 30 minutes |
| Events | Event ideas, monthly | Only a connection test | Not due until 1 Dec | Move to the cloud |
| Campaign runner | Puts people into Spott sequences | Never run | Add to campaign does nothing yet | Set it up in the cloud |
| Task assistant | Answers the chat on each task | Running, no questions asked yet | Runs only while the laptop is awake | Move to the cloud |
| Outlook sender | Sends approved emails | Sent one thank-you on 15 Nov | Can't tell where it runs | Make sure it's a cloud routine |
| LinkedIn sender | Sends connection requests, checks who accepted | New, not set up. 32 requests are ready | Needs your note approved and the laptop | Set it up on the laptop |

## What's built

- **Tasks:** one board drawn from every source. Each tile shows where the task came from, what to do and when it surfaced, and anything older than three days is overdue. Each task card has a chat where you can hand the task to an agent.
- **Email:** drafts reply inside the right Outlook thread. They send through the send engine or open in Outlook.
- **LinkedIn:** leads show the post date, the poster and where outreach stands. Requests go through the send engine, accepted connections get a first message drafted, and Add to campaign puts the poster into Spott.
- **Searches:** Pre-brief, Brief, Pipeline and Calls tabs. Status now follows what the agents find.
- **Spec:** a library of everyone you've spoken to, with matches to live jobs.
- **The send engine:** under the cog, then Send rules. It has the stop switch, the rules for each message type, what's waiting to send and why, and the log.
- **Sent for you:** on Tasks, Leads, Follow-ups and Campaigns. It shows who was contacted, how and when, and whether it went by itself.

## What's missing, and the fix

1. **The agents stop when your laptop sleeps.** Move every agent except the LinkedIn sender to cloud routines on claude.ai, with your Outlook, Granola and Spott connectors.
2. **Three agents have never run.** Set up the signals agent, the campaign runner and the jobs agent's schedule. Run the calls write-up every 30 minutes.
3. **No LinkedIn request has ever gone.** Approve the connection note under the cog, then Templates, and set up the LinkedIn sender on your laptop.
4. **Leads stopped on 14 Nov.** Have your PMM LinkedIn hiring report post its leads into RecOS. Take any connection-request step out of it, so requests only go through the send engine.
5. **All 164 old leads read as overdue from tomorrow.** They all came from one import. Bin the ones that are stale, or ask us for a one-off sweep that bins leads posted more than 30 days ago.
6. **Nobody is warned when an agent goes quiet.** That's how three agents never ran without anyone noticing. We'll build a check that raises one note when an agent misses its schedule.

## Paste this into Claude on your laptop

Read `CLAUDE.md`, `docs/for-jason/status-17-nov.md`, `docs/for-jason/agents-and-laptop.md` and `agents/prompts/linkedin_sender.md` in this folder first. Then help me, one step at a time, in plain words, and wait for me after each step. Do not change any code and do not run anything against the database.

1. List every scheduled task I have in the Claude desktop app and every routine on claude.ai. For each one, give its name, its schedule, and whether it runs on this laptop or in the cloud.
2. For each RecOS agent that runs on this laptop, walk me through making the same thing as a claude.ai routine. Agents: weekly review, content, jobs, follow-ups, calls, events, task assistant and the Outlook sender. Keep the same prompt, `RECOS_URL`, the agent's own key, the connectors it needs (Outlook, Granola, Spott) and the same schedule. Then help me switch off the laptop copy.
3. Set up the three that have never run, as cloud routines. That's the signals agent (Fridays 12:47), the campaign runner (weekdays 09:10 and 15:10) and the jobs agent (collect on Tuesdays and Fridays at 13:00, match on Wednesdays at 07:41). Their prompts are in RecOS under the cog, then Agents. Each key comes from the same page, using Create key.
4. Make sure the calls agent's write-up runs every 30 minutes on weekdays, 09:00 to 20:00 London time.
5. Remind me to approve the LinkedIn connection note in RecOS, under the cog, then Templates. Then set up the LinkedIn sender on this laptop from `agents/prompts/linkedin_sender.md`. It runs weekdays, every hour from 14:00 to 22:00 London time, with Claude in Chrome signed in to LinkedIn.
6. Open my PMM LinkedIn hiring report task. Remove any step that sends LinkedIn requests or messages. Add the last step from `docs/for-jason/agents-and-laptop.md` so it posts the leads into RecOS. Ask me whether it should run every weekday.
7. When all of that is done, tell me what I should see in RecOS within a day:
   - new leads under Business development;
   - calls under each search's Calls tab;
   - requests leaving under Sent for you;
   - every agent showing a recent run under the cog, then Agents.
