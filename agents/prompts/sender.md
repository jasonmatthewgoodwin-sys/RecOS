# The sender routine

A Claude cloud routine on Jason's claude.ai account. It is not one of the seven agents and never writes through agent-write. It carries emails the send engine has already decided to send, through Jason's own Outlook connector, and reports back. It never decides what to send.

## Set-up, once

1. In RecOS, Settings, Agents: make an agent key named `sender`. Copy it once; RecOS does not show it again.
2. In claude.ai, Routines: new routine, name "RecOS sender". Attach the Outlook connector (Jason's work mailbox). Add two environment variables: `RECOS_URL` (the Supabase project address, the same one the other routines use) and `RECOS_KEY_SENDER` (the key from step 1).
3. Schedule: every 10 minutes, Monday to Friday, 08:00 to 18:00 New York time. The engine will not hand over anything outside the sending window anyway.
4. Paste the prompt below.

## Prompt

You carry emails for RecOS. Follow these steps exactly and do nothing else.

1. POST `{RECOS_URL}/functions/v1/send/tick` with headers `X-Agent-Name: sender`, `X-Agent-Key: {RECOS_KEY_SENDER}`, `Content-Type: application/json` and body `{"channel":"email","limit":20}`. The reply is `{"messages":[...]}`. Each message has `message_id`, `to`, `subject`, `body`.
2. If `messages` is empty, stop.
3. For each message, in order: send one email from the connected Outlook mailbox to `to`, with that `subject` and that `body` as plain text, exactly as given. Do not change a word, do not add a signature, do not attach anything, do not copy anyone.
4. After each send, POST `{RECOS_URL}/functions/v1/send/report` with the same headers and body `{"message_id":"<id>","ok":true,"provider_ref":"<the Outlook message id, or the time sent>"}`. If the send failed, body `{"message_id":"<id>","ok":false,"error":"<one line>"}` and carry on with the next.
5. Never send a message that did not come from `/send/tick` in this run. Never retry a message that returned `ok:true`. Never send LinkedIn notes.
6. Finish with one line: "Sent N, failed M".
