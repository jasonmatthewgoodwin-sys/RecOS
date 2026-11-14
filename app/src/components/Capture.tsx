import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { captureKinds, captureProblem, type CaptureKind } from '../lib/capture'
import { data } from '../lib/data'
import { invalidate } from '../lib/query'
import { orbClass } from '../lib/tone'
import { Card } from './Card'
import { Field } from './Field'
import { Icon } from './Icon'
import { PillButton } from './PillButton'
import { Note } from './Note'

// Quick capture (25.7): a small window in the centre of the sheet with
// five choices as pills. Each shows two or three fields and a Save button.
// Opened with the key c or the plus at the top right of the tabs.
export function Capture({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [kind, setKind] = useState<CaptureKind>('follow_up')
  const [values, setValues] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<{ key: string; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const def = captureKinds.find((k) => k.kind === kind)!

  async function save(e: FormEvent) {
    e.preventDefault()
    const p = captureProblem(kind, values)
    setProblem(p)
    if (p) return
    setBusy(true)
    try {
      const { route } = await data.capture(kind, values)
      invalidate('')
      onClose()
      if (route) navigate(route)
    } catch {
      setNote('That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card
        label="Quick capture"
        title="Add something"
        tone={def.tone}
        sections={[
          {
            body: (
              <div className="flex flex-wrap gap-2" role="group" aria-label="What">
                {captureKinds.map((k) => (
                  <button
                    key={k.kind}
                    type="button"
                    aria-current={k.kind === kind || undefined}
                    onClick={() => {
                      setKind(k.kind)
                      setValues({})
                      setProblem(null)
                    }}
                    className={`inline-flex h-11 items-center gap-2 rounded-pill border px-5 text-body ${k.kind === kind ? 'border-ink bg-ink text-sheet' : 'border-ink text-ink hover:bg-paper'}`}
                  >
                    <span aria-hidden className={`block size-2.5 rounded-pill ${orbClass[k.tone]}`} />
                    <Icon name={k.icon} size={14} />
                    {k.label}
                  </button>
                ))}
              </div>
            ),
          },
          {
            body: (
              <form onSubmit={(e) => void save(e)} className="flex flex-col gap-6" aria-label={`Add a ${def.label.toLowerCase()}`}>
                {def.fields.map((f) => (
                  <Field
                    key={f.key}
                    label={f.label}
                    kind={f.kind}
                    rows={2}
                    choices={f.choices}
                    placeholder={f.kind === 'choice' ? 'Choose' : f.placeholder}
                    value={values[f.key] ?? ''}
                    onChange={(v) => setValues({ ...values, [f.key]: v })}
                    error={problem?.key === f.key ? problem.message : undefined}
                    autoFocus={f === def.fields[0]}
                  />
                ))}
                <div>
                  <PillButton label="Save" kind="primary" type="submit" busy={busy} icon="check" />
                </div>
              </form>
            ),
          },
        ]}
        onClose={onClose}
      />
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </>
  )
}
