import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Deck } from '../../components/Deck'
import { Draft } from '../../components/Draft'
import { Field } from '../../components/Field'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { RowList, type ListItem } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { monthOf } from '../../lib/calendar'
import { angleWord, binReasons, draftText, draftsDeck, draftsGallery, groupWord, insightLine, sourceWord, splitDraft, type DraftGroup } from '../../lib/content'
import { data, type ContentItem, type ContentPatch, type ContentStatus } from '../../lib/data'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'
import { ukClock } from '../../lib/time'

// Content, Drafts (31.2, reshaped on 14 November 2026 at Jason's ask): a
// gallery of LinkedIn post drafts in three groups, New, Approved and
// Scheduled. A tile opens a window with the whole post, the angle, the data
// point and the tags, with nothing to scroll: Approve, Schedule on a day,
// Bin. The deck, one draft at a time, is one link away for a review in
// sequence.

export const KEY = 'content.items'

type View = 'gallery' | 'deck'

function Item({ item, text, onText }: { item: ContentItem; text: string; onText: (t: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="label-caps text-ink-2">{item.runSource ? sourceWord[item.runSource] : 'Draft'}</p>
      <h2 className="text-title text-ink">{item.hook ?? item.topic}</h2>
      {!item.formatOk && (
        <p className="text-body text-ink" data-testid="needs-tidying">
          <span className="label-caps">Needs tidying</span>
          {item.formatReason && <span className="text-ink-2">. {item.formatReason}.</span>}
        </p>
      )}
      <div className="max-w-prose">
        <Draft text={text} original={draftText(item)} onChange={onText} label="Post" />
      </div>
      <ForYou item={item} />
    </div>
  )
}

/** The three quiet lines for the owner only: angle, data point with its link, tags. */
function ForYou({ item }: { item: ContentItem }) {
  return (
    <div role="group" aria-label="For you only" className="flex max-w-prose flex-col gap-1 text-body text-ink-3">
      {item.angle && (
        <div className="flex gap-3">
          <span className="label-caps">Angle</span>
          <span>{angleWord[item.angle] ?? item.angle}</span>
        </div>
      )}
      {item.dataPoint && (
        <div className="flex gap-3">
          <span className="label-caps">Data point</span>
          <span>
            {item.dataPoint}
            {item.dataPointUrl && (
              <>
                {' '}
                <TextLink label="Source" href={item.dataPointUrl} icon="open" />
              </>
            )}
          </span>
        </div>
      )}
      {item.promptedBy && (
        <div className="flex gap-3">
          <span className="label-caps">Prompted by</span>
          <span>{item.promptedBy}</span>
        </div>
      )}
      {item.hashtags.length > 0 && (
        <div className="flex gap-3">
          <span className="label-caps">Tags</span>
          <span className="font-mono">{item.hashtags.map((t) => `#${t}`).join(' ')}</span>
        </div>
      )}
    </div>
  )
}

export function Drafts() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'deck' ? 'deck' : 'gallery'
  const items = useQuery(KEY, data.contentItems)
  const [deck, setDeck] = useState<ContentItem[] | null>(null)
  const [deckKey, setDeckKey] = useState(0)
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [note, setNote] = useState<string | null>(null)
  const today = ukClock(new Date()).date

  const all = items.data ?? []
  const cardId = params.get('card')?.startsWith('draft:') ? params.get('card')!.slice(6) : null
  const open = cardId ? all.find((c) => c.id === cardId) : undefined

  useEffect(() => {
    if (deck === null && items.status === 'ready' && items.data) setDeck(draftsDeck(items.data))
  }, [deck, items.status, items.data])

  const tab = sections.find((s) => s.key === 'content')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))

  const textOf = (c: ContentItem) => texts[c.id] ?? draftText(c)

  function setParam(key: string, value: string | null) {
    setParams((p) => {
      if (value === null) p.delete(key)
      else p.set(key, value)
      return p
    })
  }

  function setView(next: View) {
    setParam('view', next === 'gallery' ? null : next)
    if (next === 'deck') {
      setDeck(null)
      setDeckKey((k) => k + 1)
    }
  }

  // The screen first, the server second (25.5).
  async function move(c: ContentItem, status: ContentStatus, extra: ContentPatch = {}) {
    const before = items.data
    const edited = texts[c.id]
    const patch: ContentPatch = { status, ...extra }
    if (edited !== undefined && edited !== draftText(c)) Object.assign(patch, splitDraft(edited))
    setQueryData<ContentItem[]>(KEY, (rows) => (rows ?? []).map((r) => (r.id === c.id ? { ...r, ...patch } : r)))
    try {
      await data.updateContent(c.id, patch)
      invalidate('home')
    } catch {
      setQueryData<ContentItem[]>(KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  const deckView =
    deck === null ? (
      items.status === 'error' ? <EmptyLine text="Could not load. Try again." /> : <Dots />
    ) : (
      <Deck
        key={deckKey}
        items={deck}
        renderItem={(c) => <Item item={c} text={textOf(c)} onText={(t) => setTexts((d) => ({ ...d, [c.id]: t }))} />}
        primaryAction={{ label: () => 'Approve', onClick: (c) => void move(c, 'approved') }}
        extraActions={() => [{ label: 'Hold', onClick: (c) => void move(c, 'held', { heldReason: 'Held by you' }) }]}
        onBin={(c, reason) => void move(c, 'binned', { heldReason: reason })}
        binReasons={() => binReasons}
        onUndo={(c) => void move(c, 'draft', { heldReason: null })}
        links={(c) => <TextLink label="Copy" onClick={() => void navigator.clipboard?.writeText(textOf(c))} />}
        onList={() => setView('gallery')}
        tone={(c) => (c.formatOk ? 'new' : 'action')}
        emptyText="Nothing to review"
      />
    )

  const gallery = draftsGallery(all)
  const tiles: ListItem[] = gallery.map(({ item: c, group }) => ({
    id: c.id,
    section: groupWord[group],
    dot: group === 'scheduled' ? ('solid' as const) : ('hollow' as const),
    title: c.hook ?? c.topic,
    detail: [c.runSource ? sourceWord[c.runSource] : null, group === 'scheduled' && c.plannedFor ? `On ${c.plannedFor}` : c.angle ? angleWord[c.angle] : null].filter(Boolean).join(', '),
    word: group === 'new' && !c.formatOk ? 'Needs tidying' : undefined,
    tone: group === 'new' ? ('new' as const) : group === 'approved' ? ('pending' as const) : ('clear' as const),
    icon: 'pen' as const,
    onOpen: () => setParam('card', `draft:${c.id}`),
  }))

  const insight = insightLine(all)
  const counts = (['new', 'approved', 'scheduled'] as DraftGroup[]).map((g) => `${gallery.filter((x) => x.group === g).length} ${groupWord[g].toLowerCase()}`).join(', ')

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Content"
        tabs={tabs}
        aside={view === 'deck' ? <TextLink label="Gallery" onClick={() => setView('gallery')} icon="grid" /> : <TextLink label="Deck" onClick={() => setView('deck')} icon="inbox" />}
      />
      {view === 'deck' ? (
        deckView
      ) : items.status === 'loading' ? (
        <Dots />
      ) : items.status === 'error' ? (
        <EmptyLine text="Could not load. Try again." />
      ) : (
        <>
          <p className="font-mono text-label text-ink-2">{counts}</p>
          <RowList rows={tiles} limit={30} emptyText="Nothing to review" />
        </>
      )}
      {insight && <p className="text-body text-ink-2">{insight}</p>}
      {open && (
        <DraftCard
          key={open.id}
          item={open}
          text={textOf(open)}
          today={today}
          onText={(t) => setTexts((d) => ({ ...d, [open.id]: t }))}
          onMove={(status, extra) => void move(open, status, extra)}
          onCalendar={() => navigate(`/content/calendar?month=${monthOf(open.plannedFor ?? today)}&card=post:${open.id}`)}
          onClose={() => setParam('card', null)}
        />
      )}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}

type DraftCardProps = {
  item: ContentItem
  text: string
  today: string
  onText: (t: string) => void
  onMove: (status: ContentStatus, extra?: ContentPatch) => void
  onCalendar: () => void
  onClose: () => void
}

// The window behind a tile: the whole post on the left, the quiet lines on
// the right, so nothing scrolls. New: Approve. Approved: pick a day and
// Schedule. Scheduled: open it on the calendar. Bin asks first.
function DraftCard({ item: c, text, today, onText, onMove, onCalendar, onClose }: DraftCardProps) {
  const [day, setDay] = useState(c.plannedFor ?? '')
  const [asking, setAsking] = useState<'bin' | null>(null)
  const [reason, setReason] = useState(binReasons[0])
  const group: DraftGroup = c.status === 'draft' ? 'new' : c.status === 'approved' ? 'approved' : 'scheduled'

  return (
    <Card
      label={`${c.runSource ? sourceWord[c.runSource] : 'Draft'}, ${groupWord[group].toLowerCase()}`}
      title={c.hook ?? c.topic}
      tone={group === 'new' ? 'new' : group === 'approved' ? 'pending' : 'clear'}
      sections={[
        {
          body: (
            <div className="flex flex-col gap-3">
              {!c.formatOk && (
                <p className="text-body text-ink" data-testid="needs-tidying">
                  <span className="label-caps">Needs tidying</span>
                  {c.formatReason && <span className="text-ink-2">. {c.formatReason}.</span>}
                </p>
              )}
              <Draft text={text} original={draftText(c)} onChange={onText} label="Post" />
            </div>
          ),
        },
        { label: 'For you only', body: <ForYou item={c} /> },
        {
          label: group === 'scheduled' ? 'On the calendar' : 'Schedule',
          body:
            group === 'scheduled' ? (
              <div className="flex flex-col gap-2">
                <p className="font-mono text-label text-ink-2">{c.status === 'posted' ? `Posted ${c.postedOn}` : `Planned for ${c.plannedFor}`}</p>
                <TextLink label="Open on the calendar" icon="calendar" onClick={onCalendar} />
              </div>
            ) : (
              <form
                className="flex items-end gap-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return
                  onMove('planned', { plannedFor: day })
                  onClose()
                }}
              >
                <Field label="Day" kind="date" value={day} onChange={setDay} placeholder={today} />
                <PillButton label="Schedule" type="submit" icon="calendar" />
              </form>
            ),
        },
        ...(asking === 'bin'
          ? [
              {
                body: (
                  <div className="flex flex-wrap items-end gap-4" role="group" aria-label="Bin this draft?">
                    <Field label="Why" kind="choice" value={reason} onChange={setReason} choices={binReasons.map((r) => ({ value: r, label: r }))} />
                    <PillButton
                      label="Bin it"
                      icon="bin"
                      onClick={() => {
                        onMove('binned', { heldReason: reason })
                        onClose()
                      }}
                    />
                    <TextLink label="Keep it" onClick={() => setAsking(null)} />
                  </div>
                ),
              },
            ]
          : []),
      ]}
      primaryAction={
        group === 'new'
          ? {
              label: 'Approve',
              onClick: () => {
                onMove('approved')
                onClose()
              },
            }
          : undefined
      }
      links={
        <>
          {group === 'new' && (
            <TextLink
              label="Hold"
              onClick={() => {
                onMove('held', { heldReason: 'Held by you' })
                onClose()
              }}
            />
          )}
          {group !== 'scheduled' && asking !== 'bin' && <TextLink label="Bin" icon="bin" onClick={() => setAsking('bin')} />}
          <TextLink label="Copy" icon="copy" onClick={() => void navigator.clipboard?.writeText(text)} />
        </>
      }
      onClose={onClose}
    />
  )
}
