// Granola and Spott keys, and disconnecting any app (24.1, 24.9; 15 November 2026):
//   POST /connections/key         { provider: 'granola' | 'spott', key }   the owner's session
//   POST /connections/disconnect  { provider: 'outlook' | 'granola' | 'spott' }   the owner's session
//
// Deploy: supabase functions deploy connections --no-verify-jwt
// The owner's session token is checked by the database (connection_owner
// raises for anyone else), the same way run-agent checks request-run.
//
// A key is checked with one harmless read before it is kept, then stored in
// Supabase Vault (migration 0042). It is never returned, logged or echoed.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { serviceClient } from '../_shared/agent.ts'

const DEFAULT_APP_URL = 'https://rec-os-gules.vercel.app'

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const app = (Deno.env.get('APP_URL') || DEFAULT_APP_URL).replace(/\/+$/, '')
  const allowed = origin === app || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  return {
    'access-control-allow-origin': allowed ? origin : app,
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'origin',
  }
}

function reply(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(req) } })
}
const refuse = (req: Request, status: number, code: string, message: string) => reply(req, status, { error: { code, message } })

type Check = { ok: true; label: string } | { ok: false; why: string }

/** Granola: list one note. */
async function checkGranola(key: string): Promise<Check> {
  if (!key.startsWith('grn_')) return { ok: false, why: 'A Granola key starts grn_.' }
  const res = await fetch('https://public-api.granola.ai/v1/notes?page_size=1', { headers: { authorization: `Bearer ${key}` } })
  if (res.status === 401 || res.status === 403) return { ok: false, why: 'Granola did not accept that key.' }
  if (!res.ok) return { ok: false, why: `Granola answered ${res.status}. Try again later.` }
  return { ok: true, label: 'Granola' }
}

/** Spott: list one candidate (GET /candidates?limit=1, x-api-key). */
async function checkSpott(key: string): Promise<Check> {
  const res = await fetch('https://api.gospott.com/candidates?limit=1', { headers: { 'x-api-key': key } })
  if (res.status === 401 || res.status === 403) return { ok: false, why: 'Spott did not accept that key.' }
  if (!res.ok) return { ok: false, why: `Spott answered ${res.status}. Try again later.` }
  return { ok: true, label: 'Spott' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) })
  if (req.method !== 'POST') return refuse(req, 405, 'invalid', 'POST only.')
  const path = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? ''

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return refuse(req, 401, 'not_signed_in', 'Sign in first.')
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: owner, error: who } = await asUser.rpc('connection_owner')
  if (who || !owner) return refuse(req, 403, 'not_allowed', 'Only the owner can connect an app.')

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return refuse(req, 400, 'invalid', 'The body is not JSON.')
  }
  const provider = String(body?.provider ?? '')
  const db = serviceClient()

  if (path === 'key') {
    if (provider !== 'granola' && provider !== 'spott') return refuse(req, 400, 'invalid', 'provider is granola or spott.')
    const key = typeof body.key === 'string' ? body.key.trim() : ''
    if (key.length < 8 || key.length > 500) return refuse(req, 400, 'invalid', 'Paste the whole key.')
    let check: Check
    try {
      check = provider === 'granola' ? await checkGranola(key) : await checkSpott(key)
    } catch {
      check = { ok: false, why: `${provider === 'granola' ? 'Granola' : 'Spott'} could not be reached. Try again later.` }
    }
    if (!check.ok) return refuse(req, 422, 'policy_refused', check.why)
    const { data, error } = await db.rpc('connection_connect', { p_owner: owner, p_provider: provider, p_secret: key, p_account_label: check.label })
    if (error) return refuse(req, 500, 'failed', 'The key could not be kept. Try again.')
    const c = data as { status: string; account_label: string | null; connected_at: string | null; last_ok_at: string | null }
    return reply(req, 200, { provider, status: c.status, account_label: c.account_label, connected_at: c.connected_at, last_ok_at: c.last_ok_at })
  }

  if (path === 'disconnect') {
    if (!['outlook', 'granola', 'spott'].includes(provider)) return refuse(req, 400, 'invalid', 'provider is outlook, granola or spott.')
    const { error } = await db.rpc('connection_disconnect', { p_owner: owner, p_provider: provider })
    if (error) return refuse(req, 500, 'failed', 'That did not work. Try again.')
    return reply(req, 200, { provider, status: 'not_connected' })
  }

  return refuse(req, 404, 'not_found', 'No such path. Use /connections/key or /connections/disconnect.')
})
