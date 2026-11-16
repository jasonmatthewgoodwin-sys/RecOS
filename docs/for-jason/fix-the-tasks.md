# For Jason: a message to paste into Claude on your own machine

Paste everything under the line into a Claude Code session opened in your RecOS folder (or into claude.ai, where your routines live). It walks you through the three things only you can do, one at a time. Nothing here needs you to write code.

---

Read `CLAUDE.md`, `HANDOVER.md` and `agents/prompts/a9_tasks.md` in this folder first. Then help me, one step at a time, in plain words, and wait for me after each step. Do not change any code and do not run anything against the database.

The problem: in RecOS the Tasks tab does not reflect my real day. Three routines are missing or set up wrongly on my claude.ai account, so three things never reach RecOS: the write-ups of my Granola calls, the follow-ups and chases that come from them, and the answers to the chat on each task.

Walk me through this, in order:

1. The call write-ups. The Call-to-CRM routine (the one that calls RecOS as `a6_calls`) runs only in `research` mode at the moment, every quarter of an hour. RecOS wants it to run in `calls` mode as well, so every Granola call is written up within half an hour of ending and lands under the Calls tab of its search and as a task. Show me how to add a second routine on claude.ai, named RecOS calls, with the same connectors (Outlook, Granola, Spott) and the same two environment variables as the research one (`RECOS_URL` and the a6 key), the same prompt text, and the mode set to `calls` where the prompt is told its mode. Schedule: weekdays, every 30 minutes, 09:00 to 20:00 London time. The prompt already finishes straight away when there is nothing new, so the extra runs cost almost nothing.

2. The morning searches run. The same routine in `searches` mode has run once. It should run every weekday at 07:45 London time, so each search's status and next step are current before I start. Show me how to set that schedule on the existing RecOS searches routine, or add it if it is missing.

3. The task assistant. This is new. In RecOS, under Settings, Agents, open the row called Task assistant and press Create key. Copy the key once. Then follow the Set-up section in `agents/prompts/a9_tasks.md`: four routines named RecOS tasks :00, :15, :30 and :45, with my Outlook, Granola and Spott connectors, the two environment variables (`RECOS_URL`, the same address the other routines use, and `RECOS_KEY_A9`, the key I just copied), weekdays 08:00 to 20:00 London time, and the prompt from that file pasted in whole. Tell me where each field is on the claude.ai Routines page.

When all three are done, tell me what I should see in RecOS within the hour: calls under the Calls tab of each search, a write-up task after each call, and an answer in a task's chat within a quarter of an hour of asking.
