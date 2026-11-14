// Sign-in and sessions (section 5). Microsoft is asked for name and email
// only. The role comes from the session token, never from the front end.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

export type Role = 'owner' | 'reviewer'

export type Session = { firstName: string; role: Role }

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; refused: boolean }
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

function toState(raw: RawSession | null, refused: boolean): AuthState {
  if (!raw) return { status: 'signed-out', refused }
  const role = readClaims(raw.access_token).app_role
  // A session with no role is not on the allow-list (AUTH-2).
  if (role !== 'owner' && role !== 'reviewer') return { status: 'signed-out', refused: true }
  const meta = raw.user.user_metadata ?? {}
  return {
    status: 'signed-in',
    session: { firstName: firstNameOf(meta.full_name ?? meta.name, raw.user.email), role },
  }
}

/** True when Microsoft or the auth service sent the browser back with a refusal. */
function refusedInUrl(): boolean {
  const text = `${window.location.search}${window.location.hash}`
  return /[?&#]error(_code|_description)?=/.test(text)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // With no project configured the app runs on sample data as an invented owner.
  const [state, setState] = useState<AuthState>(
    supabase ? { status: 'loading' } : { status: 'signed-in', session: { firstName: 'Jason', role: 'owner' } },
  )

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    const refused = refusedInUrl()
    const apply = (raw: RawSession | null) => {
      const next = toState(raw, refused)
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
        await supabase?.auth.signOut()
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
