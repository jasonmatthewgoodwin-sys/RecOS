import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { Dots, EmptyLine } from '../../components/Quiet'
import { RowList, type ListItem } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { daysSince } from '../../lib/bd'
import { data } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { invalidate, useQuery } from '../../lib/query'
import { candidateNeedsDesk, feedbackWord, stageWord } from '../../lib/searches'
import { sections } from '../../lib/sections'
import { ukClock } from '../../lib/time'
import { CANDIDATES_KEY, SEARCHES_KEY } from './Open'

// The three candidate pages under Searches (31.1): In process, Warm specs
// and Placed. Each row links back to the candidate on its search.

function useTabs() {
  const tab = sections.find((s) => s.key === 'searches')!
  return tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))
}

export function InProcess() {
  const navigate = useNavigate()
  const candidates = useQuery(CANDIDATES_KEY, data.searchCandidates)
  const searches = useQuery(SEARCHES_KEY, data.searches)
  const today = ukClock(new Date()).date
  const tabs = useTabs()
  const live = (candidates.data ?? []).filter((c) => c.stage === 'first_stage' || c.stage === 'later_stage' || c.stage === 'offer')
  const atInterview = live.filter((c) => c.stage !== 'offer').length
  const atOffer = live.filter((c) => c.stage === 'offer').length
  const search = (id: string) => (searches.data ?? []).find((s) => s.id === id)
  const rows: ListItem[] = [...live]
    .sort((a, b) => Number(candidateNeedsDesk(b, today)) - Number(candidateNeedsDesk(a, today)) || a.stageChangedOn.localeCompare(b.stageChangedOn))
    .map((c) => {
      const s = search(c.searchId)
      return {
        id: c.id,
        dot: candidateNeedsDesk(c, today) ? ('solid' as const) : ('hollow' as const),
        title: c.name,
        detail: s ? `${s.role}${s.confidential ? '' : `, ${s.client}`}` : undefined,
        meta: `${daysSince(c.stageChangedOn, today)}d`,
        word: feedbackWord(c, today) ?? stageWord[c.stage],
        tone: c.stage === 'offer' ? ('pending' as const) : ('new' as const),
        icon: 'user' as const,
        onOpen: () => navigate(`/searches/open?card=search:${c.searchId}&tab=pipeline&cand=${c.id}`),
      }
    })
  const state = candidates.status === 'error' ? 'error' : candidates.status === 'loading' ? 'loading' : 'ready'
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Searches" tabs={tabs} />
      <div className="grid grid-cols-2 gap-x-8 gap-y-8">
        <HeroStat label="At interview" value={state === 'ready' ? twoDigits(atInterview).text : undefined} tone={atInterview > 0 ? 'new' : undefined} icon="people" />
        <HeroStat label="At offer" value={state === 'ready' ? twoDigits(atOffer).text : undefined} tone={atOffer > 0 ? 'pending' : undefined} icon="check" />
      </div>
      <RowList rows={rows} state={state} variant="avatar" emptyText="Nobody at interview or offer right now." />
    </div>
  )
}

export function WarmSpecs() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const specs = useQuery('searches.warm', data.warmSpecs)
  const [note, setNote] = useState<string | null>(null)
  const tabs = useTabs()
  const cardId = params.get('card')?.startsWith('warm:') ? params.get('card')!.slice(5) : null
  const open = cardId ? (specs.data ?? []).find((w) => w.personId === cardId) : undefined
  const rows: ListItem[] = (specs.data ?? []).map((w) => ({
    id: w.personId,
    dot: w.matches.length > 0 ? ('solid' as const) : ('hollow' as const),
    title: w.name,
    detail: [w.title, w.company].filter(Boolean).join(', '),
    meta: `${w.matches.length} ${w.matches.length === 1 ? 'lead' : 'leads'}`,
    tone: w.matches.length > 0 ? ('new' as const) : ('pending' as const),
    icon: 'user' as const,
    onOpen: () =>
      setParams((p) => {
        p.set('card', `warm:${w.personId}`)
        return p
      }),
  }))
  async function unflag(personId: string) {
    try {
      await data.setWarmSpec(personId, false)
      invalidate('searches.warm')
      setParams((p) => {
        p.delete('card')
        return p
      })
    } catch {
      setNote('That did not save. Try again.')
    }
  }
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Searches" tabs={tabs} />
      <p className="text-body text-ink-2">People worth putting in front of companies. Flag someone from their card under People.</p>
      {specs.status === 'loading' ? <Dots /> : specs.status === 'error' ? <EmptyLine text="Could not load. Try again." /> : <RowList rows={rows} variant="avatar" emptyText="No warm specs flagged yet." />}
      {open && (
        <Card
          key={open.personId}
          label="Warm spec"
          title={open.name}
          tone={open.matches.length > 0 ? 'new' : 'pending'}
          sections={[
            {
              body: (
                <div className="flex flex-col gap-2">
                  <p className="text-ink-2">{[open.title, open.company].filter(Boolean).join(', ')}</p>
                  <p className="flex flex-wrap gap-x-6">
                    {open.crmUrl && <TextLink label="Open in CRM" href={open.crmUrl} icon="open" />}
                    {open.profileUrl && <TextLink label="LinkedIn profile" href={open.profileUrl} icon="open" />}
                  </p>
                </div>
              ),
            },
            {
              label: 'Open leads they match',
              body:
                open.matches.length === 0 ? (
                  <p className="text-ink-3">None yet. The jobs agent matches people to leads as they arrive.</p>
                ) : (
                  <ul className="flex flex-col" aria-label="Matching leads">
                    {open.matches.map((m) => (
                      <li key={m.leadId} className="flex min-h-10 items-center gap-4 border-b border-rule">
                        <span className="flex-1">
                          {m.role}, {m.company}
                        </span>
                        <TextLink label="Open the lead" onClick={() => navigate(`/leads/jobs?card=job:${m.leadId}`)} />
                      </li>
                    ))}
                  </ul>
                ),
            },
          ]}
          links={<TextLink label="Take off the list" onClick={() => void unflag(open.personId)} />}
          onClose={() =>
            setParams((p) => {
              p.delete('card')
              return p
            })
          }
        />
      )}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}

export function Placed() {
  const navigate = useNavigate()
  const candidates = useQuery(CANDIDATES_KEY, data.searchCandidates)
  const searches = useQuery(SEARCHES_KEY, data.searches)
  const today = ukClock(new Date()).date
  const tabs = useTabs()
  const placed = (candidates.data ?? []).filter((c) => c.stage === 'placed')
  const search = (id: string) => (searches.data ?? []).find((s) => s.id === id)
  const rows: ListItem[] = [...placed]
    .sort((a, b) => (a.aftercareOn ?? '').localeCompare(b.aftercareOn ?? ''))
    .map((c) => {
      const s = search(c.searchId)
      const late = Boolean(c.aftercareOn && c.aftercareOn < today)
      return {
        id: c.id,
        dot: late ? ('solid' as const) : ('hollow' as const),
        title: c.name,
        detail: s ? `${s.role}${s.confidential ? '' : `, ${s.client}`}` : undefined,
        meta: c.aftercareOn ? `Aftercare ${c.aftercareOn}` : undefined,
        word: late ? 'Late' : undefined,
        tone: late ? ('action' as const) : ('clear' as const),
        icon: 'check' as const,
        onOpen: () => navigate(`/searches/open?card=search:${c.searchId}&tab=close`),
      }
    })
  const state = candidates.status === 'error' ? 'error' : candidates.status === 'loading' ? 'loading' : 'ready'
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Searches" tabs={tabs} />
      <p className="text-body text-ink-2">Placed candidates and the next aftercare date. A date in the past says Late.</p>
      <RowList rows={rows} state={state} variant="avatar" emptyText="No placements recorded yet." />
    </div>
  )
}
