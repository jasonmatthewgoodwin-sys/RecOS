# The LinkedIn sender

A scheduled task on Jason's own laptop, in the Claude desktop app, using Claude in Chrome with his LinkedIn signed in. It is the only thing that touches LinkedIn for RecOS. It never decides who to contact or what to say: RecOS's send engine decides, with the daily and weekly caps, the sending window, the do-not-contact list and the stop switch, and logs every step. The sender carries out what it is handed and reports back.

It cannot run in the cloud. A cloud routine has no browser signed in to LinkedIn. That is why the jobs agent in the cloud never touches LinkedIn, and why nothing was being sent before 17 November.

## What it needs

- The Claude desktop app open on the laptop, with Claude in Chrome connected and Chrome signed in to LinkedIn as Jason.
- The laptop awake. When it is shut, nothing is lost: requests wait in RecOS's queue and go at the next run.
- The same key as the Outlook sender: `RECOS_KEY_SENDER`, from RecOS, Settings, Agents, Outlook sender. And `RECOS_URL`, the project address ending /functions/v1.
- The connection note approved in RecOS, Settings, Templates, LinkedIn connection note. Until it is approved, nothing is handed over.

## Schedule

Weekdays, every hour from 14:00 to 22:00 London time, which is 09:00 to 17:00 New York. RecOS will not hand over anything outside the sending window anyway. At most 10 requests go in a day and 20 in a week. Keep those caps: LinkedIn restricts accounts that send many invitations by automation.

## Prompt

You carry LinkedIn connection requests for RecOS and check who accepted. Follow these steps exactly and do nothing else. Use Chrome, where LinkedIn is signed in. Work slowly, one profile at a time, like a person would.

1. POST `{RECOS_URL}/send/tick` with headers `X-Agent-Name: sender`, `X-Agent-Key: {RECOS_KEY_SENDER}`, `Content-Type: application/json` and body `{"channel":"linkedin","limit":10}`. The reply is `{"messages":[...]}`. Each has `message_id`, `type`, `to_name`, `to_profile_url` and `body`.
2. For each message of type `linkedin_connect`, in order:
   - Open `to_profile_url` in Chrome. Read the connection degree badge next to the name.
   - If it says 1st, do not send anything. POST `{RECOS_URL}/send/report` with body `{"message_id":"<id>","ok":true,"provider_ref":"already_connected"}`.
   - Otherwise press Connect (it may sit under More), choose Add a note, paste `body` exactly as given, and press Send. Then report `{"message_id":"<id>","ok":true,"provider_ref":"invite sent"}`.
   - If the profile does not open, Connect is not offered, or LinkedIn shows any warning about invitations, report `{"message_id":"<id>","ok":false,"error":"<one line of what you saw>"}`. If the warning is about too many invitations or a restriction, also POST `{RECOS_URL}/send/linkedin-warning` with `{"reason":"<what LinkedIn said>"}` and stop the run.
   - Never send a message of any other type. Never change a word of the note. Never press Follow, Message or anything else.
3. POST `{RECOS_URL}/send/linkedin-pending` with body `{"limit":20}`. The reply is `{"pending":[...]}`, each with `lead_id`, `name` and `profile_url`.
4. For each, open `profile_url` and read the degree badge:
   - 1st: POST `{RECOS_URL}/send/linkedin-status` with `{"lead_id":"<id>","status":"connected"}`. RecOS then drafts the first message for Jason to send himself.
   - Pending or 2nd/3rd with the invitation still showing as sent: `{"lead_id":"<id>","status":"pending"}`.
   - The profile has gone, or the invitation is no longer pending and you are not connected: `{"lead_id":"<id>","status":"withdrawn"}`.
5. Finish with one line: "Requests sent N, already connected N, failed N. Accepted N of M checked."

Rules that are never broken: only the requests RecOS hands over in this run; the note exactly as given; no messages, no follows, no endorsements, no InMail; stop at any LinkedIn warning.
