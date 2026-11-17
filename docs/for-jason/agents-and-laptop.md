# For Jason: your agents, your laptop, and LinkedIn

Written 17 November 2026 from what RecOS recorded of every agent run.

## What we found

- **Nothing has ever sent a LinkedIn request for you.** RecOS's jobs agent is written to never open LinkedIn, because it runs without a browser. The seven leads marked "connection sent" on 16 November were ticked by hand in Leads. If your own PMM LinkedIn hiring report task has a step that sends requests, RecOS cannot see it, and it only works while your laptop is awake with Chrome open.
- **The jobs agent has never run on its schedule.** All 164 leads came from one import on Friday 14 November, of reports up to 10 November. That is why every lead looks old. No new lead has arrived since.
- **The campaign runner has never run, and nor has the signals agent.** Add to campaign records the campaign in RecOS, but nothing enrols the person in Spott until the campaign runner runs.
- **Your agents run on your laptop, so they stop when it sleeps.** The research check is meant to run every 15 minutes. On 16 November it ran until 17:03, stopped until 20:18, ran until 22:13, then stopped until 07:02. The task assistant, also every 15 minutes, ran 4 times in 16 hours. That is the pattern of scheduled tasks in the Claude desktop app, which run only while the computer is awake.

## What changes

1. **Every agent except the LinkedIn sender moves to the cloud.** In claude.ai, each one becomes a routine with your Outlook, Granola and Spott connectors attached. Routines run whether your laptop is open or shut. Use the same prompts, keys and schedules you have now.
2. **The LinkedIn sender stays on your laptop.** It needs Chrome signed in to LinkedIn, so it cannot run in the cloud. When the laptop is shut, nothing is lost: requests wait in RecOS and go at the next run. Set it up from `agents/prompts/linkedin_sender.md`.
3. **Your PMM LinkedIn hiring report feeds RecOS directly.** At the end of each report run, it posts each lead to RecOS as the jobs agent. RecOS then queues a connection request to each poster whose role was posted in the last 21 days.
4. **Take any "send a connection request" step out of the report task.** From now on RecOS's send engine decides every request. It applies the 10-a-day and 20-a-week caps, the do-not-contact list and the stop switch, and logs each one under Sent for you. A second sender would double up and leave no record.
5. **Approve the connection note.** In RecOS, Settings, Templates, open LinkedIn connection note, change the words if you like, and approve it. Nothing goes until you do.

## Paste this into Claude on your laptop

Read `CLAUDE.md` and `docs/for-jason/agents-and-laptop.md` in this folder first. Then help me, one step at a time, in plain words, and wait for me after each step. Do not change any code.

1. List every scheduled task I have in the Claude desktop app and every routine I have on claude.ai. For each, tell me its name, its schedule, and whether it runs on this laptop or in the cloud.
2. For each RecOS agent that runs on this laptop (the review, content, jobs, signals, follow-ups, calls, events, campaign runner and task assistant), walk me through making the same thing as a claude.ai routine: the same prompt, the same two environment variables (`RECOS_URL` and that agent's key), the connectors it needs (Outlook, Granola, Spott), and the same schedule. Then help me turn the laptop one off. The campaign runner and the signals agent have never run, so check they exist at all.
3. Set up the LinkedIn sender as a scheduled task on this laptop from `agents/prompts/linkedin_sender.md`. It runs weekdays, every hour from 14:00 to 22:00 London time, and needs Claude in Chrome with LinkedIn signed in.
4. Open my PMM LinkedIn hiring report task. Remove any step that sends LinkedIn connection requests or messages. Add a last step that posts the leads to RecOS:
   - POST `{RECOS_URL}/run-agent/run-start` with headers `X-Agent-Name: a3_jobs` and `X-Agent-Key: {RECOS_KEY_A3}`, and body `{"trigger":"schedule","mode":"collect"}`. Keep the `run_id`.
   - Then POST `{RECOS_URL}/agent-write` with the same headers and `run_id`, and one record per lead: `{"kind":"job_lead","data":{"company":"...","role":"...","source":"linkedin_post","source_url":"<the post link>","poster_name":"...","poster_title":"...","poster_profile_url":"<their profile link>","location":"...","why":"<one line on the role in the post's own words>"}}`.
   - Finish with POST `{RECOS_URL}/run-agent/run-finish`, body `{"run_id":"...","status":"ok","summary":"<n> leads from the hiring report"}`.
   - Ask me whether to run the report every weekday rather than Tuesdays and Fridays. Requests are capped at 10 a day whatever the report finds.
5. Remind me to approve the LinkedIn connection note in RecOS, Settings, Templates.
