// E5 and the queue (sections 15.6, 20.6, 20.7, 20.8). One function, these paths:
//   POST /send                   { message_id, action }        the owner's session
//   POST /send/tick              { channel?, limit? }          the sender task's agent key
//   POST /send/report            { message_id, ok, external_ref?, error?, to_address? }   agent key
//   POST /send/linkedin-warning  { reason }                    agent key
//   POST /send/linkedin-profiles { limit? }                    the sender only: profiles to read (0061)
//   POST /send/linkedin-profile  { person_id, ok, headline?, title?, company?, location?, country?, error? }   the sender only
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
import { createDraft, findMessages, readMessage } from '../outlook/graph.ts'

const ACTIONS = ['approve', 'open_draft', 'mark_sent', 'cancel']

/** A compose link for the owner's Outlook on the web. The address is left for Outlook's own autocomplete when RecOS does not hold one (MSG-1). */
/**
 * Make the draft in Outlook through Graph as a reply to the last message in
 * the thread this task is about: the thread the follow-up came from, else the
 * newest message from that person, else a message naming them. Null when
 * Outlook is not connected or Graph says no, so the caller falls back.
 */
async function draftInThread(
  db: ReturnType<typeof serviceClient>,
  token: string,
  messageId: string,
  d: { subject: string | null; body: string | null; to_address: string | null; to_name: string },
): Promise<{ webLink: string; inThread: boolean; subject: string } | null> {
  try {
    const { data: who } = await db.auth.getUser(token)
    const owner = who.user?.id
    if (!owner) return null
    const { data: conn } = await db.from('connections').select('status').eq('owner_id', owner).eq('provider', 'outlook').maybeSingle()
    if ((conn as { status: string } | null)?.status !== 'connected') return null

    // 1. The thread the follow-up came from, when the agent kept its link.
    let replyToId: string | null = null
    let subject = d.subject ?? ''
    const { data: fu } = await db.from('follow_ups').select('source_url').eq('message_id', messageId).maybeSingle()
    const sourceUrl = (fu as { source_url: string | null } | null)?.source_url ?? ''
    const item = /[?&]ItemID=([^&]+)/i.exec(sourceUrl)
    if (item) {
      try {
        const id = decodeURIComponent(item[1])
        const m = await readMessage(db, owner, id)
        replyToId = m.id
        subject = m.subject || subject
      } catch {
        replyToId = null
      }
    }
    // 2. Else the newest message from that person, or one that names them.
    if (!replyToId && d.to_name) {
      const from = d.to_address ? await findMessages(db, owner, { sender: d.to_address, limit: 1 }) : []
      const found = from.length ? from : await findMessages(db, owner, { text: `participants:${d.to_name}`, limit: 1 })
      if (found.length) {
        replyToId = found[0].id
        subject = found[0].subject || subject
      }
    }
    const made = await createDraft(db, owner, { to: d.to_address ?? '', toName: d.to_name, subject: subject || `About ${d.to_name}`, body: d.body ?? '', replyToId })
    return { webLink: made.webLink, inThread: replyToId !== null, subject }
  } catch (e) {
    console.error('draftInThread', e instanceof Error ? e.message : e)
    return null
  }
}

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
      // Two steps: read the draft, make the Outlook draft, store its link with the message.
      const first = await asUser.rpc('send_action', { p_message: messageId, p_action: 'open_draft' })
      if (first.error) return fromDbError(first.error.message)
      const d = first.data as { subject: string | null; body: string | null; to_address: string | null; to_name: string }
      // With Outlook connected (Route B), the draft is a reply in the last
      // thread with that person (Mia, 16 November 2026), so the context sits
      // under it and the send threads normally. Otherwise a compose link.
      const made = await draftInThread(db, token, messageId, d)
      const link = made?.webLink ?? composeLink(d.to_address, d.subject, d.body)
      const second = await asUser.rpc('send_action', { p_message: messageId, p_action: 'open_draft', p_outlook_url: link })
      if (second.error) return fromDbError(second.error.message)
      const note = made?.inThread
        ? `Opens a reply to ${d.to_name} in the thread "${made.subject}" in Outlook. Nothing is sent until you press Send there.`
        : made
          ? `Opens a new draft to ${d.to_name} in Outlook; no earlier thread was found. Nothing is sent until you press Send there.`
          : `Opens a draft to ${d.to_name} in Outlook. Nothing is sent until you press Send there.`
      return ok({ state: 'draft', outlook_draft_url: link, note, in_thread: made?.inThread ?? false })
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
      // sender.md says provider_ref; older callers say external_ref. Either is kept.
      p_ref: typeof body.provider_ref === 'string' ? body.provider_ref : typeof body.external_ref === 'string' ? body.external_ref : null,
      p_error: typeof body.error === 'string' ? body.error : null,
      p_to_address: typeof body.to_address === 'string' ? body.to_address : null,
    })
    if (error) return fromDbError(error.message)
    return ok(data)
  }

  // The LinkedIn sender's sweep (0054): who is still waiting to accept, and
  // what the sender saw on each profile. Only the sender may ask or report.
  if (path === 'linkedin-pending' || path === 'linkedin-status') {
    if (agent !== 'sender') return fail('not_allowed', 'Only the sender sweeps LinkedIn.')
    const body = await readJson(req)
    if (body instanceof Response) return body
    if (path === 'linkedin-pending') {
      const limit = typeof body.limit === 'number' && body.limit > 0 && body.limit <= 40 ? Math.floor(body.limit) : 20
      const { data, error } = await db.rpc('send_linkedin_pending', { p_limit: limit })
      if (error) return fromDbError(error.message)
      return ok(data)
    }
    const leadId = typeof body.lead_id === 'string' ? body.lead_id : ''
    if (!leadId) return fail('invalid', 'lead_id is needed.', 'lead_id')
    const status = typeof body.status === 'string' ? body.status : ''
    if (!['connected', 'pending', 'withdrawn'].includes(status)) return fail('invalid', 'status is connected, pending or withdrawn.', 'status')
    const { data, error } = await db.rpc('send_linkedin_status', { p_lead: leadId, p_status: status })
    if (error) return fromDbError(error.message)
    return ok(data)
  }

  // The LinkedIn reader (0061): the people whose profile is waiting to be
  // read, and what the top card says. Only the sender may ask or report.
  // Never an email address or phone number: the database refuses one.
  if (path === 'linkedin-profiles' || path === 'linkedin-profile') {
    if (agent !== 'sender') return fail('not_allowed', 'Only the sender reads LinkedIn profiles.')
    const body = await readJson(req)
    if (body instanceof Response) return body
    if (path === 'linkedin-profiles') {
      const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(Math.floor(body.limit), 10) : 10
      const { data, error } = await db.rpc('linkedin_profiles_claim', { p_limit: limit })
      if (error) return fromDbError(error.message)
      return ok(data)
    }
    const personId = typeof body.person_id === 'string' ? body.person_id : ''
    if (!personId) return fail('invalid', 'person_id is needed.', 'person_id')
    if (typeof body.ok !== 'boolean') return fail('invalid', 'ok is true or false.', 'ok')
    const text = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : null)
    const { data, error } = await db.rpc('linkedin_profile_report', {
      p_person: personId,
      p_ok: body.ok,
      p_headline: text('headline'),
      p_title: text('title'),
      p_company: text('company'),
      p_location: text('location'),
      p_country: text('country'),
      p_error: text('error'),
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

  return fail('not_found', 'No such path. Use /send, /send/tick, /send/report, /send/linkedin-pending, /send/linkedin-status, /send/linkedin-profiles, /send/linkedin-profile or /send/linkedin-warning.')
})
