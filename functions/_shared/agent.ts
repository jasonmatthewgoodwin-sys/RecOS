// Shared by the agent endpoints (sections 15.1, 15.2, 16). Deno, for
// Supabase Edge Functions. The agent key and name come in headers; the key
// is checked against its hash in the database and never logged.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export type ErrorCode = 'invalid' | 'not_signed_in' | 'not_allowed' | 'not_found' | 'duplicate' | 'wrong_state' | 'policy_refused' | 'cap_reached' | 'failed'

const status: Record<ErrorCode, number> = {
  invalid: 400,
  not_signed_in: 401,
  not_allowed: 403,
  not_found: 404,
  duplicate: 409,
  wrong_state: 409,
  policy_refused: 422,
  cap_reached: 429,
  failed: 500,
}

const headers = { 'content-type': 'application/json; charset=utf-8' }

/** One error shape (API-5), written for the owner to read (API-6). */
export function fail(code: ErrorCode, message: string, field?: string): Response {
  return new Response(JSON.stringify({ error: { code, message, ...(field ? { field } : {}) } }), { status: status[code], headers })
}

export function ok(body: unknown, code = 200): Response {
  return new Response(JSON.stringify(body), { status: code, headers })
}

/** The service client. The service role key lives in function secrets only (SYS-1). */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed')
  return createClient(url, key, { auth: { persistSession: false } })
}

const AGENTS = ['a1_review', 'a2_content', 'a3_jobs', 'a4_signals', 'a5_followups', 'a6_calls', 'a7_events']

/** API-2: agent calls carry the agent name and key. Returns the agent code or an error response. */
export async function authenticateAgent(req: Request, db: SupabaseClient): Promise<string | Response> {
  const agent = (req.headers.get('x-agent-name') ?? '').trim().toLowerCase()
  const key = (req.headers.get('x-agent-key') ?? '').trim()
  if (!AGENTS.includes(agent) || !key) return fail('not_signed_in', 'Send the agent name and key in the X-Agent-Name and X-Agent-Key headers.')
  const { data, error } = await db.rpc('agent_authenticate', { p_agent: agent, p_key: key })
  if (error) return fail('failed', 'The key could not be checked.')
  if (!data) return fail('not_signed_in', 'That agent key is not recognised.')
  return agent
}

/** The database raises errors as code: message. Map them to the API shape. */
export function fromDbError(message: string): Response {
  const m = /^(invalid|not_allowed|not_found|wrong_state|duplicate|policy_refused|cap_reached): (.*)$/.exec(message)
  if (m) return fail(m[1] as ErrorCode, m[2])
  return fail('failed', 'Something went wrong. Reference: ' + crypto.randomUUID().slice(0, 8))
}

export async function readJson(req: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('invalid', 'Send a JSON object.')
    return body as Record<string, unknown>
  } catch {
    return fail('invalid', 'The body is not JSON.')
  }
}
