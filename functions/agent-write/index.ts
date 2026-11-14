// E2: POST /agent/write (section 16). The one door agents write through.
// Checks the key, hands the batch to agent_write_once in the database, which
// validates every record, builds the duplicate keys, merges and writes the
// side effects in one transaction, and returns outcomes and IDs only (16.12).
//
// Deploy: supabase functions deploy agent-write --no-verify-jwt
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by the platform.

import { authenticateAgent, fail, fromDbError, ok, readJson, serviceClient } from '../_shared/agent.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('invalid', 'POST only.')
  const db = serviceClient()
  const agent = await authenticateAgent(req, db)
  if (agent instanceof Response) return agent

  const body = await readJson(req)
  if (body instanceof Response) return body
  const runId = typeof body.run_id === 'string' ? body.run_id : ''
  const records = body.records
  if (!runId) return fail('invalid', 'run_id is needed.', 'run_id')
  if (!Array.isArray(records) || records.length === 0 || records.length > 200) return fail('invalid', 'records is a list of 1 to 200.', 'records')

  // The run must belong to the calling agent (16.2).
  const { data: run, error: runError } = await db.from('agent_runs').select('agent, status').eq('id', runId).maybeSingle()
  if (runError) return fail('failed', 'The run could not be read.')
  if (!run || run.agent !== agent) return fail('not_found', 'No open run with that ID for this agent.', 'run_id')
  if (run.status !== 'running') return fail('wrong_state', 'That run has finished.', 'run_id')

  const idempotencyKey = req.headers.get('idempotency-key') ?? ''
  const { data, error } = await db.rpc('agent_write_once', { p_run: runId, p_key: idempotencyKey, p_records: records })
  if (error) return fromDbError(error.message)
  return ok(data)
})
