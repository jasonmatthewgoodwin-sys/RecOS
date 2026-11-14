import { useState, type FormEvent } from 'react'
import { PillButton } from '../components/PillButton'
import { TextLink } from '../components/TextLink'
import { useAuth, type SignInProblem } from '../lib/auth'

const problemLine: Record<Exclude<SignInProblem, null>, string> = {
  refused: 'This account does not have access.',
  expired: 'That link has expired or was already used. Ask for a new one.',
  failed: 'Sign-in did not finish. Try again.',
}

const inputCls = 'h-11 w-full rounded-pill border border-ink bg-transparent px-6 text-body text-ink'

// The sign-in view (sections 5.2 and 5.5): one line and one pill button, with
// a quieter link for the emailed one-time link. A password is a departure
// agreed on 14 November 2026 (docs/decisions.md): it is the third, quietest
// choice, and the owner sets it in Settings, Profile.
export function SignIn({ problem }: { problem: SignInProblem }) {
  const auth = useAuth()
  const [mode, setMode] = useState<'microsoft' | 'email' | 'sent' | 'password'>('microsoft')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [noMatch, setNoMatch] = useState<string | null>(null)

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    await auth.emailLink(email)
    setBusy(false)
    setMode('sent')
  }

  async function signIn(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setBusy(true)
    setNoMatch(null)
    const result = await auth.signInWithPassword(email, password)
    setBusy(false)
    if (result === 'no_match') setNoMatch('Email or password did not match.')
    else if (result === 'failed') setNoMatch('Sign-in did not finish. Try again.')
    // On 'ok' the session arrives and the sheet changes. No message (33.3).
  }

  function back() {
    setMode('microsoft')
    setPassword('')
    setNoMatch(null)
  }

  return (
    <div className="flex min-h-96 flex-col items-start justify-center gap-8">
      <h1 className="text-title text-ink">RecOS</h1>

      {problem && mode === 'microsoft' && <p className="text-body text-ink">{problemLine[problem]}</p>}

      {mode === 'microsoft' && (
        <>
          <PillButton kind="primary" label="Sign in with Microsoft" onClick={() => void auth.signInWithMicrosoft()} />
          <div className="flex flex-col items-start gap-2">
            <TextLink label="Email me a sign-in link" onClick={() => setMode('email')} />
            <TextLink label="Sign in with a password" onClick={() => setMode('password')} />
          </div>
        </>
      )}

      {mode === 'email' && (
        <form onSubmit={send} className="flex w-full max-w-sm flex-col items-start gap-6">
          <label className="flex w-full flex-col gap-2">
            <span className="label-caps text-ink-2">Work email</span>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </label>
          <PillButton kind="primary" type="submit" label="Send link" busy={busy} />
          <TextLink label="Back" onClick={back} />
        </form>
      )}

      {mode === 'password' && (
        <form onSubmit={signIn} className="flex w-full max-w-sm flex-col items-start gap-6">
          <label className="flex w-full flex-col gap-2">
            <span className="label-caps text-ink-2">Work email</span>
            <input
              type="email"
              required
              autoFocus
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex w-full flex-col gap-2">
            <span className="label-caps text-ink-2">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
          </label>
          {noMatch && <p className="text-body text-ink-2">{noMatch}</p>}
          <PillButton kind="primary" type="submit" label="Sign in" busy={busy} />
          <TextLink label="Back" onClick={back} />
        </form>
      )}

      {mode === 'sent' && (
        <p className="max-w-sm text-body text-ink">
          If that address has access, a link is on its way. It works once and lasts 10 minutes.
        </p>
      )}
    </div>
  )
}
