import { Fragment, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Field } from '../../components/Field'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { RowList } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { data, type Problem, type ProblemPatch, type ProblemSeverity, type ProblemStatus } from '../../lib/data'
import { contextLines, isOpen, problemTone, queueOf, refOf, severityChoices, severityWord, snippet, statusChoices, statusWord } from '../../lib/problems'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { settings } from '../../lib/sections'

// Settings, Problems (the bug handover of 14 November 2026, in RecOS terms):
// the queue of reports, open ones by default, newest first, worst first on
// request. A row opens a window with the report, what the app captured, the
// state, who has it, a resolution and working notes. Nothing is sent.

export const KEY = 'settings.problems'

function when(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

export function Problems({ me }: { me: string | null }) {
  const [params, setParams] = useSearchParams()
  const items = useQuery(KEY, data.problems)
  const showClosed = params.get('closed') === '1'
  const sort = params.get('sort') === 'severity' ? 'severity' : 'date'
  const cardId = params.get('card')?.startsWith('problem:') ? params.get('card')!.slice(8) : null
  const [note, setNote] = useState<string | null>(null)
  const all = items.data ?? []
  const open = cardId ? all.find((p) => p.id === cardId) : undefined

  const tabs = settings.pages.map((p) => ({ label: p.label, route: `${settings.path}/${p.slug}` }))

  function setParam(key: string, value: string | null) {
    setParams((p) => {
      if (value === null) p.delete(key)
      else p.set(key, value)
      return p
    })
  }

  async function patch(p: Problem, change: ProblemPatch) {
    const before = items.data
    setQueryData<Problem[]>(KEY, (rows) => (rows ?? []).map((r) => (r.id === p.id ? { ...r, ...change } : r)))
    try {
      await data.updateProblem(p.id, change)
      invalidate(KEY)
    } catch {
      setQueryData<Problem[]>(KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  const queue = queueOf(all, { showClosed, sort })
  const rows = queue.map((p) => ({
    id: p.id,
    dot: isOpen(p) ? ('hollow' as const) : ('solid' as const),
    done: !isOpen(p),
    title: `${refOf(p)}  ${snippet(p)}`,
    detail: [p.reporterName, when(p.createdAt)].filter(Boolean).join(', '),
    word: statusWord[p.status],
    detailWord: severityWord[p.severity],
    tone: problemTone(p),
    icon: 'flag' as const,
    onOpen: () => setParam('card', `problem:${p.id}`),
  }))

  const closedCount = all.length - all.filter(isOpen).length

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Settings" tabs={tabs} />
      <div className="flex flex-wrap items-center gap-6">
        <p className="text-body text-ink">
          {all.filter(isOpen).length === 0 ? 'Nothing open.' : `${all.filter(isOpen).length} open.`}
          {closedCount > 0 && ` ${closedCount} closed.`}
        </p>
        <TextLink label={sort === 'severity' ? 'Newest first' : 'Worst first'} onClick={() => setParam('sort', sort === 'severity' ? null : 'severity')} />
        {closedCount > 0 && <TextLink label={showClosed ? 'Hide closed' : 'Show closed'} onClick={() => setParam('closed', showClosed ? null : '1')} />}
      </div>
      {items.status === 'loading' ? <Dots /> : items.status === 'error' ? <EmptyLine text="Could not load. Try again." /> : <RowList rows={rows} view="rows" emptyText="Nothing open" />}
      {open && <ProblemCard problem={open} me={me} onPatch={(change) => void patch(open, change)} onClose={() => setParam('card', null)} />}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}

function ProblemCard({ problem: p, me, onPatch, onClose }: { problem: Problem; me: string | null; onPatch: (change: ProblemPatch) => void; onClose: () => void }) {
  const notes = useQuery(`${KEY}.notes.${p.id}`, () => data.problemNotes(p.id))
  const shots = useQuery(`${KEY}.shots.${p.id}`, () => data.problemScreenshots(p.id))
  const [status, setStatus] = useState<ProblemStatus>(p.status)
  const [severity, setSeverity] = useState<ProblemSeverity>(p.severity)
  const [assignee, setAssignee] = useState(p.assignee ?? '')
  const [resolution, setResolution] = useState(p.resolution ?? '')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const dirty = status !== p.status || severity !== p.severity || assignee !== (p.assignee ?? '') || resolution !== (p.resolution ?? '')

  function save(over: ProblemPatch = {}) {
    const change: ProblemPatch = { status, severity, assignee: assignee.trim() || null, resolution: resolution.trim() || null, ...over }
    if (over.status) setStatus(over.status)
    onPatch(change)
  }

  async function addNote() {
    if (text.trim() === '') return
    setBusy(true)
    try {
      await data.addProblemNote(p.id, text.trim(), me)
      setText('')
      invalidate(`${KEY}.notes.${p.id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      label={`${severityWord[p.severity]}, ${statusWord[p.status].toLowerCase()}`}
      title={`${refOf(p)}  ${p.title ?? snippet(p)}`}
      tone={problemTone(p)}
      sections={[
        {
          body: (
            <div className="flex flex-col gap-3">
              <p className="whitespace-pre-wrap">{p.description}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 font-mono text-label text-ink-3">
                <dt>Raised</dt>
                <dd>
                  {when(p.createdAt)}
                  {p.reporterName ? ` by ${p.reporterName}` : ''}
                </dd>
                {contextLines(p).map(([k, v]) => (
                  <Fragment key={k}>
                    <dt>{k}</dt>
                    <dd className="truncate">{v}</dd>
                  </Fragment>
                ))}
                {p.resolvedAt && (
                  <>
                    <dt>Resolved</dt>
                    <dd>{when(p.resolvedAt)}</dd>
                  </>
                )}
              </dl>
            </div>
          ),
        },
        {
          label: 'Work it',
          body: (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="State" kind="choice" value={status} onChange={(v) => setStatus(v as ProblemStatus)} choices={statusChoices} />
                <Field label="How bad" kind="choice" value={severity} onChange={(v) => setSeverity(v as ProblemSeverity)} choices={severityChoices} />
              </div>
              <Field label="Who has it" value={assignee} onChange={setAssignee} placeholder="A first name" />
              <Field label="Resolution" kind="lines" rows={2} value={resolution} onChange={setResolution} placeholder="What was done, in a line" />
            </div>
          ),
        },
        ...((shots.data ?? []).length > 0
          ? [
              {
                label: 'Pictures',
                body: (
                  <ul className="flex flex-wrap gap-3" aria-label="Pictures">
                    {(shots.data ?? []).map((s, i) => (
                      <li key={s.id}>
                        <a href={s.data} target="_blank" rel="noopener">
                          <img src={s.data} alt={`Picture ${i + 1}`} className="max-h-64 rounded-card border border-rule" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ),
              },
            ]
          : []),
        {
          label: 'Notes',
          body: (
            <div className="flex flex-col gap-3">
              {notes.status === 'loading' ? (
                <Dots />
              ) : (notes.data ?? []).length === 0 ? (
                <p className="text-ink-3">No notes yet.</p>
              ) : (
                <ul className="flex flex-col gap-2" aria-label="Notes">
                  {(notes.data ?? []).map((n) => (
                    <li key={n.id} className="flex flex-col">
                      <span className="whitespace-pre-wrap">{n.body}</span>
                      <span className="font-mono text-label text-ink-3">
                        {n.author ?? 'Someone'}, {when(n.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <form
                className="flex items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void addNote()
                }}
              >
                <div className="flex-1">
                  <Field label="Add a note" value={text} onChange={setText} placeholder="What you found" />
                </div>
                <PillButton label="Add" type="submit" busy={busy} />
              </form>
            </div>
          ),
        },
      ]}
      primaryAction={{ label: dirty ? 'Save' : 'Saved', onClick: () => save() }}
      links={
        <>
          {isOpen(p) && <TextLink label="Resolve" icon="check" onClick={() => save({ status: 'resolved' })} />}
          {p.status === 'resolved' && <TextLink label="Close" onClick={() => save({ status: 'closed' })} />}
          {!isOpen(p) && <TextLink label="Reopen" onClick={() => save({ status: 'new' })} />}
          <TextLink label="Done" onClick={onClose} />
        </>
      }
      onClose={onClose}
    />
  )
}

