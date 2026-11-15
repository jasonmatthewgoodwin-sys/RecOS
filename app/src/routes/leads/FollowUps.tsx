import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Deck } from '../../components/Deck'
import { Draft } from '../../components/Draft'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { Dots, EmptyLine } from '../../components/Quiet'
import { RowList } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { data, type FollowUp, type FollowUpStatus } from '../../lib/data'
import { FOCUS_LIMIT_MINUTES, clockText, deckOf, dueWord, inEngine, isLate, kindWord, mondayFocusOf, nextThursday, primaryWord } from '../../lib/followups'
import { twoDigits } from '../../lib/format'
import { snoozeChoices } from '../../lib/inbox'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'
import { ukClock } from '../../lib/time'

// Follow-ups (sections 21.4, 21.5, 27.6 to 27.9): a deck of what is owed,
// late first; a list one link away; the Monday focus view with a quiet timer.

const KEY = 'leads.followUps'

type View = 'deck' | 'list'
type Filter = 'owed' | 'waiting'

function Item({ item, draft, onDraft, heading = true }: { item: FollowUp; draft: string; onDraft: (t: string) => void; heading?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {heading && <p className="label-caps text-ink-2">{kindWord[item.kind] ?? 'Follow-up'}</p>}
      {heading && (
        <h2 className="text-title text-ink">
          {item.personName}
          {item.company && <span className="text-ink-2">, {item.company}</span>}
        </h2>
      )}
      <p className="max-w-prose text-body text-ink">{item.reason}</p>
      {item.message?.body !== null && item.message?.body !== undefined && (
        <div className="max-w-prose">
          <Draft text={draft} original={item.message.body} onChange={onDraft} />
        </div>
      )}
    </div>
  )
}

/** The quiet timer in the corner (21.5). It counts up and never makes a sound. */
function useTimer(running: boolean): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [running])
  return seconds
}

export function FollowUps() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [now] = useState(() => new Date())
  const clock = ukClock(now)
  const today = clock.date

  const items = useQuery(KEY, data.followUps)
  const focus = params.get('focus') === 'monday'
  const view: View = params.get('view') === 'list' ? 'list' : 'deck'
  const filter: Filter = params.get('show') === 'waiting' ? 'waiting' : 'owed'
  const cardId = params.get('card')?.startsWith('followup:') ? params.get('card')!.slice(9) : null

  const [deck, setDeck] = useState<FollowUp[] | null>(null)
  const [deckKey, setDeckKey] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [note, setNote] = useState<string | null>(null)
  const [timeUp, setTimeUp] = useState(false)
  const recorded = useRef(false)

  const all = items.data ?? []

  useEffect(() => {
    if (deck === null && items.status === 'ready' && items.data) {
      setDeck(focus ? mondayFocusOf(items.data, clock) : deckOf(items.data, today))
    }
  }, [deck, items.status, items.data, focus, clock, today])

  // The Monday block's timer. At 90 minutes the line changes and the rest
  // move to Thursday (T-FUP-5). The time is recorded when the deck empties
  // or the owner leaves.
  const seconds = useTimer(focus && !timeUp)
  const minutes = Math.floor(seconds / 60)

  async function record() {
    if (!focus || recorded.current) return
    recorded.current = true
    try {
      await data.recordFollowUpBlock(Math.max(1, Math.round(seconds / 60)))
    } catch {
      // The block still happened. Nothing to say.
    }
  }

  useEffect(() => {
    if (!focus) return
    return () => {
      void record()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  const leadsTab = sections.find((s) => s.key === 'leads')!
  const tabs = leadsTab.pages.map((p) => ({ label: p.label, route: `${leadsTab.path}/${p.slug}` }))

  function draftOf(f: FollowUp): string {
    return drafts[f.id] ?? f.message?.body ?? ''
  }

  function setView(next: View, show?: Filter) {
    setParams((p) => {
      if (next === 'deck') p.delete('view')
      else p.set('view', next)
      if (show === 'waiting') p.set('show', 'waiting')
      else p.delete('show')
      p.delete('card')
      return p
    })
  }

  function openCard(id: string) {
    setParams(
      (p) => {
        p.set('card', `followup:${id}`)
        return p
      },
      { state: { card: true } },
    )
  }

  function closeCard() {
    if ((location.state as { card?: boolean } | null)?.card) {
      navigate(-1)
      return
    }
    setParams(
      (p) => {
        p.delete('card')
        return p
      },
      { replace: true },
    )
  }

  // The screen first, the server second (25.5).
  async function move(f: FollowUp, status: FollowUpStatus, extra: { snoozedUntil?: string } = {}) {
    const before = items.data
    const edited = drafts[f.id]
    const withDraft = edited !== undefined && edited !== f.message?.body ? { ...extra, draft: edited } : extra
    setQueryData<FollowUp[]>(KEY, (rows) => (rows ?? []).filter((r) => r.id !== f.id))
    try {
      await data.setFollowUpStatus(f.id, status, withDraft)
      invalidate('home')
    } catch {
      setQueryData<FollowUp[]>(KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  // The paired message goes through the send engine (15.6, 21.4): Send
  // queues a one-click message, Open in Outlook makes a draft there, Copy
  // and Mark as sent cover LinkedIn and anything sent by hand.
  async function send(f: FollowUp) {
    const m = f.message
    if (!m) return move(f, 'done')
    const edited = drafts[f.id]
    if (edited !== undefined && edited !== m.body) {
      try {
        await data.setFollowUpStatus(f.id, 'open', { draft: edited })
      } catch {
        setNote('That did not save. Try again.')
        return
      }
    }
    if (m.channel === 'linkedin') {
      void navigator.clipboard?.writeText(draftOf(f))
      setNote('Copied. Paste it into LinkedIn, then Mark as sent.')
      return
    }
    if (m.level === 'one_click') {
      const before = items.data
      setQueryData<FollowUp[]>(KEY, (rows) => (rows ?? []).filter((r) => r.id !== f.id))
      try {
        const r = await data.sendAction(m.id, 'approve')
        setNote(r.note ?? 'Queued.')
        // Keep the row, marked as the engine's, until the next load.
        setQueryData<FollowUp[]>(KEY, (rows) => [...(rows ?? []).filter((r) => r.id !== f.id), { ...f, message: { ...m, state: r.state ?? 'queued' } }])
        invalidate('home')
      } catch (e) {
        setQueryData<FollowUp[]>(KEY, () => before ?? [])
        setNote(e instanceof Error ? e.message : 'That did not send. Try again.')
      }
      return
    }
    try {
      const r = await data.sendAction(m.id, 'open_draft')
      if (r.outlook_draft_url) window.open(r.outlook_draft_url, '_blank', 'noopener')
      setNote('A draft is open in Outlook. Press Send there, then Mark as sent here.')
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not open Outlook. Copy the draft instead.')
    }
  }

  async function markSent(f: FollowUp) {
    if (!f.message) return move(f, 'done')
    const before = items.data
    setQueryData<FollowUp[]>(KEY, (rows) => (rows ?? []).filter((r) => r.id !== f.id))
    try {
      await data.sendAction(f.message.id, 'mark_sent')
      invalidate('home')
    } catch (e) {
      setQueryData<FollowUp[]>(KEY, () => before ?? [])
      setNote(e instanceof Error ? e.message : 'That did not save. Try again.')
    }
  }

  async function undo(f: FollowUp) {
    setQueryData<FollowUp[]>(KEY, (rows) => [f, ...(rows ?? []).filter((r) => r.id !== f.id)])
    try {
      await data.setFollowUpStatus(f.id, 'open')
      invalidate('home')
    } catch {
      setNote('Could not undo that. Try again.')
    }
  }

  // T-FUP-5: at 90 minutes the rest move to Thursday.
  useEffect(() => {
    if (!focus || timeUp || minutes < FOCUS_LIMIT_MINUTES || !deck) return
    setTimeUp(true)
    const thursday = nextThursday(clock)
    // A message the engine already holds is not moved: it sends on its own.
    const left = deck.filter((d) => all.some((a) => a.id === d.id && a.status === 'open' && !inEngine(a)))
    const ids = left.map((d) => d.id)
    setQueryData<FollowUp[]>(KEY, (rows) => (rows ?? []).map((r) => (ids.includes(r.id) ? { ...r, dueOn: thursday } : r)))
    setDeck([])
    setDeckKey((k) => k + 1)
    void data.redateFollowUps(ids, thursday).catch(() => setNote('Could not move the rest. Try again.'))
    void record()
  }, [focus, timeUp, minutes, deck, all, clock])

  const owed = all.filter((f) => f.status === 'open' && f.direction === 'owed' && f.dueOn <= today)
  const waitingOn = all.filter((f) => f.status === 'open' && f.direction === 'waiting')
  const due = items.data === undefined ? undefined : twoDigits(owed.length)
  const waitingCount = items.data === undefined ? undefined : twoDigits(waitingOn.length)

  const chosen = cardId ? all.find((f) => f.id === cardId) : undefined

  const deckView =
    deck === null ? (
      items.status === 'error' ? <EmptyLine text="Could not load. Try again." /> : <Dots />
    ) : (
      <Deck
        key={deckKey}
        items={deck}
        renderItem={(f) => <Item item={f} draft={draftOf(f)} onDraft={(t) => setDrafts((d) => ({ ...d, [f.id]: t }))} />}
        primaryAction={{
          label: (f) => primaryWord(f, true),
          onClick: (f) => void send(f),
        }}
        extraActions={(f) => [
          ...(f.message && f.message.level !== 'one_click' ? [{ label: 'Mark as sent', onClick: () => void markSent(f) }] : []),
          ...(f.message && f.message.level === 'one_click' ? [{ label: 'Done without sending', onClick: () => void move(f, 'done') }] : []),
          ...(f.direction === 'owed' ? [{ label: 'Handled offline', onClick: () => void move(f, 'handled_offline') }] : []),
          { label: 'No action needed', onClick: () => void move(f, 'closed') },
        ]}
        onSnooze={(f, until) => void move(f, 'snoozed', { snoozedUntil: until })}
        snoozeChoices={snoozeChoices(clock)}
        onUndo={(f) => void undo(f)}
        links={(f) => f.message?.body && <TextLink label="Copy" onClick={() => void navigator.clipboard?.writeText(draftOf(f))} />}
        onList={() => setView('list')}
        tone={(f) => (f.direction === 'waiting' ? 'pending' : isLate(f, today) ? 'action' : 'new')}
        emptyText={focus && timeUp ? 'Time. The rest moves to Thursday.' : 'Nobody is waiting on you'}
      />
    )

  const listRows = all
    .filter((f) => f.status === 'open' && f.direction === filter)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.createdAt.localeCompare(b.createdAt))
    .map((f) => ({
      id: f.id,
      dot: f.direction === 'owed' ? ('solid' as const) : ('hollow' as const),
      tone: f.direction === 'waiting' ? ('pending' as const) : isLate(f, today) ? ('action' as const) : ('new' as const),
      title: f.company ? `${f.personName}, ${f.company}` : f.personName,
      detail: f.reason,
      meta: dueWord(f, today),
      word: inEngine(f) ? 'Queued' : isLate(f, today) ? 'Late' : undefined,
      done: inEngine(f),
      onOpen: () => openCard(f.id),
    }))

  const listView = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Show" className="flex gap-x-6">
          <TextLink label="Owed" active={filter === 'owed'} onClick={() => setView('list', 'owed')} />
          <TextLink label="Waiting on them" active={filter === 'waiting'} onClick={() => setView('list', 'waiting')} />
        </nav>
        <TextLink label="Deck" onClick={() => setView('deck')} />
      </div>
      <RowList icon="clock" rows={listRows} state={items.status} emptyText={filter === 'owed' ? 'Nobody is waiting on you' : 'Nothing to wait for'} />
    </div>
  )

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title={leadsTab.label} tabs={tabs} />
        {focus && (
          <p className="label-caps shrink-0 pt-2 text-ink-2" data-testid="focus-timer">
            {timeUp ? 'Time' : `Monday block ${clockText(seconds)}`}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-8 md:flex md:gap-x-16">
        <HeroStat label="Due" value={due?.text} plus={due?.plus} onClick={() => setView('list', 'owed')} />
        <HeroStat label="Waiting on" value={waitingCount?.text} plus={waitingCount?.plus} onClick={() => setView('list', 'waiting')} />
      </div>

      {view === 'deck' ? deckView : listView}

      {chosen && (
        <Card
          key={chosen.id}
          label={kindWord[chosen.kind] ?? 'Follow-up'}
          title={chosen.company ? `${chosen.personName}, ${chosen.company}` : chosen.personName}
          sections={[{ body: <Item item={chosen} heading={false} draft={draftOf(chosen)} onDraft={(t) => setDrafts((d) => ({ ...d, [chosen.id]: t }))} /> }]}
          primaryAction={{ label: primaryWord(chosen, true), onClick: () => void send(chosen).then(closeCard) }}
          links={
            <>
              <TextLink label="Handled offline" onClick={() => void move(chosen, 'handled_offline').then(closeCard)} />
              <TextLink label="No action needed" onClick={() => void move(chosen, 'closed').then(closeCard)} />
            </>
          }
          foot={`Due ${chosen.dueOn}`}
          onClose={closeCard}
        />
      )}

      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
