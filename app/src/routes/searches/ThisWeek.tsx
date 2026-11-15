import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Field } from '../../components/Field'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { Dots, EmptyLine } from '../../components/Quiet'
import { RowList, type ListItem } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { data, type Call, type CallPatch } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { isLive, writeUpTicks } from '../../lib/searches'
import { sections } from '../../lib/sections'
import { mondayOf, ukClock, ukTime, weekdayOf } from '../../lib/time'
import { CALLS_KEY, SEARCHES_KEY } from './Open'

// Searches, This week (31.1): have this week's calls been written up? Two
// numbers, the calls incomplete first, five ticks on each row, and a card
// with the five checks as plain lines, the links, and one action for
// whatever is missing. Internal calls and skipped ones sit below the line.

const skipWords = ['Internal', 'Client call', 'Personal', 'Duplicate']

export function ThisWeek() {
  const [params, setParams] = useSearchParams()
  const calls = useQuery(CALLS_KEY, data.calls)
  const searches = useQuery(SEARCHES_KEY, data.searches)
  const week = useQuery('numbers.thisWeek', data.kpiThisWeek)
  const [note, setNote] = useState<string | null>(null)
  const monday = mondayOf(new Date())
  const today = ukClock(new Date()).date

  const tab = sections.find((s) => s.key === 'searches')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))

  const all = (calls.data ?? []).filter((c) => c.heldAt.slice(0, 10) >= monday)
  const needsWriteUp = (c: Call) => c.callType !== 'internal' && !c.skipReason && writeUpTicks.some((t) => !c[t.key])
  const toWrite = all.filter(needsWriteUp)
  const aStar = (week.data ?? []).find((k) => k.kpi === 'new_a_star')
  const cardId = params.get('card')?.startsWith('call:') ? params.get('card')!.slice(5) : null
  const open = cardId ? (calls.data ?? []).find((c) => c.id === cardId) : undefined
  const live = (searches.data ?? []).filter(isLive)

  function setCard(v: string | null) {
    setParams((p) => {
      if (v === null) p.delete('card')
      else p.set('card', v)
      return p
    })
  }

  async function patch(c: Call, change: CallPatch) {
    const before = calls.data
    setQueryData<Call[]>(CALLS_KEY, (rows) => (rows ?? []).map((x) => (x.id === c.id ? { ...x, ...change } : x)))
    try {
      await data.updateCall(c.id, change)
      invalidate('home')
    } catch {
      setQueryData<Call[]>(CALLS_KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  const searchName = (id: string | null) => {
    const s = (searches.data ?? []).find((x) => x.id === id)
    return s ? `${s.role}${s.confidential ? '' : `, ${s.client}`}` : null
  }

  const rows: ListItem[] = [...all]
    .sort((a, b) => Number(needsWriteUp(b)) - Number(needsWriteUp(a)) || b.heldAt.localeCompare(a.heldAt))
    .map((c) => ({
      id: c.id,
      section: needsWriteUp(c) ? 'To write up' : 'Done',
      dot: needsWriteUp(c) ? ('solid' as const) : ('hollow' as const),
      done: !needsWriteUp(c),
      title: c.personName ?? c.title ?? c.callType.replace(/_/g, ' '),
      detail: c.searchId ? (searchName(c.searchId) ?? undefined) : c.callType === 'candidate_screen' ? 'Confirm the search' : c.callType.replace(/_/g, ' '),
      meta: `${writeUpTicks.map((t) => (c[t.key] ? '✓' : '–')).join(' ')}  ${weekdayOf(c.heldAt.slice(0, 10)).slice(0, 3)}`,
      word: c.callType === 'candidate_screen' && !c.wCv && !c.cvRequested ? 'CV' : undefined,
      tone: needsWriteUp(c) ? ('action' as const) : ('clear' as const),
      icon: 'phone' as const,
      onOpen: () => setCard(`call:${c.id}`),
    }))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Searches" tabs={tabs} />
      <div className="grid grid-cols-2 gap-x-8 gap-y-8">
        <HeroStat label="To write up" value={calls.data ? twoDigits(toWrite.length).text : undefined} tone={toWrite.length > 0 ? 'action' : 'clear'} icon="phone" />
        <HeroStat label="New A-star" value={aStar ? `${aStar.total}/${aStar.target ?? 5}` : week.data ? '0/5' : undefined} meter={{ filled: aStar?.total ?? 0, total: aStar?.target ?? 5 }} tone={aStar && aStar.total >= (aStar.target ?? 5) ? 'clear' : 'pending'} icon="sparkle" />
      </div>
      {calls.status === 'loading' ? (
        <Dots />
      ) : calls.status === 'error' ? (
        <EmptyLine text="Could not load. Try again." />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-label text-ink-3">{writeUpTicks.map((t) => t.label.toLowerCase()).join(' . ')}</p>
          <RowList rows={rows} view="rows" emptyText="No calls this week yet." />
        </div>
      )}
      {open && (
        <Card
          key={open.id}
          label={open.callType.replace(/_/g, ' ')}
          title={open.personName ?? open.title ?? 'A call'}
          tone={needsWriteUp(open) ? 'action' : 'clear'}
          sections={[
            {
              body: (
                <div className="flex flex-col gap-2">
                  <p className="font-mono text-label text-ink-2">
                    {open.heldAt.slice(0, 10)} {ukTime(new Date(open.heldAt))}
                    {open.minutes ? `, ${open.minutes} min` : ''}
                    {open.searchId ? `. ${searchName(open.searchId) ?? ''}` : ''}
                  </p>
                  <p className="flex flex-wrap gap-x-6">
                    {open.granolaUrl && <TextLink label="Open the call notes" href={open.granolaUrl} icon="open" />}
                    {open.crmUrl && <TextLink label="Open in CRM" href={open.crmUrl} icon="open" />}
                  </p>
                </div>
              ),
            },
            {
              label: 'Write-up',
              body: (
                <ul className="flex flex-col" aria-label="Write-up checks">
                  {writeUpTicks.map((t) => (
                    <li key={t.key} className="flex min-h-10 items-center gap-3 border-b border-rule">
                      <span aria-hidden className="w-4 font-mono text-ink">{open[t.key] ? '✓' : '–'}</span>
                      <span className={`flex-1 ${open[t.key] ? 'text-ink-3' : 'text-ink'}`}>{t.label}</span>
                      {!open[t.key] && t.key !== 'wOnSearch' && <TextLink label="Done" onClick={() => void patch(open, { [t.key]: true } as CallPatch)} />}
                    </li>
                  ))}
                </ul>
              ),
            },
            ...(!open.wOnSearch || open.matchConfidence === 'low' || open.matchConfidence === 'none'
              ? [
                  {
                    label: 'Confirm the search',
                    body: (
                      <Field
                        label="Which search"
                        kind="choice"
                        value={open.searchId ?? ''}
                        placeholder="Choose"
                        onChange={(v) => v && void patch(open, { searchId: v, matchConfidence: 'confirmed', wOnSearch: true })}
                        choices={live.map((s) => ({ value: s.id, label: `${s.role}${s.confidential ? '' : `, ${s.client}`}` }))}
                      />
                    ),
                  },
                ]
              : []),
            {
              label: 'Or set aside',
              body: (
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {open.skipReason ? (
                    <span className="text-ink-2">Set aside: {open.skipReason}</span>
                  ) : (
                    skipWords.map((w) => <TextLink key={w} label={w} onClick={() => void patch(open, { skipReason: w.toLowerCase() })} />)
                  )}
                </div>
              ),
            },
          ]}
          links={
            <>
              {open.callType === 'candidate_screen' && !open.wCv && !open.cvRequested && <TextLink label="Request CV" icon="mail" onClick={() => void patch(open, { cvRequested: true })} />}
              {open.cvRequested && !open.wCv && <span className="font-mono text-label text-ink-3">CV requested</span>}
            </>
          }
          onClose={() => setCard(null)}
        />
      )}
      {note && <Note text={note} onClose={() => setNote(null)} />}
      <span className="sr-only">{today}</span>
    </div>
  )
}
