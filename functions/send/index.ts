// E5 and the queue (sections 15.6, 20.6, 20.7, 20.8). One function, four paths:
//   POST /send                   { message_id, action }        the owner's session
//   POST /send/tick              { channel?, limit? }          the sender task's agent key
//   POST /send/report            { message_id, ok, external_ref?, error?, to_address? }   agent key
//   POST /send/linkedin-warning  { reason }                    agent key
//
// Deploy: supabase functions deploy send --no-verify-jwt
//
// The rules live in the database (migration 0034): send_action, send_tick,
// send_report and send_linkedin_warning. This function checks who is calling
// and passes the call on. It holds no mail credentials: route A of 20.7 sends
// email from the owner's own Outlook through the sender task (a Claude
// routine with Outlook attached), which calls tick, sends each message, and
// reports. LinkedIn connection notes go the same way through the collect-mode
// browser run. Open in Outlook is a compose link the owner's browser opens;
// nothing is sent by it.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { authenticateAgent, fail, fromDbError, ok, readJson, serviceClient } from '../_shared/agent.ts'

const ACTIONS = ['approve', 'open_draft', 'mark_sent', 'cancel']

/** A compose link for the owner's Outlook on the web. The address is left for Outlook's own autocomplete when RecOS does not hold one (MSG-1). */
export function composeLink(to: string | null, subject: string | null, body: string | null): string {
  const q = new URLSearchParams()
  if (to) q.set('to', to)
  if (subject) q.set('subject', subject)
  if (body) q.set('body', body)
  return `https://outlook.office.com/mail/deeplink/compose?${q.toString()}`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('invalid', 'POST only.')
  const url = new URL(req.url)
  const path = url.pathname.split('/').filter(Boolean).pop() ?? ''
  const db = serviceClient()

  if (path === 'send' || path === '') {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return fail('not_signed_in', 'Sign in first.')
    const body = await readJson(req)
    if (body instanceof Response) return body
    const messageId = typeof body.message_id === 'string' ? body.message_id : ''
    const action = typeof body.action === 'string' ? body.action : ''
    if (!messageId) return fail('invalid', 'message_id is needed.', 'message_id')
    if (!ACTIONS.includes(action)) return fail('invalid', 'action is approve, open_draft, mark_sent or cancel.', 'action')
    // The owner's own session: the database checks the role (send_action raises otherwise).
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    })
    if (action === 'open_draft') {
      // Two steps: read the draft, build the link, store it with the message.
      const first = await asUser.rpc('send_action', { p_message: messageId, p_action: 'open_draft' })
      if (first.error) return fromDbError(first.error.message)
      const d = first.data as { subject: string | null; body: string | null; to_address: string | null; to_name: string }
      const link = composeLink(d.to_address, d.subject, d.body)
      const second = await asUser.rpc('send_action', { p_message: messageId, p_action: 'open_draft', p_outlook_url: link })
      if (second.error) return fromDbError(second.error.message)
      return ok({ state: 'draft', outlook_draft_url: link, note: `Opens a draft to ${d.to_name} in Outlook. Nothing is sent until you press Send there.` })
    }
    const { data, error } = await asUser.rpc('send_action', { p_message: messageId, p_action: action })
    if (error) return fromDbError(error.message)
    return ok(data)
  }

  const agent = await authenticateAgent(req, db)
  if (agent instanceof Response) return agent

  if (path === 'tick') {
    const body = await readJson(req)
    if (body instanceof Response) return body
    const channel = body.channel === 'email' || body.channel === 'linkedin' ? body.channel : null
    const limit = typeof body.limit === 'number' && body.limit > 0 && body.limit <= 20 ? Math.floor(body.limit) : 20
    const { data, error } = await db.rpc('send_tick', { p_channel: channel, p_limit: limit })
    if (error) return fromDbError(error.message)
    return ok(data)
  }

  if (path === 'report') {
    const body = await readJson(req)
    if (body instanceof Response) return body
    const messageId = typeof body.message_id === 'string' ? body.message_id : ''
    if (!messageId) return fail('invalid', 'message_id is needed.', 'message_id')
    if (typeof body.ok !== 'boolean') return fail('invalid', 'ok is true or false.', 'ok')
    const { data, error } = await db.rpc('send_report', {
      p_message: messageId,
      p_ok: body.ok,
      p_ref: typeof body.external_ref === 'string' ? body.external_ref : null,
      p_error: typeof body.error === 'string' ? body.error : null,
      p_to_address: typeof body.to_address === 'string' ? body.to_address : null,
    })
    if (error) return fromDbError(error.message)
    return ok(data)
  }

  if (path === 'linkedin-warning') {
    const body = await readJson(req)
    if (body instanceof Response) return body
    const { data, error } = await db.rpc('send_linkedin_warning', { p_reason: typeof body.reason === 'string' ? body.reason.slice(0, 200) : null })
    if (error) return fromDbError(error.message)
    return ok({ held: data, note: 'Every LinkedIn type is paused until the owner resumes it in Settings, Send rules.' })
  }

  return fail('not_found', 'No such path. Use /send, /send/tick, /send/report or /send/linkedin-warning.')
})
