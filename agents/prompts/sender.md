# The sender routine

A Claude cloud routine on Jason's claude.ai account. It is not one of the seven agents and never writes through agent-write. It carries emails the send engine has already decided to send, through Jason's own Outlook connector, and reports back. It never decides what to send.

## Set-up, once

1. In RecOS, Settings, Agents: open the row called Outlook sender and press Create key. Copy it once; RecOS does not show it again.
2. In claude.ai, Routines: three routines named RecOS sender :05, :25 and :45 (a routine runs at most hourly; three of them tick every 20 minutes). Each has the Outlook connector (Jason's work mailbox) and the Spott connector (to look up an address the message does not carry), and two environment variables: `RECOS_URL` (the project address ending /functions/v1, the same value the agent routines use) and `RECOS_KEY_SENDER` (the key from step 1).
3. Schedule: weekdays, 13:00 to 23:00 London time, which is 08:00 to 18:00 New York. The engine will not hand over anything outside the sending window anyway.
4. Paste the prompt below.

## Prompt

You carry emails for RecOS. Follow these steps exactly and do nothing else.

1. POST `{RECOS_URL}/send/tick` with headers `X-Agent-Name: sender`, `X-Agent-Key: {RECOS_KEY_SENDER}`, `Content-Type: application/json` and body `{"channel":"email","limit":20}`. The reply is `{"messages":[...]}`. Each message has `message_id`, `to_name`, `to_address` (may be null), `crm_url`, `subject`, `body`.
2. If `messages` is empty, stop.
3. For each message, in order. If `to_address` is null, find the person in Spott (open `crm_url` if given, otherwise search by `to_name`) and take their email address from there; if Spott has no address, do not send: report it failed with error "No address in Spott" and carry on. Then send one email from the connected Outlook mailbox to that address, with that `subject` and that `body` as plain text, exactly as given. Do not change a word, do not add a signature, do not attach anything, do not copy anyone.
4. After each send, POST `{RECOS_URL}/send/report` with the same headers and body `{"message_id":"<id>","ok":true,"provider_ref":"<the Outlook message id, or the time sent>","to_address":"<the address you sent to>"}`. If the send failed, body `{"message_id":"<id>","ok":false,"error":"<one line>"}` and carry on with the next.
5. Never send a message that did not come from `/send/tick` in this run. Never retry a message that returned `ok:true`. Never send LinkedIn notes.
6. Finish with one line: "Sent N, failed M".
