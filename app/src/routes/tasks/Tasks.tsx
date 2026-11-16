import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Board } from '../../components/Board'
import { Deck } from '../../components/Deck'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { TextLink } from '../../components/TextLink'
import { data, type Search } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import {
  binReasons,
  columns,
  filters,
  primaryLabel,
  refreshLine,
  shownTitle,
  snoozeChoices,
  typeWord,
  type Column,
  type Task,
  type TaskEdits,
  type TaskFilter,
} from '../../lib/tasks'
import { sourceLabel } from '../../lib/links'
import { ukClock } from '../../lib/time'
import { TaskBody, TaskCard, type CardMode } from './TaskCard'

// Tasks: everything the owner has to do, drawn from every source, on a board
// of Now, This week, Later and Waiting. One Start button works the Now column
// as a deck. A card opens a task over the right half of the sheet.

const TASKS_KEY = 'tasks.all'
const SEARCHES_KEY = 'tasks.searches'

type Props = {
  /** Show one kind only: the Follow-ups page under Leads is this board filtered. */
  only?: Task['kind']
  title?: string
}

function isFilter(v: string | null): v is TaskFilter {
  return filters.some((f) => f.value === v)
}

export function Tasks({ only, title = 'Tasks' }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [today] = useState(() => ukClock(new Date()).date)

  const tasks = useQuery(TASKS_KEY, data.tasks)
  const searches = useQuery(SEARCHES_KEY, data.searches)

  const filter: TaskFilter = isFilter(params.get('show')) ? (params.get('show') as TaskFilter) : 'all'
  const view = params.get('view') === 'deck' ? 'deck' : 'board'
  const cardKey = params.get('card')?.startsWith('task:') ? params.get('card')!.slice(5) : null
  const [mode, setMode] = useState<CardMode>('view')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const all = useMemo(() => (tasks.data ?? []).filter((t) => !only || t.kind === only), [tasks.data, only])
  const cols = useMemo(() => columns(all, today), [all, today])
  const shownCols: Column[] =
    filter === 'all' ? cols.filter((c) => c.key !== 'later') : cols.filter((c) => c.key === filter)
  const later = cols.find((c) => c.key === 'later')!
  const nowCount = cols[0].tasks.length
  const waitingCount = cols[3].tasks.length
  const card = cardKey ? all.find((t) => t.key === cardKey) : undefined
  const searchRefs: Search[] = searches.data ?? []

  function setParam(key: string, value: string | null, options?: { state?: unknown; replace?: boolean }) {
    setParams(
      (p) => {
        if (value === null) p.delete(key)
        else p.set(key, value)
        return p
      },
      options,
    )
  }

  function openCard(task: Task) {
    setMode('view')
    setParam('card', `task:${task.key}`, { state: { card: true } })
  }

  function closeCard() {
    setMode('view')
    if ((location.state as { card?: boolean } | null)?.card) {
      navigate(-1)
      return
    }
    setParam('card', null, { replace: true })
  }

  // The screen first, the server second. A failed write puts things back and
  // says so once (25.5).
  async function act(change: (rows: Task[]) => Task[], write: () => Promise<void>, failText: string) {
    const before = tasks.data
    setQueryData<Task[]>(TASKS_KEY, (rows) => change(rows ?? []))
    try {
      await write()
      invalidate('home.')
    } catch {
      setQueryData<Task[]>(TASKS_KEY, () => before ?? [])
      setNote(failText)
    }
  }

  const remove = (task: Task) => (rows: Task[]) => rows.filter((t) => t.key !== task.key)
  const putBack = (task: Task) => (rows: Task[]) => (rows.some((t) => t.key === task.key) ? rows : [...rows, task])

  const complete = (task: Task, detail?: { searchId?: string }) =>
    act(remove(task), () => data.completeTask(task, detail), 'Could not save that. Try again.')
  const bin = (task: Task, reason: string) => act(remove(task), () => data.binTask(task, reason), 'Could not bin that. Try again.')
  const snooze = (task: Task, until: string) => act(remove(task), () => data.snoozeTask(task, until), 'Could not snooze that. Try again.')
  const reopen = (task: Task) => act(putBack(task), () => data.reopenTask(task), 'Could not put that back. Try again.')

  const saveEdits = (task: Task, edits: Partial<TaskEdits>) =>
    act(
      (rows) => rows.map((t) => (t.key === task.key ? { ...t, edits: { ...t.edits, ...edits } } : t)),
      () => data.saveTaskEdits(task, edits),
      'Could not save your words. Try again.',
    )

  const saveDraft = (task: Task, body: string, subject: string | null) =>
    act(
      (rows) => rows.map((t) => (t.key === task.key ? { ...t, draft: body, subject: subject ?? t.subject } : t)),
      () => data.saveDraft(task, body, subject),
      'Could not save the draft. Try again.',
    )

  const reorder = useCallback(
    (_column: Column['key'], keys: string[]) => {
      const order = new Map(keys.map((k, i) => [k, i + 1]))
      setQueryData<Task[]>(TASKS_KEY, (rows) =>
        (rows ?? []).map((t) => (order.has(t.key) ? { ...t, edits: { ...t.edits, sortOrder: order.get(t.key)! } } : t)),
      )
      data.reorderTasks(keys).catch(() => setNote('Could not keep that order. Try again.'))
    },
    [],
  )

  async function send(task: Task) {
    setBusy(true)
    try {
      const answer = await data.sendTask(task)
      setQueryData<Task[]>(TASKS_KEY, (rows) => (rows ?? []).filter((t) => t.key !== task.key))
      setNote(answer)
      if (card?.key === task.key) closeCard()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not send. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function outlook(task: Task, body?: string, subject?: string) {
    setBusy(true)
    try {
      let t = task
      if (!t.messageId && body) {
        // The agent left no draft: the start on the card becomes the message, so Outlook has something to open.
        const messageId = await data.createTaskDraft(task, subject ?? '', body)
        t = { ...task, messageId, channel: 'email', draft: body, subject: subject ?? null, draftOriginal: body }
        setQueryData<Task[]>(TASKS_KEY, (rows) => (rows ?? []).map((x) => (x.key === task.key ? t : x)))
      }
      const url = await data.openInOutlook(t)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not open Outlook. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // Enter on a focused card opens it; x bins it; s snoozes until tomorrow.
  useEffect(() => {
    if (view === 'deck' || cardKey) return
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement
      const key = target.closest?.<HTMLElement>('[data-task]')?.dataset.task
      if (!key) return
      const task = all.find((t) => t.key === key)
      if (!task) return
      if (e.key === 'x') {
        setMode('bin')
        setParam('card', `task:${task.key}`, { state: { card: true } })
      }
      if (e.key === 's') snooze(task, snoozeChoices(today)[0].until)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // The deck is built once from the Now column when the view opens (INBX-1).
  const [deckItems, setDeckItems] = useState<(Task & { id: string })[] | null>(null)
  useEffect(() => {
    if (view !== 'deck') {
      setDeckItems(null)
      return
    }
    if (deckItems === null && tasks.status === 'ready') setDeckItems(cols[0].tasks.map((t) => ({ ...t, id: t.key })))
  }, [view, tasks.status, cols, deckItems])

  const [deckDrafts, setDeckDrafts] = useState<Record<string, { body: string; subject: string }>>({})
  const [deckSearch, setDeckSearch] = useState<Record<string, string>>({})

  const needsYou = tasks.data === undefined ? undefined : twoDigits(nowCount)
  const waiting = tasks.data === undefined ? undefined : twoDigits(waitingCount)

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={title} />

      <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:flex md:gap-x-16">
        <HeroStat label="Now" value={needsYou?.text} plus={needsYou?.plus} onClick={() => setParam('show', 'now')} />
        <HeroStat label="Waiting" value={waiting?.text} plus={waiting?.plus} onClick={() => setParam('show', 'waiting')} />
      </div>

      {view === 'deck' ? (
        <div className="flex flex-col gap-4">
          {deckItems === null ? null : (
            <Deck
              items={deckItems}
              renderItem={(task) => (
                <div className="flex flex-col gap-4">
                  <p className="label-caps text-ink-2">{typeWord[task.kind]}</p>
                  <h3 className="text-title text-ink">{shownTitle(task)}</h3>
                  <TaskBody
                    task={task}
                    searches={searchRefs}
                    searchId={deckSearch[task.key] ?? ''}
                    onSearch={(id) => setDeckSearch({ ...deckSearch, [task.key]: id })}
                    draft={deckDrafts[task.key]?.body ?? task.draft ?? ''}
                    subject={deckDrafts[task.key]?.subject ?? task.subject ?? ''}
                    onDraft={(body, subject) => {
                      setDeckDrafts({ ...deckDrafts, [task.key]: { body, subject } })
                      saveDraft(task, body, task.channel === 'email' ? subject : null)
                    }}
                  />
                </div>
              )}
              primaryAction={{
                label: primaryLabel,
                onClick: (task) => {
                  if (primaryLabel(task) === 'Send') send(task)
                  else complete(task, deckSearch[task.key] ? { searchId: deckSearch[task.key] } : undefined)
                },
              }}
              onBin={(task) => bin(task, binReasons(task.kind)[0])}
              onSnooze={(task) => snooze(task, snoozeChoices(today)[0].until)}
              onUndo={(task) => reopen(task)}
              links={(task) => (
                <>
                  {task.sourceUrl && <TextLink label={sourceLabel(task.sourceUrl)} href={task.sourceUrl} />}
                  {task.channel === 'email' && task.messageId ? <TextLink label="Open in Outlook" onClick={() => outlook(task)} /> : null}
                </>
              )}
              onList={() => setParam('view', null)}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <nav aria-label="Show" className="flex flex-wrap gap-x-6">
              {filters.map((f) => (
                <TextLink key={f.value} label={f.label} active={f.value === filter} onClick={() => setParam('show', f.value === 'all' ? null : f.value)} />
              ))}
            </nav>
            {nowCount > 0 && !card && <PillButton kind="primary" label="Start" onClick={() => setParam('view', 'deck')} />}
          </div>
          <Board columns={shownCols} today={today} state={tasks.status} onOpen={openCard} onReorder={reorder} />
          {filter === 'all' && later.tasks.length > 0 && tasks.status === 'ready' && (
            <div>
              <TextLink label={`Later, ${later.tasks.length}`} onClick={() => setParam('show', 'later')} />
            </div>
          )}
        </div>
      )}

      {tasks.status === 'ready' && (
        <div className="flex flex-wrap items-center gap-x-6">
          <p className="font-mono text-label text-ink-3">{refreshLine}</p>
          {!only && (
            <TextLink
              label="Write up now"
              onClick={() =>
                data
                  .requestRun('a6_calls')
                  .then(() => setNote('The call agent picks this up at its next check'))
                  .catch(() => setNote('Could not ask for a write-up. Try again.'))
              }
            />
          )}
        </div>
      )}

      {card && (
        <TaskCard
          key={card.key}
          task={card}
          today={today}
          searches={searchRefs}
          mode={mode}
          onMode={setMode}
          busy={busy}
          onComplete={(detail) => {
            complete(card, detail)
            closeCard()
          }}
          onBin={(reason) => {
            bin(card, reason)
            closeCard()
          }}
          onSnooze={(until) => {
            snooze(card, until)
            closeCard()
          }}
          onEdits={(edits) => saveEdits(card, edits)}
          onDraft={(body, subject) => saveDraft(card, body, subject)}
          onSend={() => send(card)}
          onOutlook={(body, subject) => outlook(card, body, subject)}
          onClose={closeCard}
        />
      )}

      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
