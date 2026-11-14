import { useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { data, type Problem, type ProblemSeverity } from '../lib/data'
import { captureContext, refOf, severityChoices } from '../lib/problems'
import { invalidate } from '../lib/query'
import { Card } from './Card'
import { Field } from './Field'
import { TextLink } from './TextLink'

// Report a problem (the bug handover of 14 November 2026, in the RecOS look):
// a small window opened from the flag at the top right of the tabs, on every
// page. Three fields, one button. The page, browser, screen and build are
// captured without asking. On save it says the reference and offers Close.
// Nothing floats over the sheet and nothing is sent anywhere.
export function Report({ reporter, onClose }: { reporter: string | null; onClose: () => void }) {
  const { pathname, search } = useLocation()
  const name = reporter
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<ProblemSeverity>('medium')
  const [problem, setProblem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [raised, setRaised] = useState<Problem | null>(null)

  async function send(e: FormEvent) {
    e.preventDefault()
    if (description.trim() === '') {
      setProblem('Say what happened.')
      return
    }
    setProblem(null)
    setBusy(true)
    setError(null)
    try {
      const made = await data.reportProblem({ title: title.trim() || null, description: description.trim(), severity, reporterName: name, ...captureContext(`${pathname}${search}`) })
      invalidate('settings.problems')
      setRaised(made)
    } catch {
      setError('That did not save. Your words are still here. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (raised) {
    return (
      <Card
        label="Problem"
        title={`Raised as ${refOf(raised)}`}
        tone="new"
        sections={[{ body: <p>Thank you. It sits in Settings, Problems, until it is fixed.</p> }]}
        links={<TextLink label="Done" onClick={onClose} />}
        onClose={onClose}
      />
    )
  }

  return (
    <Card
      label="Problem"
      title="Something wrong?"
      tone="action"
      beforeClose={() => true}
      sections={[
        {
          body: (
            <form onSubmit={(e) => void send(e)} className="flex flex-col gap-5" aria-label="Report a problem">
              <Field label="What happened" kind="lines" rows={4} value={description} onChange={setDescription} autoFocus placeholder="What you did, what you expected, what you saw" error={problem ?? undefined} />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="In a few words" value={title} onChange={setTitle} placeholder="Optional" />
                <Field label="How bad" kind="choice" value={severity} onChange={(v) => setSeverity(v as ProblemSeverity)} choices={severityChoices} />
              </div>
              {error && <p className="text-body text-ink-2">{error}</p>}
              <p className="font-mono text-label text-ink-3">The page, browser, screen size and build go with it.</p>
            </form>
          ),
        },
      ]}
      primaryAction={{ label: 'Send', onClick: () => void send({ preventDefault() {} } as FormEvent), busy }}
      links={<TextLink label="Cancel" onClick={onClose} />}
      onClose={onClose}
    />
  )
}
