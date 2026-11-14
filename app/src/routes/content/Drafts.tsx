import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Deck } from '../../components/Deck'
import { Draft } from '../../components/Draft'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { Dots, EmptyLine } from '../../components/Quiet'
import { RowList } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { angleWord, binReasons, draftText, draftsDeck, insightLine, sourceWord, splitDraft } from '../../lib/content'
import { data, type ContentItem, type ContentPatch, type ContentStatus } from '../../lib/data'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'

// Content, Drafts (31.2): a deck of unreviewed drafts, highest ranked first.
// The hook at title size, the body editable, three quiet lines for the owner
// only, Approve as the one button, Hold and Bin as links. A draft that failed
// the format check says NEEDS TIDYING and why, in one line.

export const KEY = 'content.items'

type View = 'deck' | 'list'

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
    </div>
  )
}

export function Drafts() {
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'list' ? 'list' : 'deck'
  const items = useQuery(KEY, data.contentItems)
  const [deck, setDeck] = useState<ContentItem[] | null>(null)
  const [deckKey, setDeckKey] = useState(0)
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [note, setNote] = useState<string | null>(null)

  const all = items.data ?? []

  useEffect(() => {
    if (deck === null && items.status === 'ready' && items.data) setDeck(draftsDeck(items.data))
  }, [deck, items.status, items.data])

  const tab = sections.find((s) => s.key === 'content')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))

  const textOf = (c: ContentItem) => texts[c.id] ?? draftText(c)

  function setView(next: View) {
    setParams((p) => {
      if (next === 'deck') p.delete('view')
      else p.set('view', next)
      return p
    })
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
        onList={() => setView('list')}
        tone={(c) => (c.formatOk ? 'new' : 'action')}
        emptyText="Nothing to review"
      />
    )

  const listRows = draftsDeck(all).map((c) => ({
    id: c.id,
    dot: 'hollow' as const,
    title: c.hook ?? c.topic,
    detail: [c.runSource ? sourceWord[c.runSource] : null, c.angle ? angleWord[c.angle] : null].filter(Boolean).join(', '),
    meta: String(Math.round(c.rank)),
    word: c.formatOk ? undefined : 'Needs tidying',
    icon: 'pen' as const,
  }))

  const insight = insightLine(all)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Content" tabs={tabs} aside={view === 'list' ? <TextLink label="Deck" onClick={() => setView('deck')} icon="inbox" /> : undefined} />
      {view === 'deck' ? deckView : <RowList rows={listRows} state={items.status === 'error' ? 'error' : items.status === 'loading' ? 'loading' : 'ready'} emptyText="Nothing to review" />}
      {insight && <p className="text-body text-ink-2">{insight}</p>}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
