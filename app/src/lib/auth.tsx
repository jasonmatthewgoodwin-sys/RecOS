// Sign-in and sessions (section 5). Microsoft is asked for name and email
// only. The role comes from the session token, never from the front end.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

export type Role = 'owner' | 'reviewer'

export type Session = { firstName: string; role: Role }

/** Why the sign-in view is showing after an attempt, if it is. */
export type SignInProblem = 'refused' | 'expired' | 'failed' | null

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; problem: SignInProblem }
  | { status: 'signed-in'; session: Session }

type Auth = {
  state: AuthState
  signInWithMicrosoft: () => Promise<void>
  /** Always resolves the same way, so the form cannot be used to test addresses (5.5). */
  emailLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

/** Reads the claims from a session token. The database checks the token; this only reads it. */
export function readClaims(accessToken: string): Record<string, unknown> {
  try {
    const payload = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return {}
  }
}

export function firstNameOf(fullName: unknown, email: unknown): string {
  if (typeof fullName === 'string' && fullName.trim()) return fullName.trim().split(/\s+/)[0]
  if (typeof email === 'string' && email.includes('@')) {
    const local = email.split('@')[0].split(/[._-]/)[0]
    return local.charAt(0).toUpperCase() + local.slice(1)
  }
  return ''
}

type RawSession = { access_token: string; user: { email?: string; user_metadata?: Record<string, unknown> } }

function toState(raw: RawSession | null, problem: SignInProblem): AuthState {
  if (!raw) return { status: 'signed-out', problem }
  const role = readClaims(raw.access_token).app_role
  // A session with no role is not on the allow-list (AUTH-2).
  if (role !== 'owner' && role !== 'reviewer') return { status: 'signed-out', problem: 'refused' }
  const meta = raw.user.user_metadata ?? {}
  return {
    status: 'signed-in',
    session: { firstName: firstNameOf(meta.full_name ?? meta.name, raw.user.email), role },
  }
}

/**
 * What the auth service said when it sent the browser back, read from the
 * address. An emailed link works once and for 10 minutes (5.5); a dead link
 * is not a refusal, and saying so stops the owner asking for access he has.
 */
export function problemInUrl(search: string, hash: string): SignInProblem {
  const text = `${search}${hash}`
  if (!/[?&#]error(_code|_description)?=/.test(text)) return null
  const params = new URLSearchParams(text.replace(/^[?#]/, '').replace(/#/, '&'))
  const code = (params.get('error_code') ?? '').toLowerCase()
  const description = (params.get('error_description') ?? '').toLowerCase()
  if (code.includes('otp_expired') || description.includes('expired') || description.includes('invalid')) return 'expired'
  if (code.includes('access_denied') || params.get('error') === 'access_denied') return 'refused'
  return 'failed'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // With no project configured the app runs on sample data as an invented owner.
  const [state, setState] = useState<AuthState>(
    supabase ? { status: 'loading' } : { status: 'signed-in', session: { firstName: 'Jason', role: 'owner' } },
  )

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    const problem = problemInUrl(window.location.search, window.location.hash)
    const apply = (raw: RawSession | null) => {
      const next = toState(raw, problem)
      if (raw && next.status === 'signed-out') void client.auth.signOut()
      setState(next)
    }
    void client.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => apply(session))
    return () => sub.subscription.unsubscribe()
  }, [])

  const auth = useMemo<Auth>(
    () => ({
      state,
      async signInWithMicrosoft() {
        await supabase?.auth.signInWithOAuth({
          provider: 'azure',
          // AUTH-1 and AUTH-8: basic profile and email. Nothing else, ever.
          options: { scopes: 'openid profile email', redirectTo: window.location.origin },
        })
      },
      async emailLink(email: string) {
        try {
          await supabase?.auth.signInWithOtp({
            email: email.trim().toLowerCase(),
            options: { emailRedirectTo: window.location.origin },
          })
        } catch {
          // Deliberately silent. The same message shows whatever happened.
        }
      },
      async signOut() {
        if (!supabase) return
        // AUTH-7: the sign-out is logged before the session ends. A failure to
        // log never stops someone signing out.
        await supabase.rpc('audit_sign_out').then(
          () => {},
          () => {},
        )
        // AUTH-6: ends the session on this device only.
        await supabase.auth.signOut({ scope: 'local' })
      },
    }),
    [state],
  )

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth needs an AuthProvider above it')
  return auth
}
