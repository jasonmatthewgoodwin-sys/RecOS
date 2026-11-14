import { useState, type FormEvent } from 'react'
import { PillButton } from '../components/PillButton'
import { TextLink } from '../components/TextLink'
import { useAuth, type SignInProblem } from '../lib/auth'

const problemLine: Record<Exclude<SignInProblem, null>, string> = {
  refused: 'This account does not have access.',
  expired: 'That link has expired or was already used. Ask for a new one.',
  failed: 'Sign-in did not finish. Try again.',
}

// The sign-in view (sections 5.2 and 5.5): one line and one pill button, with
// a quieter link for the emailed one-time link. No password is ever asked for.
export function SignIn({ problem }: { problem: SignInProblem }) {
  const auth = useAuth()
  const [mode, setMode] = useState<'microsoft' | 'email' | 'sent'>('microsoft')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    await auth.emailLink(email)
    setBusy(false)
    setMode('sent')
  }

  return (
    <div className="flex min-h-96 flex-col items-start justify-center gap-8">
      <h1 className="text-title text-ink">RecOS</h1>

      {problem && <p className="text-body text-ink">{problemLine[problem]}</p>}

      {mode === 'microsoft' && (
        <>
          <PillButton kind="primary" label="Sign in with Microsoft" onClick={() => void auth.signInWithMicrosoft()} />
          <TextLink label="Email me a sign-in link" onClick={() => setMode('email')} />
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
              className="h-11 w-full rounded-pill border border-ink bg-transparent px-6 text-body text-ink"
            />
          </label>
          <PillButton kind="primary" type="submit" label="Send link" busy={busy} />
          <TextLink label="Back" onClick={() => setMode('microsoft')} />
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
