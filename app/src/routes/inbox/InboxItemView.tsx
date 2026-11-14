import { useState, type FormEvent } from 'react'
import { Draft } from '../../components/Draft'
import { Field } from '../../components/Field'
import { PillButton } from '../../components/PillButton'
import { TextLink } from '../../components/TextLink'
import type { InboxItem } from '../../lib/data'
import { approveChoices, typeWord, type Choice } from '../../lib/inbox'
import type { UkClock } from '../../lib/time'

type ViewProps = {
  item: InboxItem
  draft: string
  onDraft: (text: string) => void
  /** In the deck the title is large; on the card the Card draws it. */
  heading?: boolean
}

// One inbox item (27.2): the type word, the title, why it matters and the
// draft. Shared by the deck and the card so the two never drift apart.
export function InboxItemView({ item, draft, onDraft, heading = true }: ViewProps) {
  const where = [item.company, item.location].filter(Boolean).join(', ')
  return (
    <div className="flex flex-col gap-4">
      {heading && <p className="label-caps text-ink-2">{typeWord[item.type]}</p>}
      {heading && <h2 className="text-title text-ink">{item.title}</h2>}
      {where && <p className="text-body text-ink-2">{where}</p>}
      {item.why && <p className="max-w-prose text-body text-ink">{item.why}</p>}
      {item.draft !== null && (
        <div className="max-w-prose">
          <Draft text={draft} original={item.draftOriginal ?? item.draft} onChange={onDraft} />
        </div>
      )}
    </div>
  )
}

type PassProps = { onConfirm: (colleague: string, split: string) => void; onCancel: () => void }

/** Pass on asks two things, the colleague and the split, before the draft (27.2, WID-2). */
export function PassStep({ onConfirm, onCancel }: PassProps) {
  const [colleague, setColleague] = useState('')
  const [split, setSplit] = useState('')
  const [problem, setProblem] = useState<{ who?: string; split?: string }>({})

  function submit(e: FormEvent) {
    e.preventDefault()
    const next: { who?: string; split?: string } = {}
    if (!colleague.trim()) next.who = "Add the colleague's name"
    if (!split.trim()) next.split = 'Agree the split first'
    setProblem(next)
    if (next.who || next.split) return
    onConfirm(colleague.trim(), split.trim())
  }

  return (
    <form onSubmit={submit} className="flex max-w-sm flex-col gap-6" aria-label="Pass on">
      <Field label="Colleague" value={colleague} onChange={setColleague} placeholder="Who takes it" error={problem.who} autoFocus />
      <Field label="Split" value={split} onChange={setSplit} placeholder="How the fee is shared" error={problem.split} />
      <div className="flex items-center gap-6">
        <PillButton kind="primary" type="submit" label="Pass on" />
        <TextLink label="Back" onClick={onCancel} />
      </div>
    </form>
  )
}

type ApproveProps = { clock: UkClock; onConfirm: (on: string) => void; onCancel: () => void }

/** Approve asks for a day: tomorrow, the next free day, or one picked (27.2). */
export function ApproveStep({ clock, onConfirm, onCancel }: ApproveProps) {
  const choices: Choice[] = approveChoices(clock)
  const [picked, setPicked] = useState('')
  const [picking, setPicking] = useState(false)
  return (
    <div className="flex flex-col gap-4" role="group" aria-label="For when">
      <p className="label-caps text-ink-2">For when</p>
      <div className="flex flex-wrap items-center gap-x-6">
        {choices.map((c) => (
          <TextLink key={c.label} label={c.label} onClick={() => onConfirm(c.value)} />
        ))}
        <TextLink label="Pick a day" onClick={() => setPicking(true)} active={picking} />
        <TextLink label="Back" onClick={onCancel} />
      </div>
      {picking && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (picked) onConfirm(picked)
          }}
          className="flex max-w-sm flex-col gap-4"
        >
          <Field label="Day" kind="date" value={picked} onChange={setPicked} autoFocus />
          <div>
            <PillButton kind="primary" type="submit" label="Approve" disabled={!picked} />
          </div>
        </form>
      )}
    </div>
  )
}
