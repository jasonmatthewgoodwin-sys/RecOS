import { useState, type FormEvent } from 'react'
import { Field } from '../../components/Field'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { EmptyLine } from '../../components/Quiet'
import { MIN_PASSWORD_LENGTH, useAuth } from '../../lib/auth'
import { settings } from '../../lib/sections'

// Settings, Profile (section 32). Only the password is here so far: the
// rest of the profile settings arrive in week 4. The password itself is a
// departure from the design agreed on 14 November 2026 (docs/decisions.md).
export function Profile() {
  const auth = useAuth()
  const tabs = settings.pages.map((p) => ({ label: p.label, route: `${settings.path}/${p.slug}` }))
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [saved, setSaved] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    if (password !== again) {
      setError('The two do not match')
      return
    }
    setError(undefined)
    setBusy(true)
    const result = await auth.setPassword(password)
    setBusy(false)
    if (result === 'ok') {
      setSaved(true)
      setPassword('')
      setAgain('')
    } else {
      setError('That did not save. Try again')
    }
  }

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Settings" tabs={tabs} />
      <form onSubmit={save} className="flex w-full max-w-sm flex-col items-start gap-8">
        <p className="label-caps text-ink-2">Password</p>
        <p className="text-body text-ink-2">
          Set one to sign in without an emailed link. At least {MIN_PASSWORD_LENGTH} characters. The Microsoft
          button and the emailed link still work.
        </p>
        <Field label="New password" kind="password" value={password} onChange={setPassword} autoComplete="new-password" />
        <Field label="Again" kind="password" value={again} onChange={setAgain} autoComplete="new-password" error={error} />
        <PillButton kind="primary" type="submit" label="Save" busy={busy} />
        {saved && <EmptyLine text="Saved. Use it next time." />}
      </form>
      <EmptyLine text="The rest of Profile arrives in week 4." />
    </div>
  )
}
