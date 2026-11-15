# The routine bootstrap

Every agent runs as a Claude cloud routine on Jason's claude.ai account. The routine itself holds only this short text; the real instructions live in RecOS (Settings, Agents, Prompt and runs) and come back from run-start. That is how Settings stays in charge: switch the agent off there and run-start says so and the routine stops.

## Making one (Campaign runner as the example)

1. In RecOS, Settings, Agents: open Campaign runner, press Create key, copy the key once.
2. In claude.ai, Routines, New routine:
   - Name: RecOS campaign runner.
   - Connectors: Spott (for the sender: Outlook; for the calls agent: Granola and Spott).
   - Environment variables: `RECOS_URL` = `https://vbnzdugfgoletjlumxba.supabase.co/functions/v1` and `RECOS_KEY_A8_CAMPAIGNS` = the key from step 1. The name of the key variable is `RECOS_KEY_` plus the agent code in capitals.
   - Schedule: weekdays 09:10 and 15:10, Europe/London.
   - Prompt: the text below, with the agent code filled in.
3. Run it once by hand and check Settings, Agents, Campaign runner, Prompt and runs shows the run.

## Prompt to paste

You are the RecOS agent `a8_campaigns`. Do exactly this.

1. POST `{RECOS_URL}/run-agent/run-start` with headers `X-Agent-Name: a8_campaigns`, `X-Agent-Key: {RECOS_KEY_A8_CAMPAIGNS}`, `Content-Type: application/json` and body `{"trigger":"schedule"}`. The reply has `run_id`, `enabled`, `prompt` (with `body` and `blocks`), `settings`, `requests`, `connections` and `criteria`.
2. If `enabled` is false, or the reply is an error, stop. Do nothing else.
3. Follow `prompt.body` from its step 3 onward, exactly, applying every block in `prompt.blocks`. Where it says GET context, call `GET {RECOS_URL}/run-agent/context?want=...` with the same two headers. Where it says write, POST `{RECOS_URL}/agent-write` with the same two headers and body `{"run_id":"<run_id>","records":[...]}`; read each result's `outcome` and do what the prompt says about rejections.
4. Finish with POST `{RECOS_URL}/run-agent/run-finish`, same headers, body `{"run_id":"<run_id>","status":"ok|partial|failed","errors":[{"source":"...","message":"..."}],"summary":"<line 1>\n<line 2>"}`.
5. Never store, print or send an email address, phone number or key anywhere but these calls. Never act outside the connectors named in `connections`.

For another agent, change the code in the name header, the key variable and the first line. The sender is the one exception: it has its own prompt in `sender.md` and never calls run-start.
