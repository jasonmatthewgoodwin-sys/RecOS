import { useState, type FormEvent, type ReactElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Field } from '../../components/Field'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { Row } from '../../components/Row'
import { RowList, type ListItem } from '../../components/RowList'
import { Switch } from '../../components/Switch'
import { TextLink } from '../../components/TextLink'
import { daysSince } from '../../lib/bd'
import { data, type CandidatePatch, type CandidateStage, type Member, type NewSearch, type OfferStatus, type Search, type SearchCandidate, type SearchNote, type SearchPatch, type SearchPriority } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { briefFields, candidateNeedsDesk, closeChecks, feedbackWord, healthOf, healthWord, inPlay, isLive, numberLine, offerWord, priorityOrder, priorityWord, searchTone, stageOrder, stageWord, statusWord, writeUpTicks } from '../../lib/searches'
import { sections } from '../../lib/sections'
import { ukClock, ukTime } from '../../lib/time'

// Searches (30.1 to 30.8): one short list grouped by priority, two numbers
// at most, and a workspace window per search with its own small tabs,
// Brief, Pipeline, Calls, Offer and Close. Names and clocks only: the CV,
// the compensation and the notes stay in the CRM (CAN-5, T-SRCH-6).

export const SEARCHES_KEY = 'searches.list'
export const CANDIDATES_KEY = 'searches.candidates'
export const CALLS_KEY = 'searches.calls'
export const notesKey = (id: string) => `searches.notes.${id}`

type Tab = 'brief' | 'pipeline' | 'calls' | 'offer' | 'close'
const tabWord: Record<Tab, string> = { brief: 'Brief', pipeline: 'Pipeline', calls: 'Calls', offer: 'Offer', close: 'Close' }

export function Open({ role = 'owner' }: { role?: 'owner' | 'reviewer' }) {
  const [params, setParams] = useSearchParams()
  const searches = useQuery(SEARCHES_KEY, data.searches)
  const candidates = useQuery(CANDIDATES_KEY, data.searchCandidates)
  const today = ukClock(new Date()).date
  const [note, setNote] = useState<string | null>(null)
  const [showDormant, setShowDormant] = useState(false)
  const all = searches.data ?? []
  const cands = candidates.data ?? []
  const reviewer = role === 'reviewer'

  const card = params.get('card')
  const open = card?.startsWith('search:') ? all.find((s) => s.id === card.slice(7)) : undefined
  const adding = card === 'search:new'

  const tab = sections.find((s) => s.key === 'searches')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))

  function setCard(v: string | null) {
    setParams((p) => {
      if (v === null) {
        p.delete('card')
        p.delete('cand')
        p.delete('tab')
      } else p.set('card', v)
      return p
    })
  }

  async function patch(s: Search, change: SearchPatch) {
    const before = searches.data
    setQueryData<Search[]>(SEARCHES_KEY, (rows) => (rows ?? []).map((x) => (x.id === s.id ? { ...x, ...change } : x)))
    try {
      await data.updateSearch(s.id, change)
      invalidate('home')
    } catch {
      setQueryData<Search[]>(SEARCHES_KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  // On hold sits with dormant so nothing paused drops out of sight.
  const shown = all.filter((s) => isLive(s) || s.status === 'on_hold').map((s) => {
    const h = healthOf(s, today)
    return { ...s, health: s.health === 'cold' || h.health === 'cold' ? ('cold' as const) : s.health === 'cooling' || h.health === 'cooling' ? ('cooling' as const) : ('warm' as const), healthReason: s.healthReason ?? h.reason }
  })
  const live = shown.filter(isLive)
  const cold = live.filter((s) => s.health === 'cold')

  const rows: ListItem[] = priorityOrder
    .flatMap((pr): ListItem[] => {
      const group = shown.filter((s) => (pr === 'dormant' ? s.priority === pr || s.status === 'on_hold' : s.priority === pr && s.status !== 'on_hold')).sort((a, b) => a.openedOn.localeCompare(b.openedOn))
      if (pr === 'dormant' && !showDormant && group.length > 0) {
        return [{ id: 'dormant', section: priorityWord.dormant, dot: 'hollow' as const, title: `${group.length} dormant`, detail: 'Click to show', done: true, onOpen: () => setShowDormant(true) } as ListItem]
      }
      return group.map((s) => ({
        id: s.id,
        section: priorityWord[pr],
        dot: s.health === 'warm' ? ('hollow' as const) : ('solid' as const),
        title: s.role,
        detail: s.confidential ? 'Confidential' : s.client,
        meta: `${numberLine(s)}  ${daysSince(s.openedOn, today)}d`,
        word: s.status === 'on_hold' ? 'On hold' : s.health === 'warm' ? (s.status === 'offer' ? 'At offer' : undefined) : healthWord[s.health],
        tone: searchTone(s),
        icon: 'search' as const,
        onOpen: reviewer ? undefined : () => setCard(`search:${s.id}`),
        actions: reviewer ? [] : [{ label: 'Open', onClick: () => setCard(`search:${s.id}`) }],
      }))
    })
    .filter(Boolean)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Searches" tabs={tabs} aside={reviewer ? undefined : <TextLink label="New search" icon="plus" onClick={() => setCard('search:new')} />} />
      <div className="grid grid-cols-2 gap-x-8 gap-y-8">
        <HeroStat label="Live" value={searches.data ? twoDigits(live.length).text : undefined} tone={live.length > 0 ? 'pending' : undefined} icon="search" />
        {cold.length > 0 && <HeroStat label="Cold" value={twoDigits(cold.length).text} tone="action" icon="flag" />}
      </div>
      {searches.status === 'loading' ? (
        <Dots />
      ) : searches.status === 'error' ? (
        <EmptyLine text="Could not load. Try again." />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-label text-ink-3">spoken . submitted . interviewing . offer, then days open</p>
          <RowList rows={rows} emptyText="No live searches. New search starts one." limit={40} />
        </div>
      )}
      {open && !reviewer && (
        <Workspace
          key={open.id}
          search={shown.find((s) => s.id === open.id) ?? open}
          candidates={cands.filter((c) => c.searchId === open.id)}
          today={today}
          onPatch={(change) => void patch(open, change)}
          onNote={setNote}
          onClose={() => setCard(null)}
        />
      )}
      {adding && !reviewer && (
        <NewSearchCard
          onAdd={async (input) => {
            try {
              const made = await data.addSearch(input)
              invalidate(SEARCHES_KEY)
              setParams((p) => {
                p.set('card', `search:${made.id}`)
                p.set('tab', 'brief')
                return p
              })
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

function NewSearchCard({ onAdd, onClose }: { onAdd: (input: NewSearch) => Promise<void>; onClose: () => void }) {
  const [v, setV] = useState({ client: '', role: '', function: 'pmm', crmUrl: '', priority: 'active' as SearchPriority })
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Card
      label="Search"
      title="New search"
      tone="new"
      sections={[
        {
          body: (
            <form
              className="flex flex-col gap-4"
              aria-label="New search"
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                if (!v.client.trim() || !v.role.trim()) {
                  setProblem('Client and role are needed')
                  return
                }
                setBusy(true)
                void onAdd({ client: v.client, role: v.role, function: v.function, crmUrl: v.crmUrl.trim() || null, priority: v.priority }).finally(() => setBusy(false))
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Client" value={v.client} onChange={(x) => setV({ ...v, client: x })} autoFocus error={problem && !v.client.trim() ? problem : undefined} />
                <Field label="Role" value={v.role} onChange={(x) => setV({ ...v, role: x })} error={problem && !v.role.trim() ? problem : undefined} />
                <Field label="Function" kind="choice" value={v.function} onChange={(x) => setV({ ...v, function: x })} choices={[{ value: 'pmm', label: 'Product marketing' }, { value: 'marketing', label: 'Marketing, wider' }, { value: 'other', label: 'Other' }]} />
                <Field label="Priority" kind="choice" value={v.priority} onChange={(x) => setV({ ...v, priority: x as SearchPriority })} choices={priorityOrder.map((p) => ({ value: p, label: priorityWord[p] }))} />
                <Field label="CRM link" value={v.crmUrl} onChange={(x) => setV({ ...v, crmUrl: x })} placeholder="https://" />
              </div>
              <p className="font-mono text-label text-ink-3">Everything else is filled in later, in the workspace.</p>
              <div>
                <PillButton label="Start the search" type="submit" kind="primary" busy={busy} />
              </div>
            </form>
          ),
        },
      ]}
      onClose={onClose}
    />
  )
}

type WorkspaceProps = {
  search: Search
  candidates: SearchCandidate[]
  today: string
  onPatch: (change: SearchPatch) => void
  onNote: (text: string) => void
  onClose: () => void
}

// The workspace (30.2, 30.3): one window, small tabs, one page at a time.
export function Workspace({ search: s, candidates, today, onPatch, onNote, onClose }: WorkspaceProps) {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && tabParam in tabWord ? tabParam : candidates.length > 0 ? 'pipeline' : 'brief'
  const candId = params.get('cand')
  const cand = candId ? candidates.find((c) => c.id === candId) : undefined
  const notes = useQuery(notesKey(s.id), () => data.searchNotes(s.id))
  const calls = useQuery(CALLS_KEY, data.calls)

  function setTab(t: Tab) {
    setParams((p) => {
      p.set('tab', t)
      p.delete('cand')
      return p
    })
  }
  function setCand(id: string | null) {
    setParams((p) => {
      if (id === null) p.delete('cand')
      else p.set('cand', id)
      return p
    })
  }

  async function patchCand(c: SearchCandidate, change: CandidatePatch) {
    const before = candidates
    setQueryData<SearchCandidate[]>(CANDIDATES_KEY, (rows) => (rows ?? []).map((x) => (x.id === c.id ? { ...x, ...change, ...(change.stage && change.stage !== x.stage ? { stageChangedOn: today } : {}) } : x)))
    try {
      await data.updateCandidate(c.id, change)
      invalidate(CANDIDATES_KEY)
      invalidate(SEARCHES_KEY)
      invalidate('home')
    } catch (e) {
      setQueryData<SearchCandidate[]>(CANDIDATES_KEY, (rows) => (rows ?? []).map((x) => before.find((b) => b.id === x.id) ?? x))
      onNote(e instanceof Error && /Agreed to be put forward/.test(e.message) ? 'Agreed to be put forward must be on first.' : 'That did not save. Try again.')
    }
  }

  const brief = notes.data?.find((n) => n.tab === 'brief') ?? null
  const close = notes.data?.find((n) => n.tab === 'close_out') ?? null
  const myCalls = (calls.data ?? []).filter((c) => c.searchId === s.id)
  const days = daysSince(s.openedOn, today)

  const header = (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2">
        {s.confidential ? 'Confidential' : s.client}
        {s.city ? `, ${s.city.replace(/_/g, ' ')}` : ''}, day {days}. {statusWord[s.status]}
        {s.health !== 'warm' ? `, ${healthWord[s.health].toLowerCase()}` : ''}
        {s.healthReason ? ` (${s.healthReason.toLowerCase()})` : ''}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Priority">
        {priorityOrder.map((p) => (
          <button key={p} type="button" aria-current={s.priority === p || undefined} onClick={() => onPatch({ priority: p })} className={`inline-flex h-9 items-center rounded-pill border px-3 text-label ${s.priority === p ? 'border-ink bg-ink text-sheet' : 'border-rule text-ink-2 hover:border-ink hover:text-ink'}`}>
            {priorityWord[p]}
          </button>
        ))}
        {s.crmUrl && <TextLink label="Open in CRM" href={s.crmUrl} icon="open" />}
      </div>
      <nav className="flex flex-wrap gap-x-5" aria-label="Workspace">
        {(Object.keys(tabWord) as Tab[]).map((t) => (
          <button key={t} type="button" aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)} className={`label-caps min-h-8 border-b-2 ${tab === t ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}>
            {tabWord[t]}
          </button>
        ))}
      </nav>
    </div>
  )

  let body: ReactElement
  let primary: { label: string; onClick: () => void } | undefined
  if (tab === 'brief') {
    body = <BriefTab search={s} note={brief} loading={notes.status === 'loading' && !notes.data} onSaved={() => invalidate(notesKey(s.id))} onNote={onNote} />
  } else if (tab === 'pipeline') {
    body = cand ? (
      <CandidateView c={cand} today={today} onBack={() => setCand(null)} onPatch={(change) => void patchCand(cand, change)} />
    ) : (
      <PipelineTab search={s} candidates={candidates} today={today} onOpen={(id) => setCand(id)} onAdded={() => invalidate(CANDIDATES_KEY)} onNote={onNote} />
    )
  } else if (tab === 'calls') {
    body = (
      <div className="flex flex-col gap-2">
        <p className="font-mono text-label text-ink-3">{writeUpTicks.map((t) => t.label).join(' . ')}</p>
        {calls.status === 'loading' && !calls.data ? (
          <Dots />
        ) : myCalls.length === 0 ? (
          <p className="text-ink-3">No calls on this search yet.</p>
        ) : (
          <ul className="flex flex-col" aria-label="Calls on this search">
            {myCalls.map((c) => (
              <li key={c.id} className="flex min-h-11 items-center gap-4 border-b border-rule">
                <span className="font-mono text-label text-ink-2">{c.heldAt.slice(0, 10)} {ukTime(new Date(c.heldAt))}</span>
                <span className="min-w-0 flex-1 truncate">{c.personName ?? c.title ?? c.callType.replace(/_/g, ' ')}</span>
                <span className="font-mono text-label text-ink" aria-label="Write-up">
                  {writeUpTicks.map((t) => (c[t.key] ? '✓' : '–')).join(' ')}
                </span>
                {(c.matchConfidence === 'low' || c.matchConfidence === 'none') && <span className="label-caps text-ink">Confirm</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  } else if (tab === 'offer') {
    const atOffer = candidates.filter((c) => c.stage === 'offer' || c.stage === 'placed')
    body = atOffer.length === 0 ? <p className="text-ink-3">Nobody at offer yet.</p> : (
      <div className="flex flex-col gap-6">
        {atOffer.map((c) => (
          <OfferCard key={c.id} c={c} crmUrl={s.crmUrl} onPatch={(change) => void patchCand(c, change)} />
        ))}
      </div>
    )
  } else {
    body = <CloseTab search={s} note={close} onSaved={() => invalidate(notesKey(s.id))} onNote={onNote} />
  }

  return (
    <Card
      label={s.confidential ? 'Confidential search' : s.client}
      title={s.role}
      tone={searchTone(s)}
      sections={[{ body: header }, { body }]}
      primaryAction={primary}
      links={
        <>
          {s.status !== 'placed' && s.status !== 'closed' && s.status !== 'lost' && <TextLink label="On hold" onClick={() => onPatch({ status: s.status === 'on_hold' ? 'open' : 'on_hold' })} />}
          {s.status !== 'placed' && s.status !== 'lost' && <TextLink label="Lost" onClick={() => onPatch({ status: 'lost' })} />}
          <TextLink label="Back to searches" icon="arrow" onClick={onClose} />
        </>
      }
      foot={`Opened ${s.openedOn}${s.firstSubmissionOn ? `, first shortlist ${s.firstSubmissionOn}` : ''}${s.placedOn ? `, placed ${s.placedOn}` : ''}`}
      onClose={onClose}
    />
  )
}

function BriefTab({ search: s, note, loading, onSaved, onNote }: { search: Search; note: SearchNote | null; loading: boolean; onSaved: () => void; onNote: (t: string) => void }) {
  const [fields, setFields] = useState<Record<string, string>>(() => Object.fromEntries(briefFields.map((f) => [f.key, String((note?.structured as Record<string, unknown> | null)?.[f.key] ?? '')])))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  if (loading) return <Dots />
  const missing = briefFields.filter((f) => !fields[f.key]?.trim())
  async function save() {
    setBusy(true)
    try {
      const content = briefFields.filter((f) => fields[f.key]?.trim()).map((f) => `${f.label}: ${fields[f.key].trim()}`).join('\n')
      await data.saveSearchNote(s.id, 'brief', content, fields)
      setSaved(true)
      onSaved()
    } catch {
      onNote('That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-4"
      aria-label="Brief"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {briefFields.map((f) => (
          <Field key={f.key} label={f.label} kind="lines" rows={2} value={fields[f.key] ?? ''} onChange={(v) => { setFields((x) => ({ ...x, [f.key]: v })); setSaved(false) }} />
        ))}
      </div>
      {missing.length > 0 && (
        <p className="font-mono text-label text-ink-3" data-testid="still-to-ask">
          Still to ask: {missing.map((f) => f.label.toLowerCase()).join(', ')}
        </p>
      )}
      <div>
        <PillButton label={saved ? 'Saved' : 'Save'} type="submit" kind="primary" busy={busy} />
      </div>
    </form>
  )
}

function PipelineTab({ search: s, candidates, today, onOpen, onAdded, onNote }: { search: Search; candidates: SearchCandidate[]; today: string; onOpen: (id: string) => void; onAdded: () => void; onNote: (t: string) => void }) {
  const [adding, setAdding] = useState(false)
  const members = useQuery('people.members', data.members)
  const play = candidates.filter((c) => inPlay.includes(c.stage))
  const waiting = candidates.filter((c) => c.stage === 'submitted' && !c.feedbackReceivedOn).length
  const groups = [...stageOrder].reverse().map((st) => ({ stage: st, rows: candidates.filter((c) => c.stage === st) })).filter((g) => g.rows.length > 0)
  const inSearch = new Set(candidates.map((c) => c.personId))
  async function add(m: Member) {
    try {
      await data.addCandidate(s.id, m.personId)
      setAdding(false)
      onAdded()
    } catch {
      onNote('That did not save. Try again.')
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-label text-ink-2">
        {play.length} in play, {waiting} waiting on feedback
      </p>
      {groups.length === 0 && <p className="text-ink-3">Nobody in play yet. Add someone from People.</p>}
      {groups.map((g) => (
        <section key={g.stage} className="flex flex-col gap-1" aria-label={stageWord[g.stage]}>
          <h4 className="label-caps text-ink-2">{stageWord[g.stage]}</h4>
          <ul className="flex flex-col">
            {g.rows.map((c) => (
              <Row key={c.id} dot={candidateNeedsDesk(c, today) ? 'solid' : 'hollow'} title={c.name} detail={[c.title, c.company].filter(Boolean).join(', ')} meta={`${daysSince(c.stageChangedOn, today)}d`} word={feedbackWord(c, today)} done={c.stage === 'rejected' || c.stage === 'withdrew'} onOpen={() => onOpen(c.id)} />
            ))}
          </ul>
        </section>
      ))}
      <div className="flex flex-wrap gap-6">
        <TextLink label={adding ? 'Hide people' : 'Add from People'} icon="plus" onClick={() => setAdding((a) => !a)} />
      </div>
      {adding && (
        <ul className="flex flex-col" aria-label="People to add">
          {(members.data ?? [])
            .filter((m) => !inSearch.has(m.personId))
            .slice(0, 12)
            .map((m) => (
              <Row key={m.id} dot="hollow" title={m.name} detail={[m.title, m.company].filter(Boolean).join(', ')} actions={[{ label: 'Add', onClick: () => void add(m) }]} onOpen={() => void add(m)} />
            ))}
        </ul>
      )}
    </div>
  )
}

/** The candidate-on-search card (30.4), inside the workspace. */
function CandidateView({ c, today, onBack, onPatch }: { c: SearchCandidate; today: string; onBack: () => void; onPatch: (change: CandidatePatch) => void }) {
  const [reason, setReason] = useState('')
  const [asking, setAsking] = useState<'rejected' | 'withdrew' | null>(null)
  const [interview, setInterview] = useState(c.nextInterviewAt ? c.nextInterviewAt.slice(0, 16) : '')
  const primaryWord = c.stage === 'spoken' || c.stage === 'sourced' ? 'Send confirmation' : c.stage === 'submitted' ? 'Nudge client' : c.stage === 'first_stage' || c.stage === 'later_stage' ? (c.prepSent ? 'Call after interview' : 'Send prep') : null
  const choosable: CandidateStage[] = ['sourced', 'spoken', 'submitted', 'first_stage', 'later_stage', 'offer']
  return (
    <div className="flex flex-col gap-4" data-candidate={c.id}>
      <TextLink label="Back to the pipeline" icon="arrow" onClick={onBack} />
      <div>
        <h3 className="text-body text-ink">{c.name}</h3>
        <p className="text-ink-2">{[c.title, c.company].filter(Boolean).join(', ')}</p>
        <p className="flex flex-wrap gap-x-6">
          {c.crmUrl && <TextLink label="Open in CRM" href={c.crmUrl} icon="open" />}
          {c.profileUrl && <TextLink label="LinkedIn profile" href={c.profileUrl} icon="open" />}
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Stage">
        {choosable.map((st) => (
          <button key={st} type="button" aria-current={c.stage === st || undefined} onClick={() => st !== c.stage && onPatch({ stage: st })} className={`inline-flex h-9 items-center rounded-pill border px-3 text-label ${c.stage === st ? 'border-ink bg-ink text-sheet' : 'border-rule text-ink-2 hover:border-ink hover:text-ink'}`}>
            {stageWord[st]}
          </button>
        ))}
        {(c.stage === 'placed' || c.stage === 'rejected' || c.stage === 'withdrew') && <span className="label-caps self-center text-ink">{stageWord[c.stage]}</span>}
      </div>
      <Switch on={c.consentToSubmit} label="Agreed to be put forward" onChange={(on) => onPatch({ consentToSubmit: on })} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 font-mono text-label text-ink-2">
        <dt>Submitted</dt>
        <dd>{c.submittedOn ?? '–'}</dd>
        <dt>Feedback</dt>
        <dd>{c.feedbackReceivedOn ?? (c.submittedOn ? feedbackWord(c, today) ?? 'Waiting' : '–')}</dd>
        <dt>Last contact</dt>
        <dd>{c.lastCandidateContactOn ?? '–'}</dd>
      </dl>
      {c.stage === 'submitted' && !c.feedbackReceivedOn && <TextLink label="Feedback came in" onClick={() => onPatch({ feedbackReceivedOn: today })} />}
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Next interview" value={interview} onChange={setInterview} placeholder="2026-11-20T15:00" onBlur={() => interview !== (c.nextInterviewAt?.slice(0, 16) ?? '') && onPatch({ nextInterviewAt: interview ? new Date(interview).toISOString() : null })} />
        <Switch on={c.prepSent} label="Prep sent" onChange={(on) => onPatch({ prepSent: on })} />
      </div>
      <div className="flex flex-wrap items-center gap-6">
        {primaryWord && <PillButton label={primaryWord} kind="primary" onClick={() => onPatch({ lastCandidateContactOn: today, ...(primaryWord === 'Send prep' ? { prepSent: true } : {}) })} />}
        {inPlay.includes(c.stage) && asking === null && (
          <>
            <TextLink label="Rejected" onClick={() => setAsking('rejected')} />
            <TextLink label="Withdrew" onClick={() => setAsking('withdrew')} />
          </>
        )}
      </div>
      {asking && (
        <form
          className="flex flex-wrap items-end gap-4"
          aria-label={asking === 'rejected' ? 'Rejected' : 'Withdrew'}
          onSubmit={(e) => {
            e.preventDefault()
            if (!reason.trim()) return
            onPatch({ stage: asking, outcomeReason: reason.trim() })
            setAsking(null)
          }}
        >
          <Field label="In a line, why" value={reason} onChange={setReason} autoFocus />
          <PillButton label={asking === 'rejected' ? 'Mark rejected' : 'Mark withdrew'} type="submit" />
          <TextLink label="Keep them in" onClick={() => setAsking(null)} />
        </form>
      )}
      <p className="font-mono text-label text-ink-3">No CV, note or pay here. Open in CRM is where those are read.</p>
    </div>
  )
}

/** The offer card (30.7). Accepted moves the search to placed. */
function OfferCard({ c, crmUrl, onPatch }: { c: SearchCandidate; crmUrl: string | null; onPatch: (change: CandidatePatch) => void }) {
  const [v, setV] = useState({ decisionDueOn: c.decisionDueOn ?? '', startOn: c.startOn ?? '', risks: c.risks ?? '', wouldSwing: c.wouldSwing ?? '' })
  const statuses: OfferStatus[] = ['expected', 'verbal', 'written', 'accepted', 'declined']
  return (
    <div className="flex flex-col gap-4" data-offer={c.id}>
      <h4 className="text-body text-ink">{c.name}</h4>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Offer status for ${c.name}`}>
        {statuses.map((st) => (
          <button key={st} type="button" aria-current={c.offerStatus === st || undefined} onClick={() => c.offerStatus !== st && onPatch({ offerStatus: st })} className={`inline-flex h-9 items-center rounded-pill border px-3 text-label ${c.offerStatus === st ? 'border-ink bg-ink text-sheet' : 'border-rule text-ink-2 hover:border-ink hover:text-ink'}`}>
            {offerWord[st]}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Decision due" kind="date" value={v.decisionDueOn} onChange={(x) => setV({ ...v, decisionDueOn: x })} onBlur={() => v.decisionDueOn !== (c.decisionDueOn ?? '') && onPatch({ decisionDueOn: v.decisionDueOn || null })} />
        <Field label="Start date" kind="date" value={v.startOn} onChange={(x) => setV({ ...v, startOn: x })} onBlur={() => v.startOn !== (c.startOn ?? '') && onPatch({ startOn: v.startOn || null })} />
        <Field label="Risks" value={v.risks} onChange={(x) => setV({ ...v, risks: x })} onBlur={() => v.risks !== (c.risks ?? '') && onPatch({ risks: v.risks || null })} />
        <Field label="What would swing it" value={v.wouldSwing} onChange={(x) => setV({ ...v, wouldSwing: x })} onBlur={() => v.wouldSwing !== (c.wouldSwing ?? '') && onPatch({ wouldSwing: v.wouldSwing || null })} />
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <span className="font-mono text-label text-ink-2">
          References {c.referencesTaken} of {c.referencesNeeded} taken
        </span>
        {c.referencesTaken < c.referencesNeeded && <TextLink label="Add reference" onClick={() => onPatch({ referencesTaken: c.referencesTaken + 1 })} />}
        <Switch on={c.competingProcess} label="Competing process" onChange={(on) => onPatch({ competingProcess: on })} />
        {crmUrl && <TextLink label="See terms in the CRM" href={crmUrl} icon="open" />}
      </div>
    </div>
  )
}

function CloseTab({ search: s, note, onSaved, onNote }: { search: Search; note: SearchNote | null; onSaved: () => void; onNote: (t: string) => void }) {
  const [ticks, setTicks] = useState<Record<string, boolean>>(() => Object.fromEntries(closeChecks.map((c) => [c.key, Boolean((note?.structured as Record<string, unknown> | null)?.[c.key])])))
  async function toggle(key: string) {
    const next = { ...ticks, [key]: !ticks[key] }
    setTicks(next)
    try {
      await data.saveSearchNote(s.id, 'close_out', closeChecks.filter((c) => next[c.key]).map((c) => c.label).join('\n'), next)
      onSaved()
    } catch {
      onNote('That did not save. Try again.')
    }
  }
  const done = closeChecks.filter((c) => ticks[c.key]).length
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-label text-ink-2">
        {done} of {closeChecks.length} done
      </p>
      <ul className="flex flex-col" aria-label="Close checklist">
        {closeChecks.map((c) => (
          <li key={c.key} className="flex min-h-11 items-center gap-3 border-b border-rule">
            <button type="button" role="checkbox" aria-checked={ticks[c.key] || false} onClick={() => void toggle(c.key)} className="flex min-h-11 flex-1 items-center gap-3 text-left">
              <span aria-hidden className={`block size-3 rounded-pill border border-ink ${ticks[c.key] ? 'bg-ink' : 'bg-transparent'}`} />
              <span className={ticks[c.key] ? 'text-ink-3' : 'text-ink'}>{c.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
