import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Field } from '../../components/Field'
import { Icon } from '../../components/Icon'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { Row } from '../../components/Row'
import { TextLink } from '../../components/TextLink'
import { DAY_NAMES, composerStates, copyOf, dayTitle, daysBetween, eventStates, eventTypeChoices, eventTypeWord, monthGrid, monthOf, monthTitle, postedInWeek, postsOn, readyDrafts, shiftMonth, splitCopy, stateWord } from '../../lib/calendar'
import { data, type ContentItem, type ContentPatch, type ContentStatus, type EventType } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'
import { mondayOf, ukClock } from '../../lib/time'
import { KEY } from './Drafts'

// Content, Calendar (the calendar handover of 14 November 2026 in the RecOS
// look; Jason: one calendar for posts and events, a month, not a week): two
// numbers, then a month grid, Monday to Sunday, today marked, the other
// months' days dimmed, a post or an event as a quiet chip on its day. A day
// opens a composer window over the sheet: a post or an event, the day, the
// state, Save; Bin with a confirm step; a guard on unsaved text. Events are
// Jason's own; nothing syncs from Outlook.

type Composer = { kind: 'day'; date: string } | { kind: 'post'; id: string }

const POSTS_A_WEEK = 2

export function Calendar() {
  const [params, setParams] = useSearchParams()
  const items = useQuery(KEY, data.contentItems)
  const today = ukClock(new Date()).date
  const thisMonday = mondayOf(new Date())
  const thisMonth = monthOf(today)
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? (params.get('month') as string) : thisMonth
  const all = items.data ?? []
  const [note, setNote] = useState<string | null>(null)

  const card = params.get('card')
  const composer: Composer | null = card?.startsWith('day:') ? { kind: 'day', date: card.slice(4) } : card?.startsWith('post:') ? { kind: 'post', id: card.slice(5) } : null
  const editing = composer?.kind === 'post' ? all.find((c) => c.id === composer.id) : undefined

  const tab = sections.find((s) => s.key === 'content')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))

  function setMonth(next: string) {
    setParams((p) => {
      if (next === thisMonth) p.delete('month')
      else p.set('month', next)
      p.delete('card')
      return p
    })
  }

  function openComposer(c: Composer | null) {
    setParams((p) => {
      if (c === null) p.delete('card')
      else p.set('card', c.kind === 'day' ? `day:${c.date}` : `post:${c.id}`)
      return p
    })
  }

  // The screen first, the server second (25.5).
  async function patch(c: ContentItem, change: ContentPatch) {
    const before = items.data
    setQueryData<ContentItem[]>(KEY, (rows) => (rows ?? []).map((r) => (r.id === c.id ? { ...r, ...change } : r)))
    try {
      await data.updateContent(c.id, change)
      invalidate('home')
    } catch {
      setQueryData<ContentItem[]>(KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  const ready = readyDrafts(all)
  const posted = postedInWeek(all, thisMonday)
  const dates = monthGrid(month)

  const body =
    items.status === 'loading' ? (
      <Dots />
    ) : items.status === 'error' ? (
      <EmptyLine text="Could not load. Try again." />
    ) : (
      <div className="flex flex-col gap-3" data-month={month}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="font-mono text-body text-ink">{monthTitle(month)}</h2>
          <p className="flex flex-wrap items-center gap-6">
            <TextLink label="Last month" onClick={() => setMonth(shiftMonth(month, -1))} />
            {month !== thisMonth && <TextLink label="This month" onClick={() => setMonth(thisMonth)} />}
            <TextLink label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} />
          </p>
        </div>
        <div className="grid grid-cols-7 border-l border-t border-rule" role="grid" aria-label={monthTitle(month)}>
          {DAY_NAMES.map((d) => (
            <div key={d} role="columnheader" className="label-caps border-b border-r border-rule px-2 py-1.5 font-mono text-ink-2">
              {d}
            </div>
          ))}
          {dates.map((date) => {
            const posts = postsOn(all, date)
            const inMonth = monthOf(date) === month
            const isToday = date === today
            return (
              <div key={date} role="gridcell" data-day={date} data-today={isToday || undefined} className={`flex min-h-20 flex-col gap-1 border-b border-r border-rule p-1.5 ${inMonth ? '' : 'bg-paper/50'}`}>
                <button
                  type="button"
                  aria-label={`Add a post on ${dayTitle(date)}`}
                  onClick={() => openComposer({ kind: 'day', date })}
                  className={`flex h-7 w-full items-center gap-1.5 rounded-pill px-1 text-left font-mono text-label hover:bg-paper ${isToday ? 'text-ink' : inMonth ? 'text-ink-2' : 'text-ink-3'}`}
                >
                  {isToday && <span aria-hidden className="block size-2 rounded-pill bg-ink" />}
                  {date.slice(8, 10)}
                </button>
                {posts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    data-row
                    data-kind={c.kind}
                    onClick={() => openComposer({ kind: 'post', id: c.id })}
                    title={`${c.hook ?? c.topic}. ${c.kind === 'event' ? (c.status === 'posted' ? 'Held' : 'Event') : stateWord[c.status]}`}
                    className={`flex min-h-7 w-full items-start gap-1.5 rounded-card px-1 text-left text-label hover:bg-paper ${c.status === 'posted' ? 'text-ink-3' : 'text-ink'}`}
                  >
                    {c.kind === 'event' ? (
                      <Icon name="calendar" size={11} className="mt-1 shrink-0" />
                    ) : (
                      <span aria-hidden data-dot={c.status === 'posted' ? 'solid' : 'hollow'} className={`mt-1.5 block size-2 shrink-0 rounded-pill border border-ink ${c.status === 'posted' ? 'bg-ink' : 'bg-transparent'}`} />
                    )}
                    <span className="line-clamp-2">
                      {c.kind === 'event' && c.eventTime ? `${c.eventTime} ` : ''}
                      {c.hook ?? c.topic}
                    </span>
                    <span className="sr-only">. {c.kind === 'event' ? (c.status === 'posted' ? 'Held' : 'Event') : stateWord[c.status]}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    )

  return (
    <div className="flex flex-col gap-8">
      {/* The calendar sits at the top; the two numbers are small, in the top right (Mia, 15 November 2026). */}
      <PageHeader
        title="Content"
        tabs={tabs}
        aside={
          <p className="flex items-baseline gap-6 font-mono text-label text-ink-2" aria-label="This month">
            <span>
              <span data-testid="hero-value" className="text-body text-ink tabular-nums">{posted}/{POSTS_A_WEEK}</span> this week
            </span>
            <span>
              <span data-testid="hero-value" className="text-body text-ink tabular-nums">{twoDigits(ready.length).text}</span> ready
            </span>
          </p>
        }
      />
      {body}
      {composer && (composer.kind === 'day' || editing) && (
        <ComposerCard
          key={card}
          date={composer.kind === 'day' ? composer.date : (editing && (editing.status === 'posted' ? editing.postedOn : editing.plannedFor)) || today}
          post={editing}
          ready={composer.kind === 'day' ? ready : []}
          today={today}
          onPlace={(draft, date) => {
            void patch(draft, { status: 'planned', plannedFor: date })
            openComposer(null)
          }}
          onClose={() => openComposer(null)}
          onSaved={() => {
            invalidate(KEY)
            openComposer(null)
          }}
        />
      )}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}

export type ComposerProps = {
  date: string
  post?: ContentItem
  ready: ContentItem[]
  today: string
  /** Start as an event rather than a post, with this name (from an event idea). */
  startAs?: { kind: 'event'; topic?: string }
  onPlace: (draft: ContentItem, date: string) => void
  onClose: () => void
  onSaved: (made?: ContentItem) => void
}

/** A whole number or nothing. */
function whole(text: string): number | null | 'bad' {
  const t = text.trim()
  if (t === '') return null
  return /^\d+$/.test(t) ? Number(t) : 'bad'
}

// The composer: a post or an event, create and edit in one window. On a
// phone it is the sheet.
export function ComposerCard({ date, post, ready, today, startAs, onPlace, onClose, onSaved }: ComposerProps) {
  const isEvent = post ? post.kind === 'event' : startAs?.kind === 'event'
  const initial = {
    day: date,
    copy: post ? (post.kind === 'event' ? (post.body ?? '') : copyOf(post)) : '',
    status: (post?.status ?? 'planned') as ContentStatus,
    name: post?.kind === 'event' ? post.topic : (startAs?.topic ?? ''),
    eventType: (post?.eventType ?? 'panel') as EventType,
    time: post?.eventTime ?? '',
  }
  const [kind, setKind] = useState<'linkedin_post' | 'event'>(isEvent ? 'event' : 'linkedin_post')
  const [day, setDay] = useState(initial.day)
  const [copy, setCopy] = useState(initial.copy)
  const [status, setStatus] = useState<ContentStatus>(initial.status)
  const [name, setName] = useState(initial.name)
  const [eventType, setEventType] = useState<EventType>(initial.eventType)
  const [time, setTime] = useState(initial.time)
  const [numbers, setNumbers] = useState({ impressions: post?.impressions?.toString() ?? '', comments: post?.comments?.toString() ?? '', messages: post?.inboundMessages?.toString() ?? '' })
  const [problem, setProblem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState<'bin' | 'discard' | null>(null)

  const dirty = copy !== initial.copy || day !== initial.day || status !== initial.status || name !== initial.name || eventType !== initial.eventType || time !== initial.time
  const askNumbers = kind === 'linkedin_post' && post?.status === 'posted' && post.postedOn !== null && daysBetween(post.postedOn, today) >= 7
  const stateChoices = kind === 'event' ? eventStates : composerStates.filter((s) => s.value !== 'draft' || !post || post.status === 'draft' || post.status === 'approved' || post.status === 'held')

  async function save() {
    if (kind === 'event' && name.trim() === '') {
      setProblem('Give the event a name.')
      return
    }
    if (kind === 'linkedin_post' && copy.trim() === '') {
      setProblem('Write the post first.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      setProblem('Pick a day.')
      return
    }
    if (kind === 'event' && time.trim() !== '' && !/^\d{2}:\d{2}$/.test(time.trim())) {
      setProblem('A time looks like 08:30.')
      return
    }
    const parsed = { impressions: whole(numbers.impressions), comments: whole(numbers.comments), messages: whole(numbers.messages) }
    if (Object.values(parsed).includes('bad')) {
      setProblem('Numbers are whole numbers.')
      return
    }
    setProblem(null)
    setBusy(true)
    setError(null)
    try {
      if (post) {
        const change: ContentPatch =
          kind === 'event'
            ? { topic: name.trim(), eventType, eventTime: time.trim() || null, body: copy.trim() || null, status, plannedFor: day }
            : { ...splitCopy(copy), status, plannedFor: day }
        if (status === 'posted') change.postedOn = post.postedOn ?? day
        if (askNumbers) Object.assign(change, { impressions: parsed.impressions as number | null, comments: parsed.comments as number | null, inboundMessages: parsed.messages as number | null })
        await data.updateContent(post.id, change)
        onSaved()
      } else {
        const made = await data.addContent(
          kind === 'event' ? { kind: 'event', copy: copy.trim(), topic: name.trim(), eventType, eventTime: time.trim() || null, plannedFor: day, status } : { kind: 'linkedin_post', copy, plannedFor: day, status },
        )
        onSaved(made)
      }
    } catch {
      setError('That did not save. Try again.')
      setBusy(false)
    }
  }

  async function bin() {
    if (!post) return
    setBusy(true)
    try {
      await data.updateContent(post.id, { status: 'binned' })
      onSaved()
    } catch {
      setError('That did not save. Try again.')
      setBusy(false)
      setAsking(null)
    }
  }

  const lines = Math.max(4, copy.split('\n').length + 1)
  const count = copy.length
  const label = post ? (kind === 'event' ? 'Event' : 'Post') : kind === 'event' ? 'New event' : 'New post'

  return (
    <Card
      label={label}
      title={dayTitle(day)}
      tone={status === 'posted' ? 'clear' : status === 'planned' ? 'pending' : 'new'}
      beforeClose={() => {
        if (!dirty || asking === 'discard') return true
        setAsking('discard')
        return false
      }}
      sections={[
        ...(!post
          ? [
              {
                body: (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="What">
                    {(['linkedin_post', 'event'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-current={k === kind || undefined}
                        onClick={() => {
                          setKind(k)
                          setProblem(null)
                        }}
                        className={`inline-flex h-10 items-center gap-2 rounded-pill border px-4 text-body ${k === kind ? 'border-ink bg-ink text-sheet' : 'border-ink text-ink hover:bg-paper'}`}
                      >
                        <Icon name={k === 'event' ? 'calendar' : 'pen'} size={14} />
                        {k === 'event' ? 'Event' : 'Post'}
                      </button>
                    ))}
                  </div>
                ),
              },
            ]
          : []),
        ...(!post && kind === 'linkedin_post' && ready.length > 0
          ? [
              {
                label: 'Ready to place here',
                body: (
                  <ul className="flex flex-col" aria-label="Ready drafts">
                    {ready.map((r) => (
                      <Row key={r.id} dot="hollow" title={r.hook ?? r.topic} word="Ready" onOpen={() => onPlace(r, day)} />
                    ))}
                  </ul>
                ),
              },
            ]
          : []),
        {
          body: (
            <form
              className="flex flex-col gap-5"
              aria-label={post ? (kind === 'event' ? 'Edit the event' : 'Edit the post') : kind === 'event' ? 'Add an event' : 'Write a post'}
              onSubmit={(e) => {
                e.preventDefault()
                void save()
              }}
            >
              {kind === 'event' ? (
                <>
                  <Field label="Name" value={name} onChange={setName} autoFocus={!post} placeholder="PMM breakfast on pricing pages" error={problem === 'Give the event a name.' ? problem : undefined} />
                  <div className="grid gap-5 sm:grid-cols-3">
                    <Field label="Type" kind="choice" value={eventType} onChange={(v) => setEventType(v as EventType)} choices={eventTypeChoices} />
                    <Field label="Day" kind="date" value={day} onChange={setDay} error={problem === 'Pick a day.' ? problem : undefined} />
                    <Field label="Time" value={time} onChange={setTime} placeholder="08:30" error={problem === 'A time looks like 08:30.' ? problem : undefined} />
                  </div>
                  <Field label="Notes" kind="lines" rows={3} value={copy} onChange={setCopy} placeholder="Where, who, what to prepare" />
                  <Field label="State" kind="choice" value={status} onChange={(v) => setStatus(v as ContentStatus)} choices={stateChoices} />
                </>
              ) : (
                <>
                  <Field label="Day" kind="date" value={day} onChange={setDay} error={problem === 'Pick a day.' ? problem : undefined} />
                  <div className="flex flex-col gap-1">
                    <Field label="Post" kind="lines" rows={Math.min(lines, 12)} value={copy} onChange={setCopy} placeholder="The hook on its own line, then the post" autoFocus={!post} error={problem === 'Write the post first.' ? problem : undefined} />
                    <p className="font-mono text-label text-ink-3" aria-live="polite">
                      {count} characters
                    </p>
                  </div>
                  <Field label="State" kind="choice" value={status} onChange={(v) => setStatus(v as ContentStatus)} choices={stateChoices} />
                </>
              )}
              {askNumbers && (
                <fieldset className="flex flex-col gap-4">
                  <legend className="label-caps mb-2 text-ink-2">Numbers, a week on</legend>
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="Impressions" value={numbers.impressions} onChange={(v) => setNumbers({ ...numbers, impressions: v })} />
                    <Field label="Comments" value={numbers.comments} onChange={(v) => setNumbers({ ...numbers, comments: v })} />
                    <Field label="Messages" value={numbers.messages} onChange={(v) => setNumbers({ ...numbers, messages: v })} error={problem === 'Numbers are whole numbers.' ? problem : undefined} />
                  </div>
                </fieldset>
              )}
              {error && <p className="text-body text-ink-2">{error}</p>}
            </form>
          ),
        },
        ...(asking === 'bin'
          ? [
              {
                body: (
                  <div className="flex flex-wrap items-center gap-6" role="group" aria-label={kind === 'event' ? 'Bin this event?' : 'Bin this post?'}>
                    <p className="text-body text-ink">{kind === 'event' ? 'Bin this event?' : 'Bin this post?'}</p>
                    <PillButton label="Bin it" onClick={() => void bin()} busy={busy} icon="bin" />
                    <TextLink label="Keep it" onClick={() => setAsking(null)} />
                  </div>
                ),
              },
            ]
          : []),
        ...(asking === 'discard'
          ? [
              {
                body: (
                  <div className="flex flex-wrap items-center gap-6" role="group" aria-label="Discard what you wrote?">
                    <p className="text-body text-ink">Discard what you wrote?</p>
                    <PillButton label="Discard" onClick={onClose} />
                    <TextLink label="Keep writing" onClick={() => setAsking(null)} />
                  </div>
                ),
              },
            ]
          : []),
      ]}
      primaryAction={{ label: 'Save', onClick: () => void save(), busy }}
      links={
        <>
          <TextLink label="Cancel" onClick={() => (dirty ? setAsking('discard') : onClose())} />
          {post && <TextLink label="Bin" onClick={() => setAsking('bin')} icon="bin" />}
          {kind === 'event' && post && <span className="font-mono text-label text-ink-3">{eventTypeWord[eventType]}</span>}
        </>
      }
      onClose={onClose}
    />
  )
}
