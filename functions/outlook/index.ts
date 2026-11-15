// Outlook through Microsoft Graph (Route B of 24.1; 15 November 2026). Two paths:
//   GET /outlook/start?state=...   the owner's browser, with a state from connection_oauth_begin
//   GET /outlook/callback          Microsoft, after the owner consents
//
// Deploy: supabase functions deploy outlook --no-verify-jwt
// (supabase/config.toml has verify_jwt = false: a browser link and a
// Microsoft redirect carry no Supabase token. Each path checks the one-time
// state instead, which only the signed-in owner can make.)
//
// The app registration is multi-tenant and lives in a directory Jason owns;
// he signs in with his work account and consents as a user. Secrets, from
// function settings only: MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REDIRECT_URI
// (default below) and APP_URL. The refresh token goes to Supabase Vault
// (migration 0041) and never reaches the browser.
//
// The adapter operations (sendMail, createDraft, listEvents, findMessages,
// readMessage) and the send engine's hook sendViaGraph live in graph.ts so
// other functions can import them without starting this server.

import { serviceClient } from '../_shared/agent.ts'
import { AUTHORITY, GRAPH, msConfig, OutlookError, SCOPES, tokenRequest, DEFAULT_APP_URL } from './graph.ts'

export { createDraft, findMessages, getAccessToken, listEvents, readMessage, sendMail, sendViaGraph } from './graph.ts'

function back(appUrl: string, outcome: 'connected' | 'error', reason?: string): Response {
  const q = new URLSearchParams({ outlook: outcome, ...(reason ? { reason } : {}) })
  return new Response(null, { status: 302, headers: { location: `${appUrl}/settings/connections?${q.toString()}`, 'cache-control': 'no-store' } })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const path = url.pathname.split('/').filter(Boolean).pop() ?? ''
  const appUrl = (Deno.env.get('APP_URL') || DEFAULT_APP_URL).replace(/\/+$/, '')
  if (req.method !== 'GET') return new Response('GET only.', { status: 405 })

  let cfg
  try {
    cfg = msConfig()
  } catch (e) {
    return back(appUrl, 'error', e instanceof OutlookError ? e.code : 'not_configured')
  }
  const db = serviceClient()

  if (path === 'start') {
    const state = url.searchParams.get('state') ?? ''
    const { data: owner, error } = await db.rpc('connection_oauth_check', { p_state: state })
    if (error || !owner) return back(cfg.appUrl, 'error', 'state')
    const q = new URLSearchParams({
      client_id: cfg.clientId,
      response_type: 'code',
      redirect_uri: cfg.redirectUri,
      response_mode: 'query',
      scope: SCOPES,
      state,
      prompt: 'select_account',
    })
    return new Response(null, { status: 302, headers: { location: `${AUTHORITY}/authorize?${q.toString()}`, 'cache-control': 'no-store' } })
  }

  if (path === 'callback') {
    const state = url.searchParams.get('state') ?? ''
    // The state is used once, whatever Microsoft answered.
    const { data: owner, error } = await db.rpc('connection_oauth_take', { p_state: state })
    if (error || !owner) return back(cfg.appUrl, 'error', 'state')
    const msError = url.searchParams.get('error')
    if (msError) return back(cfg.appUrl, 'error', msError === 'access_denied' ? 'declined' : 'microsoft')
    const code = url.searchParams.get('code') ?? ''
    if (!code) return back(cfg.appUrl, 'error', 'no_code')

    const t = await tokenRequest(cfg, { grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri })
    if (!t.access_token || !t.refresh_token) return back(cfg.appUrl, 'error', 'token')

    const me = await fetch(`${GRAPH}/me?$select=displayName,mail,userPrincipalName`, { headers: { authorization: `Bearer ${t.access_token}` } })
    if (!me.ok) return back(cfg.appUrl, 'error', 'profile')
    const p = (await me.json()) as { displayName?: string; mail?: string; userPrincipalName?: string }
    const address = p.mail ?? p.userPrincipalName ?? ''
    const label = p.displayName && address ? `${p.displayName} (${address})` : p.displayName || address || 'Outlook'

    const saved = await db.rpc('connection_connect', { p_owner: owner, p_provider: 'outlook', p_secret: t.refresh_token, p_account_label: label })
    if (saved.error) return back(cfg.appUrl, 'error', 'store')
    return back(cfg.appUrl, 'connected')
  }

  return new Response('No such path. Use /outlook/start or /outlook/callback.', { status: 404 })
})
