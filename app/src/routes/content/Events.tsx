import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { Dots, EmptyLine } from '../../components/Quiet'
import { RowList, type ListItem } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { daysBetween, eventTypeWord } from '../../lib/calendar'
import { data, type ContentItem, type InboxItem } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'
import { ukClock } from '../../lib/time'
import { ComposerCard } from './Calendar'
import { KEY } from './Drafts'

// Content, Events (Jason, 14 November 2026): the events he runs, panels,
// happy hours, webinars and breakfasts, added by hand and shown on the
// calendar, and ideas for events from the events agent, drawn from his
// calls and from what the content agent reads. An idea becomes an event in
// one step, or goes in the bin.

const IDEAS_KEY = 'content.eventIdeas'

/** Upcoming first, by day; past ones after, newest first. */
export function eventsOrder(items: ContentItem[], today: string): ContentItem[] {
  const events = items.filter((c) => c.kind === 'event' && c.status !== 'binned')
  const dayOf = (c: ContentItem) => c.plannedFor ?? c.postedOn ?? ''
  const coming = events.filter((c) => dayOf(c) >= today).sort((a, b) => dayOf(a).localeCompare(dayOf(b)))
  const past = events.filter((c) => dayOf(c) < today).sort((a, b) => dayOf(b).localeCompare(dayOf(a)))
  return [...coming, ...past]
}

export function Events() {
  const [params, setParams] = useSearchParams()
  const items = useQuery(KEY, data.contentItems)
  const ideas = useQuery(IDEAS_KEY, async () => (await data.inboxItems()).filter((i) => i.type === 'event_idea' && i.status === 'new'))
  const today = ukClock(new Date()).date
  const [note, setNote] = useState<string | null>(null)
  const all = items.data ?? []

  const card = params.get('card')
  const adding = card === 'new' ? { topic: '' } : card?.startsWith('idea:') ? (ideas.data ?? []).find((i) => i.id === card.slice(5)) : null
  const editing = card?.startsWith('event:') ? all.find((c) => c.id === card.slice(6)) : undefined

  const tab = sections.find((s) => s.key === 'content')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))

  function setCard(value: string | null) {
    setParams((p) => {
      if (value === null) p.delete('card')
      else p.set('card', value)
      return p
    })
  }

  async function binIdea(i: InboxItem) {
    const before = ideas.data
    setQueryData<InboxItem[]>(IDEAS_KEY, (rows) => (rows ?? []).filter((r) => r.id !== i.id))
    try {
      await data.actOnInbox(i, 'bin', { binReason: 'Not for me' })
      invalidate('home')
    } catch {
      setQueryData<InboxItem[]>(IDEAS_KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  async function ideaDone(i: InboxItem) {
    setQueryData<InboxItem[]>(IDEAS_KEY, (rows) => (rows ?? []).filter((r) => r.id !== i.id))
    try {
      await data.actOnInbox(i, 'done')
    } catch {
      // The event is made. The idea stays in the inbox until it is dealt with there.
    }
  }

  const ordered = eventsOrder(all, today)
  const next = ordered.find((c) => (c.plannedFor ?? '') >= today && c.status !== 'posted')
  const eventTiles: ListItem[] = ordered.map((c) => {
    const day = c.plannedFor ?? c.postedOn ?? ''
    const past = day < today || c.status === 'posted'
    return {
      id: c.id,
      section: past ? 'Held' : 'Coming up',
      dot: past ? ('solid' as const) : ('hollow' as const),
      done: past,
      title: c.topic,
      detail: [c.eventType ? eventTypeWord[c.eventType] : null, day, c.eventTime].filter(Boolean).join(', '),
      word: past ? 'Held' : day === today ? 'Today' : `In ${daysBetween(today, day)} days`,
      tone: past ? ('clear' as const) : ('pending' as const),
      icon: 'calendar' as const,
      onOpen: () => setCard(`event:${c.id}`),
    }
  })

  const ideaTiles: ListItem[] = (ideas.data ?? []).map((i) => ({
    id: i.id,
    dot: 'hollow' as const,
    title: i.title,
    detail: i.why ?? undefined,
    tone: 'new' as const,
    icon: 'sparkle' as const,
    actions: [
      { label: 'Make it an event', onClick: () => setCard(`idea:${i.id}`) },
      { label: 'Bin', onClick: () => void binIdea(i) },
    ],
    onOpen: () => setCard(`idea:${i.id}`),
  }))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Content" tabs={tabs} aside={<TextLink label="Add an event" icon="plus" onClick={() => setCard('new')} />} />
      <div className="grid grid-cols-2 gap-x-8 gap-y-8">
        <HeroStat label="Next event" value={next ? (next.plannedFor === today ? 'Today' : `${daysBetween(today, next.plannedFor ?? today)}d`) : undefined} tone={next ? 'pending' : undefined} icon="calendar" />
        <HeroStat label="Ideas" value={ideas.data ? twoDigits(ideas.data.length).text : undefined} tone={(ideas.data?.length ?? 0) > 0 ? 'new' : undefined} icon="sparkle" />
      </div>
      {items.status === 'loading' ? (
        <Dots />
      ) : items.status === 'error' ? (
        <EmptyLine text="Could not load. Try again." />
      ) : (
        <section className="flex flex-col gap-4" aria-label="Your events">
          <h2 className="label-caps text-ink-2">Your events</h2>
          <RowList rows={eventTiles} variant="band" emptyText="No events yet. Add one, or take an idea below." />
        </section>
      )}
      <section className="flex flex-col gap-4" aria-label="Ideas for events">
        <h2 className="label-caps text-ink-2">Ideas for events</h2>
        {ideas.status === 'loading' ? <Dots /> : <RowList rows={ideaTiles} view="rows" emptyText="No ideas waiting. The events agent brings them from your calls." />}
      </section>
      {(adding || editing) && (
        <ComposerCard
          key={card}
          date={editing?.plannedFor ?? today}
          post={editing}
          ready={[]}
          today={today}
          startAs={editing ? undefined : { kind: 'event', topic: adding && 'title' in adding ? adding.title : '' }}
          onPlace={() => undefined}
          onClose={() => setCard(null)}
          onSaved={() => {
            invalidate(KEY)
            if (adding && 'id' in adding) void ideaDone(adding)
            setCard(null)
          }}
        />
      )}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
