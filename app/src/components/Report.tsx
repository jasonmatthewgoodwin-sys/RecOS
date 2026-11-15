import { useRef, useState, type ClipboardEvent, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { data, type Problem } from '../lib/data'
import { captureContext, refOf, shrinkImage } from '../lib/problems'
import { invalidate } from '../lib/query'
import { Card } from './Card'
import { Field } from './Field'
import { TextLink } from './TextLink'

// Report a problem (the bug handover of 14 November 2026, in the RecOS look):
// a small window opened from the flag at the top right of the tabs, on every
// page. One field, a place for a picture, one button (Mia, 15 November 2026:
// the two small fields went; a screenshot says more). The page, browser,
// screen and build are captured without asking. On save it says the
// reference and offers Close. Nothing floats over the sheet and nothing is
// sent anywhere.
export function Report({ reporter, onClose }: { reporter: string | null; onClose: () => void }) {
  const { pathname, search } = useLocation()
  const name = reporter
  const [description, setDescription] = useState('')
  const [pictures, setPictures] = useState<string[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [raised, setRaised] = useState<Problem | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function addFiles(files: Iterable<File | Blob>) {
    const next = [...pictures]
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue
      if (next.length >= 3) break
      try {
        next.push(await shrinkImage(f))
      } catch {
        setError('That picture could not be read.')
      }
    }
    setPictures(next)
  }

  function onPaste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter((f): f is File => f !== null)
    if (files.length === 0) return
    e.preventDefault()
    void addFiles(files)
  }

  async function send(e: FormEvent) {
    e.preventDefault()
    if (description.trim() === '' && pictures.length === 0) {
      setProblem('Say what happened, or paste a picture.')
      return
    }
    setProblem(null)
    setBusy(true)
    setError(null)
    try {
      const made = await data.reportProblem({ title: null, description: description.trim() || 'See the picture', severity: 'medium', reporterName: name, ...captureContext(`${pathname}${search}`) })
      for (const p of pictures) await data.addProblemScreenshot(made.id, p)
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
            <form onSubmit={(e) => void send(e)} onPaste={onPaste} className="flex flex-col gap-5" aria-label="Report a problem">
              <Field label="What happened" kind="lines" rows={4} value={description} onChange={setDescription} autoFocus placeholder="What you did, what you expected, what you saw" error={problem ?? undefined} />
              <div className="flex flex-col gap-2">
                <span className="label-caps text-ink-2">Picture</span>
                <div
                  data-paste-zone
                  tabIndex={0}
                  role="group"
                  aria-label="Picture"
                  onPaste={onPaste}
                  className="flex min-h-24 flex-wrap items-center gap-3 rounded-card border border-dashed border-rule p-3 text-body text-ink-2 focus:border-ink focus:outline-none"
                >
                  {pictures.map((p, i) => (
                    <span key={i} className="relative">
                      <img src={p} alt={`Picture ${i + 1}`} className="h-20 rounded-card border border-rule object-cover" />
                      <button type="button" aria-label={`Remove picture ${i + 1}`} onClick={() => setPictures(pictures.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 inline-flex size-6 items-center justify-center rounded-pill border border-rule bg-sheet font-mono text-label text-ink">
                        x
                      </button>
                    </span>
                  ))}
                  {pictures.length < 3 && (
                    <span className="flex flex-wrap items-center gap-x-4">
                      <span>Print screen, click here and paste.</span>
                      <TextLink label="Attach a picture" icon="plus" onClick={() => fileInput.current?.click()} />
                    </span>
                  )}
                  <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" aria-label="Attach a picture" onChange={(e) => void addFiles(Array.from(e.target.files ?? []))} />
                </div>
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
