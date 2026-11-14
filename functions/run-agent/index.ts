// E1, E3, E4 and E9 (sections 15.4, 15.5, 15.9). One function, four paths:
//   POST /run-agent/run-start    { agent, trigger, mode }        agent key
//   POST /run-agent/run-finish   { run_id, status, errors, summary, cost }   agent key
//   GET  /run-agent/context?want=pool,job_keys                   agent key
//   POST /run-agent/request-run  { agent }                       the owner's session
//
// Deploy: supabase functions deploy run-agent --no-verify-jwt
// The agent paths check the agent key themselves; request-run checks the
// owner's session token through the database's own role check.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { authenticateAgent, fail, fromDbError, ok, readJson, serviceClient } from '../_shared/agent.ts'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const path = url.pathname.split('/').filter(Boolean).pop() ?? ''
  const db = serviceClient()

  if (path === 'request-run') {
    if (req.method !== 'POST') return fail('invalid', 'POST only.')
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return fail('not_signed_in', 'Sign in first.')
    const body = await readJson(req)
    if (body instanceof Response) return body
    // The owner's own session: the database checks the role (request_run raises otherwise).
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    })
    const { data, error } = await asUser.rpc('request_run', { p_agent: String(body.agent ?? '') })
    if (error) return /Only the owner/.test(error.message) ? fail('not_allowed', 'Only the owner can ask for a run.') : fromDbError(error.message)
    return ok({ request_id: data, note: 'The agent checks for requests at the top of its schedule. For a faster run, start the task by hand in the Claude app.' })
  }

  const agent = await authenticateAgent(req, db)
  if (agent instanceof Response) return agent

  if (path === 'run-start') {
    if (req.method !== 'POST') return fail('invalid', 'POST only.')
    const body = await readJson(req)
    if (body instanceof Response) return body
    if (body.agent !== undefined && body.agent !== agent) return fail('not_allowed', 'The agent in the body must be the one in the key.', 'agent')
    const trigger = typeof body.trigger === 'string' ? body.trigger : 'schedule'
    const mode = typeof body.mode === 'string' ? body.mode : null
    const { data, error } = await db.rpc('agent_run_start', { p_agent: agent, p_trigger: trigger, p_mode: mode })
    if (error) return fromDbError(error.message)
    return ok(data)
  }

  if (path === 'run-finish') {
    if (req.method !== 'POST') return fail('invalid', 'POST only.')
    const body = await readJson(req)
    if (body instanceof Response) return body
    const runId = typeof body.run_id === 'string' ? body.run_id : ''
    if (!runId) return fail('invalid', 'run_id is needed.', 'run_id')
    const { data: run } = await db.from('agent_runs').select('agent').eq('id', runId).maybeSingle()
    if (!run || run.agent !== agent) return fail('not_found', 'No run with that ID for this agent.', 'run_id')
    const { data, error } = await db.rpc('agent_run_finish', {
      p_run: runId,
      p_status: typeof body.status === 'string' ? body.status : 'ok',
      p_errors: Array.isArray(body.errors) ? body.errors : [],
      p_summary: typeof body.summary === 'string' ? body.summary : null,
      p_cost: typeof body.cost === 'number' ? body.cost : null,
    })
    if (error) return fromDbError(error.message)
    return ok(data)
  }

  if (path === 'context') {
    if (req.method !== 'GET') return fail('invalid', 'GET only.')
    const want = (url.searchParams.get('want') ?? '').split(',').map((w) => w.trim()).filter(Boolean)
    if (want.length === 0) return fail('invalid', 'Say what you want: want=pool,job_keys', 'want')
    const { data, error } = await db.rpc('agent_context', { p_agent: agent, p_want: want })
    if (error) return fromDbError(error.message)
    return ok(data)
  }

  return fail('not_found', 'No such path. Use run-start, run-finish, context or request-run.')
})
