import { useState, type ReactNode } from 'react'
import { Card } from '../../components/Card'
import { Draft } from '../../components/Draft'
import { Field } from '../../components/Field'
import { PillButton } from '../../components/PillButton'
import { TextLink } from '../../components/TextLink'
import type { Search } from '../../lib/data'
import { binReasons, dueWord, primaryLabel, shownTitle, snoozeChoices, status, statusWord, typeWord, type Task, type TaskEdits } from '../../lib/tasks'

export type CardMode = 'view' | 'edit' | 'bin' | 'snooze'

type Props = {
  task: Task
  today: string
  searches: Search[]
  mode: CardMode
  onMode: (mode: CardMode) => void
  onComplete: (detail?: { searchId?: string }) => void
  onBin: (reason: string) => void
  onSnooze: (until: string) => void
  onEdits: (edits: Partial<TaskEdits>) => void
  onDraft: (body: string, subject: string | null) => void
  onSend: () => void
  onOutlook: () => void
  onClose: () => void
  busy?: boolean
}

const agentWord: Record<string, string> = {
  jobs: 'the jobs agent',
  signals: 'the signals agent',
  content: 'the content agent',
  events: 'the events agent',
  follow_ups: 'the follow-up sweep',
  call_to_crm: 'the call write-up',
  rules: 'a standing rule',
  weekly_review: 'the weekly review',
}

/** The body of a task, shared by the card and the deck. */
export function TaskBody({
  task,
  searches,
  searchId,
  onSearch,
  draft,
  subject,
  onDraft,
  notes,
}: {
  task: Task
  searches: Search[]
  searchId: string
  onSearch: (id: string) => void
  draft: string
  subject: string
  onDraft: (body: string, subject: string) => void
  notes?: ReactNode
}) {
  const needsSearch = task.kind === 'call_confirm' || task.kind === 'call_writeup'
  return (
    <div className="flex flex-col gap-6">
      {task.why && <p className="text-body text-ink">{task.why}</p>}
      {notes}
      {task.waitingOn && (
        <p className="text-body text-ink-2">
          <span className="label-caps mr-3 text-ink-2">Waiting on</span>
          {task.waitingOn}
        </p>
      )}
      {task.links.length > 0 && (
        <ul className="flex flex-wrap gap-x-6">
          {task.links.map((l) => (
            <li key={l.url}>
              <TextLink label={l.label} href={l.url} />
            </li>
          ))}
        </ul>
      )}
      {needsSearch && (
        <Field
          label="Search"
          kind="choice"
          value={searchId}
          onChange={onSearch}
          placeholder="Which search was this for"
          choices={searches.map((s) => ({ value: s.id, label: `${s.client}, ${s.role}` }))}
        />
      )}
      {task.draft !== null && (
        <div className="flex flex-col gap-4">
          {task.channel === 'email' && <Field label="Subject" value={subject} onChange={(v) => onDraft(draft, v)} />}
          <Draft
            label={task.channel === 'email' ? 'Email' : task.channel === 'linkedin' ? 'Message' : 'Draft'}
            text={draft}
            original={task.draftOriginal ?? undefined}
            onChange={(t) => onDraft(t, subject)}
          />
        </div>
      )}
    </div>
  )
}

// The task card (right half of the sheet): the agent's words, the owner's
// edits beside them, the context links, the draft with its two ways out,
// one primary action and the quiet links.
export function TaskCard({ task, today, searches, mode, onMode, onComplete, onBin, onSnooze, onEdits, onDraft, onSend, onOutlook, onClose, busy }: Props) {
  const [title, setTitle] = useState(task.edits.title ?? task.title)
  const [notes, setNotes] = useState(task.edits.notes ?? '')
  const [due, setDue] = useState(task.edits.dueOn ?? task.dueOn ?? '')
  const [draft, setDraft] = useState(task.draft ?? '')
  const [subject, setSubject] = useState(task.subject ?? '')
  const [searchId, setSearchId] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const st = status(task, today)
  const needsSearch = task.kind === 'call_confirm' || task.kind === 'call_writeup'
  const email = task.channel === 'email' && task.messageId !== null
  const primary = primaryLabel(task)

  function complete() {
    if (needsSearch && !searchId) {
      setProblem('Choose the search first')
      return
    }
    if (primary === 'Send') {
      onSend()
      return
    }
    onComplete(needsSearch ? { searchId } : undefined)
  }

  function saveEdits() {
    onEdits({
      title: title.trim() === task.title || title.trim() === '' ? null : title.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
      dueOn: due === '' || due === task.dueOn ? null : due,
    })
    onMode('view')
  }

  function changeDraft(body: string, subj: string) {
    setDraft(body)
    setSubject(subj)
    setCopied(false)
    onDraft(body, task.channel === 'email' ? subj : null)
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const sections = [
    {
      body: (
        <p className="flex flex-wrap items-baseline gap-x-4 text-ink-2">
          <span className="label-caps">{statusWord[st]}</span>
          {st !== 'today' && dueWord(task, today) && <span className="font-mono text-label">{dueWord(task, today)}</span>}
          {task.company && <span>{task.company}</span>}
        </p>
      ),
    },
    ...(mode === 'edit'
      ? [
          {
            label: 'Your words',
            body: (
              <div className="flex flex-col gap-4">
                <Field label="Title" value={title} onChange={setTitle} autoFocus />
                <Field label="Due" kind="date" value={due} onChange={setDue} />
                <Field label="Notes" value={notes} onChange={setNotes} placeholder="Anything to remember" />
                <div className="flex items-center gap-6">
                  <PillButton label="Save" onClick={saveEdits} />
                  <TextLink label="Leave it" onClick={() => onMode('view')} />
                </div>
              </div>
            ),
          },
        ]
      : []),
    {
      body: (
        <TaskBody
          task={task}
          searches={searches}
          searchId={searchId}
          onSearch={(id) => {
            setSearchId(id)
            setProblem(null)
          }}
          draft={draft}
          subject={subject}
          onDraft={changeDraft}
          notes={
            task.edits.notes && mode !== 'edit' ? (
              <p className="text-body text-ink">
                <span className="label-caps mr-3 text-ink-2">Notes</span>
                {task.edits.notes}
              </p>
            ) : undefined
          }
        />
      ),
    },
    ...(mode === 'bin'
      ? [
          {
            label: 'Why',
            body: (
              <div className="flex flex-wrap gap-3">
                {[...binReasons(task.kind), 'Other'].map((r) => (
                  <PillButton key={r} label={r} onClick={() => onBin(r)} />
                ))}
                <TextLink label="Keep it" onClick={() => onMode('view')} />
              </div>
            ),
          },
        ]
      : []),
    ...(mode === 'snooze'
      ? [
          {
            label: 'Until',
            body: (
              <div className="flex flex-wrap gap-3">
                {snoozeChoices(today).map((c) => (
                  <PillButton key={c.until} label={c.label} onClick={() => onSnooze(c.until)} />
                ))}
                <TextLink label="Keep it" onClick={() => onMode('view')} />
              </div>
            ),
          },
        ]
      : []),
    ...(problem ? [{ body: <p className="text-ink-2">{problem}</p> }] : []),
  ]

  return (
    <Card
      label={typeWord[task.kind]}
      title={shownTitle(task)}
      sections={sections}
      primaryAction={{ label: primary, onClick: complete, busy }}
      links={
        <>
          {email && <TextLink label="Open in Outlook" onClick={onOutlook} />}
          {task.draft !== null && <TextLink label={copied ? 'Copied' : 'Copy'} onClick={copyDraft} />}
          {mode !== 'edit' && <TextLink label="Edit" onClick={() => onMode('edit')} />}
          {mode !== 'snooze' && <TextLink label="Snooze" onClick={() => onMode('snooze')} />}
          {mode !== 'bin' && <TextLink label="Bin" onClick={() => onMode('bin')} />}
        </>
      }
      foot={task.agent ? `Raised by ${agentWord[task.agent] ?? task.agent}` : undefined}
      onClose={onClose}
    />
  )
}
