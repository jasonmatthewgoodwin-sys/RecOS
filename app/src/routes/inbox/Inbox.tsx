import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Deck } from '../../components/Deck'
import { Field } from '../../components/Field'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { RowList } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import type { Tone } from '../../theme/tokens'
import { data, type InboxAction, type InboxActionExtra, type InboxItem } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import {
  agentWord,
  binReasons,
  byDeckOrder,
  countByType,
  deckOf,
  isLate,
  oldestDays,
  primaryWord,
  snoozeChoices,
  typeFilters,
  typeWord,
  waiting,
} from '../../lib/inbox'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { ukClock, ukTime } from '../../lib/time'
import { ApproveStep, InboxItemView, PassStep } from './InboxItemView'

// The Inbox (section 27): a deck by default, one item at a time; a list one
// link away; a card over the list. Actions update the screen first and the
// server second (25.5), and can be undone for 8 seconds (INBX-2).

const ITEMS_KEY = 'inbox.items'
const SENT_KEY = 'inbox.sent'

type View = 'deck' | 'list' | 'sent'

function primaryWordFor(item: InboxItem): string {
  return primaryWord[item.type]
}

/** What the primary button does to the item's status (22.3). */
function actionFor(item: InboxItem): InboxAction {
  if (item.type === 'wider_lead') return 'pass'
  if (item.type === 'content_draft' || item.type === 'client_nudge') return 'approve'
  return 'done'
}

export function Inbox() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  // Read once when the page opens. Nothing changes while the owner looks at it.
  const [now] = useState(() => new Date())
  const clock = ukClock(now)

  const items = useQuery(ITEMS_KEY, data.inboxItems)
  const view: View = params.get('view') === 'list' ? 'list' : params.get('view') === 'sent' ? 'sent' : 'deck'
  const sent = useQuery(SENT_KEY, data.sentForYou)
  const cardId = params.get('card')?.startsWith('item:') ? params.get('card')!.slice(5) : null

  // INBX-1: the deck is built once from what was there when the page opened.
  const [deck, setDeck] = useState<InboxItem[] | null>(null)
  // How many waited when the deck was built: the counter says 30 of N when
  // some were held back (INBX-6). Arrivals since then wait behind N new.
  const [deckWaiting, setDeckWaiting] = useState(0)
  const [deckKey, setDeckKey] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [typeFilter, setTypeFilter] = useState('')
  const [clearing, setClearing] = useState(false)
  const [cardMode, setCardMode] = useState<'view' | 'pass' | 'approve' | 'bin'>('view')
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (deck === null && items.status === 'ready' && items.data) {
      setDeck(deckOf(items.data))
      setDeckWaiting(waiting(items.data).length)
    }
  }, [deck, items.status, items.data])

  const all = items.data ?? []
  const waitingNow = waiting(all)
  const fresh = useMemo(() => {
    if (!deck) return 0
    const ids = new Set(deck.map((d) => d.id))
    return waitingNow.filter((i) => !ids.has(i.id)).length
  }, [deck, waitingNow])
  const stale = waitingNow.filter((i) => i.status === 'stale')
  const oldest = oldestDays(all, now)

  function draftOf(item: InboxItem): string {
    return drafts[item.id] ?? item.draft ?? ''
  }

  function setView(next: View) {
    setParams((p) => {
      if (next === 'deck') p.delete('view')
      else p.set('view', next)
      p.delete('card')
      return p
    })
  }

  function openCard(id: string) {
    setCardMode('view')
    setParams(
      (p) => {
        p.set('card', `item:${id}`)
        return p
      },
      { state: { card: true } },
    )
  }

  function closeCard() {
    setCardMode('view')
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

  // The screen first, the server second. A failed write puts the item back
  // and says so once (25.5). Home's counts are refreshed after any action.
  async function act(item: InboxItem, action: InboxAction, extra: InboxActionExtra = {}) {
    const before = items.data
    const edited = drafts[item.id]
    const withDraft = edited !== undefined && edited !== item.draft ? { ...extra, draft: edited } : extra
    setQueryData<InboxItem[]>(ITEMS_KEY, (rows) => (rows ?? []).filter((r) => r.id !== item.id))
    try {
      await data.actOnInbox(item, action, withDraft)
      invalidate('home')
    } catch {
      setQueryData<InboxItem[]>(ITEMS_KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  async function undo(item: InboxItem, action: InboxAction) {
    setQueryData<InboxItem[]>(ITEMS_KEY, (rows) => [item, ...(rows ?? []).filter((r) => r.id !== item.id)])
    try {
      await data.undoInbox(item, action)
      invalidate('home')
    } catch {
      setNote('Could not undo that. Try again.')
    }
  }

  async function clearOld() {
    const ids = stale.map((s) => s.id)
    const before = items.data
    setQueryData<InboxItem[]>(ITEMS_KEY, (rows) => (rows ?? []).filter((r) => r.status !== 'stale'))
    setDeck((d) => (d ? d.filter((i) => i.status !== 'stale') : d))
    setDeckWaiting((n) => Math.max(0, n - ids.length))
    setDeckKey((k) => k + 1)
    setClearing(false)
    try {
      await data.binStale(ids)
      invalidate('home')
    } catch {
      setQueryData<InboxItem[]>(ITEMS_KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  function rebuildDeck() {
    setDeck(deckOf(all))
    setDeckWaiting(waitingNow.length)
    setDeckKey((k) => k + 1)
  }

  const chosen = cardId ? all.find((i) => i.id === cardId) ?? sent.data?.find((i) => i.id === cardId) : undefined
  const waitingCount = items.data === undefined ? undefined : twoDigits(waitingNow.length)

  // ------------------------------------------------------------- the deck

  const deckView = deck === null ? (
    items.status === 'error' ? <EmptyLine text="Could not load. Try again." /> : <Dots />
  ) : (
    <div className="flex flex-col gap-6">
      {fresh > 0 && <TextLink label={`${fresh} new`} onClick={rebuildDeck} />}
      <Deck
        key={deckKey}
        items={deck}
        waiting={deckWaiting}
        renderItem={(item) => <InboxItemView item={item} draft={draftOf(item)} onDraft={(t) => setDrafts((d) => ({ ...d, [item.id]: t }))} />}
        primaryAction={{
          label: primaryWordFor,
          onClick: (item) => {
            if (item.type === 'wider_lead' || item.type === 'content_draft') return 'ask'
            if (item.type === 'system_notice') navigate('/settings')
            void act(item, actionFor(item))
          },
          step: (item, done, cancel) =>
            item.type === 'wider_lead' ? (
              <PassStep
                onConfirm={(colleague, split) => {
                  void act(item, 'pass', { colleague, split })
                  done()
                }}
                onCancel={cancel}
              />
            ) : (
              <ApproveStep
                clock={clock}
                onConfirm={(on) => {
                  void act(item, 'approve', { on })
                  done()
                }}
                onCancel={cancel}
              />
            ),
        }}
        onBin={(item, reason) => void act(item, 'bin', { binReason: reason })}
        binReasons={(item) => binReasons[item.type]}
        onSnooze={(item, until) => void act(item, 'snooze', { snoozedUntil: until })}
        snoozeChoices={snoozeChoices(clock)}
        onUndo={(item, action) => void undo(item, action === 'primary' || action === 'extra' ? actionFor(item) : action)}
        links={(item) => (
          <>
            {item.type === 'job_lead' && item.draft !== null && (
              <TextLink label="Copy" onClick={() => void navigator.clipboard?.writeText(draftOf(item))} />
            )}
            {item.sourceUrl && <TextLink label="Open source" href={item.sourceUrl} />}
          </>
        )}
        onList={() => setView('list')}
        tone={(i) => inboxTone(i, clock.date)}
        emptyText="All clear"
      />
      {stale.length > 0 && deck.length > 0 && (
        <div className="flex flex-col gap-3">
          {clearing ? (
            <>
              <p className="text-body text-ink-2">Bin {countByType(stale)}?</p>
              <div className="flex items-center gap-6">
                <PillButton label="Bin them" onClick={() => void clearOld()} />
                <TextLink label="Keep them" onClick={() => setClearing(false)} />
              </div>
            </>
          ) : (
            <TextLink label="Clear old items" onClick={() => setClearing(true)} />
          )}
        </div>
      )}
    </div>
  )

  // ------------------------------------------------------------- the list

  const listRows = waitingNow
    .filter((i) => typeFilter === '' || i.type === typeFilter)
    .sort(byDeckOrder)
    .map((i) => ({
      id: i.id,
      dot: i.status === 'new' ? ('solid' as const) : ('hollow' as const),
      tone: inboxTone(i, clock.date),
      title: i.title,
      detail: i.suggestedAction ?? undefined,
      meta: typeWord[i.type],
      word: isLate(i, clock.date) ? ('Late' as const) : undefined,
      onOpen: () => openCard(i.id),
    }))

  const listView = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-48">
          <Field
            label="Show"
            kind="choice"
            value={typeFilter}
            onChange={setTypeFilter}
            placeholder="All types"
            choices={typeFilters.map((t) => ({ value: t.value, label: t.label }))}
          />
        </div>
        <div className="flex gap-6">
          <TextLink label="Deck" onClick={() => setView('deck')} />
          <TextLink label="Sent for you" onClick={() => setView('sent')} />
        </div>
      </div>
      <RowList icon="inbox" rows={listRows} state={items.status} emptyText="All clear" />
    </div>
  )

  const sentRows = (sent.data ?? []).map((i) => ({
    id: i.id,
    dot: 'hollow' as const,
    tone: 'clear' as const,
    title: i.title,
    detail: i.why ?? undefined,
    meta: ukTime(new Date(i.createdAt)),
    word: 'Auto' as const,
    onOpen: () => openCard(i.id),
  }))

  const sentView = (
    <div className="flex flex-col gap-6">
      <div className="flex gap-6">
        <TextLink label="Deck" onClick={() => setView('deck')} />
        <TextLink label="List" onClick={() => setView('list')} />
      </div>
      <RowList icon="inbox" rows={sentRows} state={sent.status} emptyText="Nothing sent automatically this week" />
    </div>
  )

  // ------------------------------------------------------------- the card

  const card = chosen && (
    <Card
      key={chosen.id}
      label={typeWord[chosen.type]}
      title={chosen.title}
      sections={[
        {
          body: (
            <InboxItemView
              item={chosen}
              heading={false}
              draft={draftOf(chosen)}
              onDraft={(t) => setDrafts((d) => ({ ...d, [chosen.id]: t }))}
            />
          ),
        },
        ...(cardMode === 'pass'
          ? [{ body: <PassStep onConfirm={(c, s) => void act(chosen, 'pass', { colleague: c, split: s }).then(closeCard)} onCancel={() => setCardMode('view')} /> }]
          : cardMode === 'approve'
            ? [{ body: <ApproveStep clock={clock} onConfirm={(on) => void act(chosen, 'approve', { on }).then(closeCard)} onCancel={() => setCardMode('view')} /> }]
            : cardMode === 'bin'
              ? [
                  {
                    label: 'Why',
                    body: (
                      <div className="flex flex-wrap items-center gap-x-6">
                        {binReasons[chosen.type].map((r) => (
                          <TextLink key={r} label={r} onClick={() => void act(chosen, 'bin', { binReason: r }).then(closeCard)} />
                        ))}
                        <TextLink label="Keep it" onClick={() => setCardMode('view')} />
                      </div>
                    ),
                  },
                ]
              : []),
      ]}
      primaryAction={
        chosen.type !== 'auto_sent' && cardMode === 'view'
          ? {
              label: primaryWordFor(chosen),
              onClick: () => {
                if (chosen.type === 'wider_lead') setCardMode('pass')
                else if (chosen.type === 'content_draft') setCardMode('approve')
                else {
                  if (chosen.type === 'system_notice') navigate('/settings')
                  void act(chosen, actionFor(chosen)).then(closeCard)
                }
              },
            }
          : undefined
      }
      links={
        chosen.type !== 'auto_sent' && cardMode === 'view' ? (
          <>
            <TextLink label="Bin" onClick={() => setCardMode('bin')} />
            {chosen.sourceUrl && <TextLink label="Open source" href={chosen.sourceUrl} />}
          </>
        ) : chosen.sourceUrl ? (
          <TextLink label="Open source" href={chosen.sourceUrl} />
        ) : undefined
      }
      foot={`Found by ${agentWord[chosen.agent] ?? chosen.agent}${chosen.source ? `, ${chosen.source}` : ''}`}
      onClose={closeCard}
    />
  )

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Inbox" />

      <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:flex md:gap-x-16">
        <HeroStat label="Waiting" value={waitingCount?.text} plus={waitingCount?.plus} onClick={() => setView('list')} />
        {oldest !== null && oldest > 7 && <HeroStat label="Oldest" value={twoDigits(oldest).text} plus={twoDigits(oldest).plus} />}
      </div>

      {view === 'deck' ? deckView : view === 'list' ? listView : sentView}

      {card}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}

/** The state colour of an inbox item: new, needs you when late or stale, waiting when snoozed, done otherwise. */
function inboxTone(i: { status: string }, today: string): Tone {
  if (i.status === 'done' || i.status === 'binned') return 'clear'
  if (i.status === 'snoozed') return 'pending'
  if (i.status === 'stale' || isLate(i as never, today)) return 'action'
  return 'new'
}
