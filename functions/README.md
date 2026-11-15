# Server functions

Supabase Edge Functions, in TypeScript for Deno. Each folder is one function. They are thin: the rules live in the database (migrations 0022 to 0025) so they are tested there, and the functions check the caller and pass the call on.

| Folder | Paths | Caller | Built |
| --- | --- | --- | --- |
| `agent-write` | `POST /functions/v1/agent-write` | Agents, with `X-Agent-Name` and `X-Agent-Key` headers and an optional `Idempotency-Key` | Yes (P1-15, P1-16) |
| `run-agent` | `POST .../run-agent/run-start`, `POST .../run-agent/run-finish`, `GET .../run-agent/context?want=`, `POST .../run-agent/request-run` | Agents; request-run is the owner's session | Yes (P1-14) |
| `send` | `POST /send` (owner: approve, open_draft, mark_sent, cancel), `POST /send/tick`, `POST /send/report`, `POST /send/linkedin-warning` | Browser for `/send`; the sender routine, with its agent key, for the rest | Yes (0034, P1-26 to P1-29). Not deployed yet |
| `person` | `/person/find`, `/person/export`, `/person/delete` | Browser | The database functions exist (P1-46); the wrapper with rate limits is not yet written |
| `export` | `POST /export` | Browser | Same as person |

## Deploying

From the repository root, signed in to the Supabase CLI as Jason, with the test project linked:

```bash
supabase functions deploy agent-write --no-verify-jwt
```

The send engine function deploys the same way:

```bash
supabase functions deploy send --no-verify-jwt
```

## The sender routine

The engine only decides and queues. A Claude cloud routine, created by Jason with his Outlook connector attached and the key of the Outlook sender row in Settings, Agents (Create key on its card), carries the messages:

1. Every ten minutes between 08:00 and 18:00 New York time, `POST /functions/v1/send/tick` with `X-Agent-Name: sender` and `X-Agent-Key`. The reply lists up to 20 messages whose window has opened, each with the address, subject and body already filled.
2. For each one, send it from Jason's mailbox through the Outlook connector.
3. `POST /functions/v1/send/report` with `{ message_id, ok, provider_ref }`, or `{ message_id, ok: false, error }` for a failure. The engine logs it, completes the follow-up and writes the KPI event.
4. LinkedIn connection notes are never sent by the routine; they are copied by hand from the deck and marked sent there.

The routine never reads the database and never decides what to send. If `/send/tick` returns nothing, it stops.

```bash
supabase functions deploy run-agent --no-verify-jwt
```

`--no-verify-jwt` because agents carry a key, not a session. The functions read `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, which the platform sets for every function. No other secret is needed.

## Agent keys

Made in Settings, Agents, Create new key. The plain key is shown once and stored only as a hash. Put it in the agent's own task settings as `X-Agent-Key`. Rotate every 90 days (34.3).

## What an agent does on a run

1. `POST run-agent/run-start` with `{ "agent": "a3_jobs", "trigger": "schedule", "mode": "collect" }`. Stop at once if `enabled` is false. Use `prompt` and `settings.lookback_from`.
2. `GET run-agent/context?want=pool,job_keys,dnc` for what it may read.
3. `POST agent-write` with `{ "run_id": "...", "records": [...] }`, 1 to 200 records a time, each `{ "kind": "...", "data": { ... } }`. Unknown fields are refused. Every record succeeds or fails on its own; the response names why.
4. `POST run-agent/run-finish` with `{ "run_id": "...", "status": "ok", "summary": "..." }`.

The kinds, fields, duplicate keys and merge rules are in section 16 of the low-level design and in `db/migrations/0025_agent_contract.sql`.
