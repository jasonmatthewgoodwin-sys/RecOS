import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Draft } from '../../components/Draft'
import { Field } from '../../components/Field'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { RowList, type ListItem } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { data, type ContentItem, type ContentPatch } from '../../lib/data'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'
import { ukClock } from '../../lib/time'
import { KEY } from './Drafts'

// Content, Testimonials (31.2): THIS QUARTER as N/3 with a 3-tick meter,
// then the requests: who, which placement, and where they stand. Requests
// are made automatically at placement and can be added by hand.

const A_QUARTER = 3

export function requestWord(t: ContentItem): 'To ask' | 'Asked' | 'Received' | 'Used' {
  if (t.usedWhere) return 'Used'
  if (t.receivedOn) return 'Received'
  if (t.requestedOn) return 'Asked'
  return 'To ask'
}

function quarterStart(date: string): string {
  const m = Number(date.slice(5, 7))
  const q = Math.floor((m - 1) / 3) * 3 + 1
  return `${date.slice(0, 4)}-${String(q).padStart(2, '0')}-01`
}

export function Testimonials() {
  const [params, setParams] = useSearchParams()
  const items = useQuery(KEY, data.contentItems)
  const [note, setNote] = useState<string | null>(null)
  const today = ukClock(new Date()).date
  const all = (items.data ?? []).filter((c) => c.kind === 'testimonial' && c.status !== 'binned')
  const received = all.filter((t) => t.receivedOn && t.receivedOn >= quarterStart(today)).length
  const card = params.get('card')
  const open = card?.startsWith('testimonial:') ? all.find((t) => t.id === card.slice(12)) : undefined
  const adding = card === 'testimonial:new'

  const tab = sections.find((s) => s.key === 'content')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))

  function setCard(v: string | null) {
    setParams((p) => {
      if (v === null) p.delete('card')
      else p.set('card', v)
      return p
    })
  }

  async function patch(t: ContentItem, change: ContentPatch) {
    const before = items.data
    setQueryData<ContentItem[]>(KEY, (rows) => (rows ?? []).map((x) => (x.id === t.id ? { ...x, ...change } : x)))
    try {
      await data.updateContent(t.id, change)
      invalidate('home')
    } catch {
      setQueryData<ContentItem[]>(KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  const order = { 'To ask': 0, Asked: 1, Received: 2, Used: 3 }
  const rows: ListItem[] = [...all]
    .sort((a, b) => order[requestWord(a)] - order[requestWord(b)] || b.createdAt.localeCompare(a.createdAt))
    .map((t) => {
      const w = requestWord(t)
      return {
        id: t.id,
        dot: w === 'To ask' || w === 'Asked' ? ('hollow' as const) : ('solid' as const),
        done: w === 'Used',
        title: t.topic,
        detail: t.requestedOn ? `Asked ${t.requestedOn}${t.receivedOn ? `, received ${t.receivedOn}` : ''}` : undefined,
        word: w,
        tone: w === 'To ask' ? ('action' as const) : w === 'Asked' ? ('pending' as const) : w === 'Received' ? ('new' as const) : ('clear' as const),
        icon: 'sparkle' as const,
        onOpen: () => setCard(`testimonial:${t.id}`),
      }
    })

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Content" tabs={tabs} aside={<TextLink label="Add a request" icon="plus" onClick={() => setCard('testimonial:new')} />} />
      <div className="grid grid-cols-2 gap-x-8 gap-y-8">
        <HeroStat label="This quarter" value={items.data ? `${received}/${A_QUARTER}` : undefined} meter={{ filled: received, total: A_QUARTER }} tone={received >= A_QUARTER ? 'clear' : 'pending'} icon="sparkle" />
      </div>
      {items.status === 'loading' ? <Dots /> : items.status === 'error' ? <EmptyLine text="Could not load. Try again." /> : <RowList rows={rows} emptyText="No requests yet. A placement raises two; Add a request raises one by hand." />}
      {open && <TestimonialCard key={open.id} item={open} today={today} onPatch={(change) => void patch(open, change)} onClose={() => setCard(null)} />}
      {adding && (
        <AddRequestCard
          onAdd={async (who, placement) => {
            try {
              await data.addContent({ kind: 'testimonial', copy: 'Would you write a few lines on how we worked together?', topic: `Testimonial from ${who}${placement ? `, ${placement}` : ''}`, plannedFor: null, status: 'draft' })
              invalidate(KEY)
              setCard(null)
            } catch {
              setNote('That did not save. Try again.')
            }
          }}
          onClose={() => setCard(null)}
        />
      )}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}

function TestimonialCard({ item: t, today, onPatch, onClose }: { item: ContentItem; today: string; onPatch: (change: ContentPatch) => void; onClose: () => void }) {
  const [ask, setAsk] = useState(t.hook ?? '')
  const [text, setText] = useState(t.body ?? '')
  const [used, setUsed] = useState(t.usedWhere ?? '')
  const w = requestWord(t)
  return (
    <Card
      label={`Testimonial, ${w.toLowerCase()}`}
      title={t.topic}
      tone={w === 'To ask' ? 'action' : w === 'Asked' ? 'pending' : w === 'Received' ? 'new' : 'clear'}
      sections={[
        {
          label: 'The ask',
          body: (
            <div className="flex flex-col gap-3">
              <Draft label="Draft ask" text={ask} original={t.hook ?? undefined} onChange={setAsk} />
              <div className="flex flex-wrap gap-x-6">
                {ask !== (t.hook ?? '') && <TextLink label="Save the ask" onClick={() => onPatch({ hook: ask })} />}
                <TextLink label="Copy" icon="copy" onClick={() => void navigator.clipboard?.writeText(ask)} />
                {!t.requestedOn && <TextLink label="Mark asked today" onClick={() => onPatch({ requestedOn: today, hook: ask })} />}
              </div>
              {t.requestedOn && <p className="font-mono text-label text-ink-2">Asked {t.requestedOn}</p>}
            </div>
          ),
        },
        {
          label: 'What came back',
          body: (
            <div className="flex flex-col gap-3">
              <Field label="Their words" kind="lines" rows={4} value={text} onChange={setText} placeholder="Paste it here when it arrives" />
              <div className="flex flex-wrap gap-x-6">
                {text.trim() && (text !== (t.body ?? '') || !t.receivedOn) && <TextLink label={t.receivedOn ? 'Save' : 'Mark received'} onClick={() => onPatch({ body: text, receivedOn: t.receivedOn ?? today })} />}
              </div>
              {t.receivedOn && <p className="font-mono text-label text-ink-2">Received {t.receivedOn}</p>}
            </div>
          ),
        },
        {
          label: 'Where it is used',
          body: (
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Used where" value={used} onChange={setUsed} placeholder="Website, a proposal, LinkedIn" />
              {used.trim() !== (t.usedWhere ?? '') && <TextLink label="Save" onClick={() => onPatch({ usedWhere: used.trim() || null })} />}
            </div>
          ),
        },
      ]}
      onClose={onClose}
    />
  )
}

function AddRequestCard({ onAdd, onClose }: { onAdd: (who: string, placement: string) => Promise<void>; onClose: () => void }) {
  const [who, setWho] = useState('')
  const [placement, setPlacement] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <Card
      label="Testimonial"
      title="Add a request"
      tone="new"
      sections={[
        {
          body: (
            <form
              className="flex flex-col gap-4"
              aria-label="Add a request"
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                if (!who.trim()) {
                  setProblem('Who is it from')
                  return
                }
                void onAdd(who.trim(), placement.trim())
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Who" value={who} onChange={setWho} autoFocus error={problem ?? undefined} placeholder="A client or a candidate" />
                <Field label="Which placement" value={placement} onChange={setPlacement} placeholder="Optional" />
              </div>
              <div>
                <PillButton label="Add" type="submit" kind="primary" />
              </div>
            </form>
          ),
        },
      ]}
      onClose={onClose}
    />
  )
}
