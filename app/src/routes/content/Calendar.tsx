import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Field } from '../../components/Field'
import { HeroStat } from '../../components/HeroStat'
import { Icon } from '../../components/Icon'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { Row } from '../../components/Row'
import { TextLink } from '../../components/TextLink'
import { composerStates, copyOf, dayLabel, dayTitle, daysBetween, postedInWeek, postsOn, readyDrafts, splitCopy, stateWord, visibleDays, weekDates } from '../../lib/calendar'
import { data, type ContentItem, type ContentPatch, type ContentStatus } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'
import { mondayOf, shiftDate, ukClock } from '../../lib/time'
import { KEY } from './Drafts'

// Content, Calendar (31.2, and the calendar handover of 14 November 2026 in
// the RecOS look): two numbers, one row per weekday of one week, a dash where
// nothing sits. A day opens a composer window over the sheet: the day, the
// post, its state, Save; Bin with a confirm step; a guard on unsaved text.
// Last week, This week and Next week are text links. There is no month view.

type Composer = { kind: 'day'; date: string } | { kind: 'post'; id: string }

const POSTS_A_WEEK = 2

export function Calendar() {
  const [params, setParams] = useSearchParams()
  const items = useQuery(KEY, data.contentItems)
  const today = ukClock(new Date()).date
  const thisMonday = mondayOf(new Date())
  const offset = Number(params.get('week') ?? '0') || 0
  const monday = shiftDate(thisMonday, offset * 7)
  const all = items.data ?? []
  const [note, setNote] = useState<string | null>(null)

  const card = params.get('card')
  const composer: Composer | null = card?.startsWith('day:') ? { kind: 'day', date: card.slice(4) } : card?.startsWith('post:') ? { kind: 'post', id: card.slice(5) } : null
  const editing = composer?.kind === 'post' ? all.find((c) => c.id === composer.id) : undefined

  const tab = sections.find((s) => s.key === 'content')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))

  function setWeek(next: number) {
    setParams((p) => {
      if (next === 0) p.delete('week')
      else p.set('week', String(next))
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

  // The screen first, the server second (25.5). Posted asks for nothing (31.2).
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
  const posted = postedInWeek(all, monday)
  const dates = weekDates(monday)

  const body =
    items.status === 'loading' ? (
      <Dots />
    ) : items.status === 'error' ? (
      <EmptyLine text="Could not load. Try again." />
    ) : (
      <div className="flex flex-col" data-week={monday}>
        {visibleDays(all, monday).map((date) => {
          const posts = postsOn(all, date)
          const index = dates.indexOf(date)
          return (
            <div key={date} data-day={date} className={`flex items-start gap-6 ${date === today ? 'font-medium' : ''}`}>
              <span className={`label-caps mt-3.5 w-16 shrink-0 font-mono ${date === today ? 'text-ink' : 'text-ink-2'}`} aria-label={dayTitle(date)}>
                {dayLabel(date, index)}
              </span>
              <ul className="flex min-w-0 flex-1 flex-col">
                {posts.length === 0 ? (
                  <li className="flex min-h-12 items-center border-b border-rule">
                    <button
                      type="button"
                      aria-label={`Add a post on ${dayTitle(date)}`}
                      onClick={() => openComposer({ kind: 'day', date })}
                      className="min-h-11 min-w-11 text-left text-body text-ink-3 hover:text-ink"
                    >
                      -
                    </button>
                  </li>
                ) : (
                  posts.map((c) => (
                    <Row
                      key={c.id}
                      dot={c.status === 'posted' ? 'solid' : 'hollow'}
                      done={c.status === 'posted'}
                      title={c.hook ?? c.topic}
                      word={stateWord[c.status]}
                      meta={c.status === 'posted' && c.inboundMessages !== null ? `${c.inboundMessages} messages` : undefined}
                      actions={c.status === 'posted' ? [] : [{ label: 'Posted', onClick: () => void patch(c, { status: 'posted', postedOn: date }) }]}
                      onOpen={() => openComposer({ kind: 'post', id: c.id })}
                    />
                  ))
                )}
              </ul>
              {posts.length > 0 && (
                <button
                  type="button"
                  aria-label={`Add another post on ${dayTitle(date)}`}
                  onClick={() => openComposer({ kind: 'day', date })}
                  className="mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-pill text-ink-3 hover:text-ink"
                >
                  <Icon name="plus" size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    )

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Content" tabs={tabs} />
      <div className="grid grid-cols-2 gap-x-8 gap-y-12">
        <HeroStat label={offset === 0 ? 'This week' : offset === 1 ? 'Next week' : offset === -1 ? 'Last week' : 'That week'} value={`${posted}/${POSTS_A_WEEK}`} meter={{ filled: posted, total: POSTS_A_WEEK }} tone={posted >= POSTS_A_WEEK ? 'clear' : 'pending'} icon="pen" />
        <HeroStat label="Ready" value={twoDigits(ready.length).text} tone={ready.length > 0 ? 'new' : undefined} icon="check" />
      </div>
      {body}
      <div className="flex flex-wrap items-center gap-6">
        <TextLink label="Last week" onClick={() => setWeek(offset - 1)} />
        {offset !== 0 && <TextLink label="This week" onClick={() => setWeek(0)} />}
        <TextLink label="Next week" onClick={() => setWeek(offset + 1)} />
      </div>
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

type ComposerProps = {
  date: string
  post?: ContentItem
  ready: ContentItem[]
  today: string
  onPlace: (draft: ContentItem, date: string) => void
  onClose: () => void
  onSaved: () => void
}

/** A whole number or nothing. */
function whole(text: string): number | null | 'bad' {
  const t = text.trim()
  if (t === '') return null
  return /^\d+$/.test(t) ? Number(t) : 'bad'
}

// The composer: create and edit in one window. On a phone it is the sheet.
function ComposerCard({ date, post, ready, today, onPlace, onClose, onSaved }: ComposerProps) {
  const initial = { day: date, copy: post ? copyOf(post) : '', status: (post?.status ?? 'planned') as ContentStatus }
  const [day, setDay] = useState(initial.day)
  const [copy, setCopy] = useState(initial.copy)
  const [status, setStatus] = useState<ContentStatus>(initial.status)
  const [numbers, setNumbers] = useState({ impressions: post?.impressions?.toString() ?? '', comments: post?.comments?.toString() ?? '', messages: post?.inboundMessages?.toString() ?? '' })
  const [problem, setProblem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState<'bin' | 'discard' | null>(null)

  const dirty = copy !== initial.copy || day !== initial.day || status !== initial.status
  const askNumbers = post?.status === 'posted' && post.postedOn !== null && daysBetween(post.postedOn, today) >= 7
  const stateChoices = composerStates.filter((s) => s.value !== 'draft' || !post || post.status === 'draft' || post.status === 'approved' || post.status === 'held')

  async function save() {
    if (copy.trim() === '') {
      setProblem('Write the post first.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      setProblem('Pick a day.')
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
        const change: ContentPatch = { ...splitCopy(copy), status, plannedFor: day }
        if (status === 'posted') change.postedOn = post.postedOn ?? day
        if (askNumbers) Object.assign(change, { impressions: parsed.impressions as number | null, comments: parsed.comments as number | null, inboundMessages: parsed.messages as number | null })
        await data.updateContent(post.id, change)
      } else {
        await data.addContent({ copy, plannedFor: day, status })
      }
      onSaved()
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

  return (
    <Card
      label={post ? 'Post' : 'New post'}
      title={dayTitle(day)}
      tone={status === 'posted' ? 'clear' : status === 'planned' ? 'pending' : 'new'}
      beforeClose={() => {
        if (!dirty || asking === 'discard') return true
        setAsking('discard')
        return false
      }}
      sections={[
        ...(!post && ready.length > 0
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
              className="flex flex-col gap-6"
              aria-label={post ? 'Edit the post' : 'Write a post'}
              onSubmit={(e) => {
                e.preventDefault()
                void save()
              }}
            >
              <Field label="Day" kind="date" value={day} onChange={setDay} error={problem === 'Pick a day.' ? problem : undefined} />
              <div className="flex flex-col gap-1">
                <Field label="Post" kind="lines" rows={Math.min(lines, 14)} value={copy} onChange={setCopy} placeholder="The hook on its own line, then the post" autoFocus={!post} error={problem === 'Write the post first.' ? problem : undefined} />
                <p className="font-mono text-label text-ink-3" aria-live="polite">
                  {count} characters
                </p>
              </div>
              <Field label="State" kind="choice" value={status} onChange={(v) => setStatus(v as ContentStatus)} choices={stateChoices} />
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
                  <div className="flex flex-wrap items-center gap-6" role="group" aria-label="Bin this post?">
                    <p className="text-body text-ink">Bin this post?</p>
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
        </>
      }
      onClose={onClose}
    />
  )
}
