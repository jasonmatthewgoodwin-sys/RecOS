// The mail and calendar adapters over Microsoft Graph (low-level design 24.2,
// 24.3; Route B of 24.1). Deno, for Supabase Edge Functions. Importable by
// other functions: this file starts no server. The routes live in index.ts.
//
// The refresh token is kept in Supabase Vault through the definer functions
// of migration 0041 and read only here, with the service role. Access tokens
// live in memory for the life of the isolate and are never stored or logged.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { serviceClient } from '../_shared/agent.ts'

export const GRAPH = 'https://graph.microsoft.com/v1.0'
export const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0'
/** Mail and calendar for this connection only. Sign-in itself still asks for name and email alone (rule 7). */
export const SCOPES = 'offline_access User.Read Mail.Send Mail.ReadWrite Calendars.Read'
export const DEFAULT_REDIRECT = 'https://vbnzdugfgoletjlumxba.supabase.co/functions/v1/outlook/callback'
export const DEFAULT_APP_URL = 'https://rec-os-gules.vercel.app'

export type MsConfig = { clientId: string; clientSecret: string; redirectUri: string; appUrl: string }

/** The app registration, from function secrets only. */
export function msConfig(): MsConfig {
  const clientId = Deno.env.get('MS_CLIENT_ID') ?? ''
  const clientSecret = Deno.env.get('MS_CLIENT_SECRET') ?? ''
  if (!clientId || !clientSecret) throw new OutlookError('not_configured', 'MS_CLIENT_ID and MS_CLIENT_SECRET are not set.')
  return {
    clientId,
    clientSecret,
    redirectUri: Deno.env.get('MS_REDIRECT_URI') || DEFAULT_REDIRECT,
    appUrl: (Deno.env.get('APP_URL') || DEFAULT_APP_URL).replace(/\/+$/, ''),
  }
}

export type OutlookErrorCode = 'not_configured' | 'not_connected' | 'needs_sign_in' | 'graph_failed'

export class OutlookError extends Error {
  constructor(public code: OutlookErrorCode, message: string) {
    super(message)
  }
}

// ---------------------------------------------------------------- tokens

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }

/** One POST to the token endpoint. */
export async function tokenRequest(cfg: MsConfig, form: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: SCOPES, ...form }),
  })
  return (await res.json().catch(() => ({ error: 'bad_response' }))) as TokenResponse
}

const cache = new Map<string, { token: string; until: number }>()

/** A Graph access token for the owner, by refreshing. Stores the rotated refresh token. */
export async function getAccessToken(db: SupabaseClient, owner: string): Promise<string> {
  const hit = cache.get(owner)
  if (hit && hit.until > Date.now() + 60_000) return hit.token
  const cfg = msConfig()
  const { data: refresh, error } = await db.rpc('connection_secret_get', { p_owner: owner, p_provider: 'outlook' })
  if (error) throw new OutlookError('graph_failed', 'The stored sign-in could not be read.')
  if (!refresh) throw new OutlookError('not_connected', 'Outlook is not connected.')
  const t = await tokenRequest(cfg, { grant_type: 'refresh_token', refresh_token: String(refresh) })
  if (!t.access_token) {
    const why = t.error === 'invalid_grant' || t.error === 'interaction_required' ? 'needs_sign_in' : 'failing'
    await db.rpc('connection_record', {
      p_owner: owner, p_provider: 'outlook', p_status: why, p_account_label: null,
      p_error: why === 'needs_sign_in' ? 'Microsoft asked for a fresh sign-in.' : `The token refresh failed (${t.error ?? 'unknown'}).`,
    })
    cache.delete(owner)
    throw new OutlookError(why === 'needs_sign_in' ? 'needs_sign_in' : 'graph_failed', why === 'needs_sign_in' ? 'Outlook needs signing in again.' : 'Outlook could not be reached.')
  }
  if (t.refresh_token && t.refresh_token !== refresh) {
    await db.rpc('connection_secret_put', { p_owner: owner, p_provider: 'outlook', p_secret: t.refresh_token })
  }
  await db.rpc('connection_record', { p_owner: owner, p_provider: 'outlook', p_status: 'connected', p_account_label: null, p_error: null })
  cache.set(owner, { token: t.access_token, until: Date.now() + (t.expires_in ?? 3600) * 1000 })
  return t.access_token
}

/** One Graph call as the owner. Errors mark the connection failing (24.9). */
export async function graph(db: SupabaseClient, owner: string, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken(db, owner)
  const res = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  if (res.status === 401) {
    cache.delete(owner)
    await db.rpc('connection_record', { p_owner: owner, p_provider: 'outlook', p_status: 'needs_sign_in', p_account_label: null, p_error: 'Microsoft refused the token.' })
    throw new OutlookError('needs_sign_in', 'Outlook needs signing in again.')
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (res.status >= 500 || res.status === 403) {
      await db.rpc('connection_record', { p_owner: owner, p_provider: 'outlook', p_status: 'failing', p_account_label: null, p_error: `Graph answered ${res.status}.` })
    }
    throw new OutlookError('graph_failed', `Graph answered ${res.status}: ${detail.slice(0, 200)}`)
  }
  return res
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

// ---------------------------------------------------------------- mail (24.2)

export type MailInput = { to: string; subject: string; body: string; replyToId?: string | null; toName?: string | null }

const recipients = (to: string, name?: string | null) => [{ emailAddress: { address: to, ...(name ? { name } : {}) } }]

/** send: POST /me/sendMail, kept in Sent Items. A reply goes through /reply on the original. */
export async function sendMail(db: SupabaseClient, owner: string, m: MailInput): Promise<{ ref: string }> {
  if (m.replyToId) {
    await graph(db, owner, `/me/messages/${encodeURIComponent(m.replyToId)}/reply`, {
      method: 'POST',
      body: JSON.stringify({ message: { toRecipients: recipients(m.to, m.toName) }, comment: m.body }),
    })
    return { ref: `graph:reply:${m.replyToId}` }
  }
  await graph(db, owner, '/me/sendMail', {
    method: 'POST',
    body: JSON.stringify({
      message: { subject: m.subject, body: { contentType: 'Text', content: m.body }, toRecipients: recipients(m.to, m.toName) },
      saveToSentItems: true,
    }),
  })
  // sendMail answers 202 with no id; the Sent Items copy is found by findInSent when needed.
  return { ref: `graph:sent:${new Date().toISOString()}` }
}

/** createDraft: POST /me/messages (or createReply), returning the draft's webLink. */
export async function createDraft(db: SupabaseClient, owner: string, m: MailInput): Promise<{ id: string; webLink: string }> {
  if (m.replyToId) {
    const r = await json<{ id: string; webLink: string }>(
      await graph(db, owner, `/me/messages/${encodeURIComponent(m.replyToId)}/createReply`, { method: 'POST', body: '{}' }),
    )
    const u = await json<{ id: string; webLink: string }>(
      await graph(db, owner, `/me/messages/${encodeURIComponent(r.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: { contentType: 'Text', content: m.body }, toRecipients: recipients(m.to, m.toName) }),
      }),
    )
    return { id: u.id, webLink: u.webLink }
  }
  const d = await json<{ id: string; webLink: string }>(
    await graph(db, owner, '/me/messages', {
      method: 'POST',
      body: JSON.stringify({ subject: m.subject, body: { contentType: 'Text', content: m.body }, toRecipients: recipients(m.to, m.toName) }),
    }),
  )
  return { id: d.id, webLink: d.webLink }
}

export type FindInput = { sender?: string; subject?: string; text?: string; after?: string; before?: string; limit?: number }
export type FoundMessage = { id: string; subject: string; sender: string; received: string; summary: string; link: string }

type GraphMessage = {
  id: string
  subject?: string
  from?: { emailAddress?: { name?: string; address?: string } }
  receivedDateTime?: string
  bodyPreview?: string
  webLink?: string
  body?: { contentType: string; content: string }
  hasAttachments?: boolean
}

// Graph takes the whole KQL query in one pair of double quotes, so values lose their own.
const quoteKql = (s: string) => s.replace(/"/g, '').trim()

/** findMessages: $search for free text (KQL, whole mailbox), otherwise $filter. Never a folder with a date and text (24.2). */
export async function findMessages(db: SupabaseClient, owner: string, q: FindInput): Promise<FoundMessage[]> {
  const top = String(Math.min(Math.max(q.limit ?? 25, 1), 50))
  const p = new URLSearchParams({ $top: top, $select: 'id,subject,from,receivedDateTime,bodyPreview,webLink' })
  if (q.text || q.subject) {
    const kql = [
      q.text ? quoteKql(q.text) : '',
      q.subject ? `subject:${quoteKql(q.subject)}` : '',
      q.sender ? `from:${quoteKql(q.sender)}` : '',
      q.after ? `received>=${q.after.slice(0, 10)}` : '',
      q.before ? `received<=${q.before.slice(0, 10)}` : '',
    ].filter(Boolean).join(' AND ')
    p.set('$search', `"${kql}"`)
  } else {
    const f = [
      q.sender ? `from/emailAddress/address eq '${q.sender.replace(/'/g, "''")}'` : '',
      q.after ? `receivedDateTime ge ${new Date(q.after).toISOString()}` : '',
      q.before ? `receivedDateTime le ${new Date(q.before).toISOString()}` : '',
    ].filter(Boolean)
    if (f.length) p.set('$filter', f.join(' and '))
    p.set('$orderby', 'receivedDateTime desc')
  }
  const r = await json<{ value: GraphMessage[] }>(await graph(db, owner, `/me/messages?${p.toString()}`))
  return r.value.map((m) => ({
    id: m.id,
    subject: m.subject ?? '',
    sender: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? '',
    received: m.receivedDateTime ?? '',
    summary: m.bodyPreview ?? '',
    link: m.webLink ?? '',
  }))
}

/** readMessage: the full body and the attachment list. Bodies are read, used and not stored (24.2). */
export async function readMessage(db: SupabaseClient, owner: string, id: string) {
  const m = await json<GraphMessage>(
    await graph(db, owner, `/me/messages/${encodeURIComponent(id)}?$select=id,subject,from,receivedDateTime,body,hasAttachments,webLink`, {
      headers: { prefer: 'outlook.body-content-type="text"' },
    }),
  )
  let attachments: { name: string; contentType: string; size: number }[] = []
  if (m.hasAttachments) {
    const a = await json<{ value: { name: string; contentType: string; size: number }[] }>(
      await graph(db, owner, `/me/messages/${encodeURIComponent(id)}/attachments?$select=name,contentType,size`),
    )
    attachments = a.value.map((x) => ({ name: x.name, contentType: x.contentType, size: x.size }))
  }
  return {
    id: m.id,
    subject: m.subject ?? '',
    sender: m.from?.emailAddress?.name ?? '',
    received: m.receivedDateTime ?? '',
    body: m.body?.content ?? '',
    link: m.webLink ?? '',
    attachments,
  }
}

// ---------------------------------------------------------------- calendar (24.3)

type GraphEvent = {
  id: string
  subject?: string
  start?: { dateTime: string }
  end?: { dateTime: string }
  attendees?: { emailAddress?: { name?: string; address?: string } }[]
  webLink?: string
}

/** The domain of the owner's own mailbox, to tell inside from outside. */
async function ownDomain(db: SupabaseClient, owner: string): Promise<string> {
  const me = await json<{ mail?: string; userPrincipalName?: string }>(await graph(db, owner, '/me?$select=mail,userPrincipalName'))
  return (me.mail ?? me.userPrincipalName ?? '').split('@')[1]?.toLowerCase() ?? ''
}

/** listEvents(from, to): id, title, start, end, attendees by name with whether each is outside the firm. Addresses are not returned (rule 1). */
export async function listEvents(db: SupabaseClient, owner: string, from: string, to: string) {
  const domain = await ownDomain(db, owner)
  const p = new URLSearchParams({
    startDateTime: new Date(from).toISOString(),
    endDateTime: new Date(to).toISOString(),
    $select: 'id,subject,start,end,attendees,webLink',
    $orderby: 'start/dateTime',
    $top: '100',
  })
  const r = await json<{ value: GraphEvent[] }>(await graph(db, owner, `/me/calendarView?${p.toString()}`, { headers: { prefer: 'outlook.timezone="UTC"' } }))
  return r.value.map((e) => ({
    id: e.id,
    title: e.subject ?? '',
    start: e.start?.dateTime ? `${e.start.dateTime.replace(/\.\d+$/, '')}Z` : '',
    end: e.end?.dateTime ? `${e.end.dateTime.replace(/\.\d+$/, '')}Z` : '',
    link: e.webLink ?? '',
    attendees: (e.attendees ?? []).map((a) => {
      const d = (a.emailAddress?.address ?? '').split('@')[1]?.toLowerCase() ?? ''
      return { name: a.emailAddress?.name ?? '', external: Boolean(domain && d && d !== domain) }
    }),
  }))
}

// ---------------------------------------------------------------- the send engine's hook

export type GraphSendResult = { sent: true; ref: string } | { sent: false; fallback: true; reason: string } | { sent: false; fallback: false; reason: string }

/**
 * Send one message the engine has already handed out (state `sending`, from
 * send_tick) through Graph, and report the outcome to send_report. Nothing
 * else may call sendMail for a queued message: the engine decides, this only
 * carries (rule 5).
 *
 * Returns fallback: true, without reporting, when Graph cannot carry it
 * (Outlook not connected, no address held): the caller leaves the message
 * for the sender routine. A Graph failure is reported as a failed try, so
 * the engine's retry and pause rules apply (20.8).
 */
export async function sendViaGraph(messageId: string, db: SupabaseClient = serviceClient()): Promise<GraphSendResult> {
  const { data: m, error } = await db
    .from('messages')
    .select('id, owner_id, state, channel, to_name, to_address, subject, body')
    .eq('id', messageId)
    .maybeSingle()
  if (error || !m) return { sent: false, fallback: false, reason: 'No such message.' }
  if (m.state !== 'sending') return { sent: false, fallback: false, reason: `That message is ${m.state}, not sending.` }
  if (m.channel !== 'email') return { sent: false, fallback: true, reason: 'Not an email.' }
  if (!m.to_address) return { sent: false, fallback: true, reason: 'No address held; the sender routine looks it up.' }
  const { data: conn } = await db.from('connections').select('status').eq('owner_id', m.owner_id).eq('provider', 'outlook').maybeSingle()
  if (!conn || conn.status === 'needs_sign_in') return { sent: false, fallback: true, reason: 'Outlook is not connected.' }
  try {
    const { ref } = await sendMail(db, m.owner_id, { to: m.to_address, toName: m.to_name, subject: m.subject ?? '', body: m.body ?? '' })
    await db.rpc('send_report', { p_message: m.id, p_ok: true, p_ref: ref, p_error: null, p_to_address: m.to_address })
    return { sent: true, ref }
  } catch (e) {
    if (e instanceof OutlookError && (e.code === 'not_connected' || e.code === 'needs_sign_in' || e.code === 'not_configured')) {
      return { sent: false, fallback: true, reason: e.message }
    }
    const why = e instanceof Error ? e.message : 'unknown'
    await db.rpc('send_report', { p_message: m.id, p_ok: false, p_ref: null, p_error: `Graph: ${why}`.slice(0, 500), p_to_address: null })
    return { sent: false, fallback: false, reason: why }
  }
}
