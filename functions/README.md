# Server functions

Supabase Edge Functions, in TypeScript for Deno. Each folder is one function. They are thin: the rules live in the database (migrations 0022 to 0025) so they are tested there, and the functions check the caller and pass the call on.

| Folder | Paths | Caller | Built |
| --- | --- | --- | --- |
| `agent-write` | `POST /functions/v1/agent-write` | Agents, with `X-Agent-Name` and `X-Agent-Key` headers and an optional `Idempotency-Key` | Yes (P1-15, P1-16) |
| `run-agent` | `POST .../run-agent/run-start`, `POST .../run-agent/run-finish`, `GET .../run-agent/context?want=`, `POST .../run-agent/request-run` | Agents; request-run is the owner's session | Yes (P1-14) |
| `send` | `POST /send` (owner: approve, open_draft, mark_sent, cancel), `POST /send/tick`, `POST /send/report`, `POST /send/linkedin-warning` | Browser for `/send`; the sender routine, with its agent key, for the rest | Yes (0034, P1-26 to P1-29). Not deployed yet |
| `outlook` | `GET /outlook/start?state=`, `GET /outlook/callback` | The owner's browser (a one-time state from `connection_oauth_begin`), then Microsoft | Yes (0041, 0042). Not deployed. Secrets `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REDIRECT_URI`, `APP_URL`. See `functions/outlook/README.md` |
| `connections` | `POST /connections/key` `{ provider, key }`, `POST /connections/disconnect` `{ provider }` | The owner's session | Yes (0041, 0042). Not deployed. No extra secrets |
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

1. Three times an hour between 08:00 and 18:00 New York time (three routines at :05, :25 and :45, since a routine runs at most hourly), `POST /functions/v1/send/tick` with `X-Agent-Name: sender` and `X-Agent-Key`. The reply lists up to 20 messages whose window has opened, each with the address, subject and body already filled.
2. For each one, send it from Jason's mailbox through the Outlook connector.
3. `POST /functions/v1/send/report` with `{ message_id, ok, provider_ref }`, or `{ message_id, ok: false, error }` for a failure. The engine logs it, completes the follow-up and writes the KPI event.
4. LinkedIn connection notes are never sent by the routine; they are copied by hand from the deck and marked sent there.

The routine never reads the database and never decides what to send. If `/send/tick` returns nothing, it stops.

```bash
supabase functions deploy run-agent --no-verify-jwt
```

`--no-verify-jwt` because agents carry a key, not a session. The functions read `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, which the platform sets for every function. No other secret is needed.

## Research routine

The new search flow (`docs/new-search-split.md`, migration 0048). When Jason asks for brief questions, a client lowdown or a market map on a search, the request waits in `search_jobs`. A Claude cloud routine picks it up, does the research and writes the result back; the screen reads Working, then the result appears. Nothing was added to the functions for this: `run-agent/context` passes `want=search_jobs` straight to the database, which allows it for `a6_calls` only, and `agent-write` passes the new kind `search_result` the same way. No redeploy is needed.

It runs as the calls agent `a6_calls` in mode `research`, so it uses the key that agent already has. Before the first run, apply `db/migrations/0048_search_jobs.sql`, `db/policies/search_jobs.sql` and `db/seed/agent_prompts_a6_research.sql` in that order.

1. In claude.ai, Routines, New routine. Name: RecOS A6: Research.
2. Connectors: Outlook, Granola and Spott (all three are only read). Web search on.
3. Environment variables: `RECOS_URL` (already ends in `/functions/v1`) and `RECOS_KEY_A6_CRM`, the same two the other A6 routines use.
4. Schedule: every 15 minutes, 07:00 to 19:00 UK, weekdays. A routine runs at most hourly, so make four with the same prompt, at :02, :17, :32 and :47.
5. Prompt: the text below.

A run with nothing waiting makes two calls and stops. A run with work takes up to three jobs; a job it claims and never answers is handed out again after an hour and closed as failed after three tries.

Prompt to paste:

> You are the RecOS agent `a6_calls`, running in mode `research`. Do exactly this.
>
> 1. POST `$RECOS_URL/run-agent/run-start` with headers `X-Agent-Name: a6_calls`, `X-Agent-Key: $RECOS_KEY_A6_CRM`, `Content-Type: application/json` and body `{"trigger":"schedule","mode":"research"}`. The reply has `run_id`, `enabled` and `prompt` (with `body` and `blocks`).
> 2. If `enabled` is false, or the reply is an error, stop. Do nothing else.
> 3. Follow the section "## Mode: research" of `prompt.body`, exactly, and no other section. It starts with GET `$RECOS_URL/run-agent/context?want=search_jobs` with the same two key headers. If that returns no jobs, go straight to step 5 with status `ok` and summary "No research waiting".
> 4. Where it says write, POST `$RECOS_URL/agent-write` with the same headers and body `{"run_id":"<run_id>","records":[{"kind":"search_result","data":{...}}]}`, one record per POST. Read each result's `outcome`; on `rejected`, do what the prompt says.
> 5. Finish with POST `$RECOS_URL/run-agent/run-finish`, same headers, body `{"run_id":"<run_id>","status":"ok|partial|failed","errors":[{"source":"...","message":"..."}],"summary":"<line 1>\n<line 2>"}`.
> 6. Outlook, Granola and Spott are for reading only: never send, draft, create or change anything in them. Web search and web fetch are allowed for the lowdown and the map. Never store, print or send an email address, phone number or key anywhere but these calls.

## Agent keys

Made in Settings, Agents, Create new key. The plain key is shown once and stored only as a hash. Put it in the agent's own task settings as `X-Agent-Key`. Rotate every 90 days (34.3).

## What an agent does on a run

1. `POST run-agent/run-start` with `{ "agent": "a3_jobs", "trigger": "schedule", "mode": "collect" }`. Stop at once if `enabled` is false. Use `prompt` and `settings.lookback_from`.
2. `GET run-agent/context?want=pool,job_keys,dnc` for what it may read.
3. `POST agent-write` with `{ "run_id": "...", "records": [...] }`, 1 to 200 records a time, each `{ "kind": "...", "data": { ... } }`. Unknown fields are refused. Every record succeeds or fails on its own; the response names why.
4. `POST run-agent/run-finish` with `{ "run_id": "...", "status": "ok", "summary": "..." }`.

The kinds, fields, duplicate keys and merge rules are in section 16 of the low-level design and in `db/migrations/0025_agent_contract.sql`.
