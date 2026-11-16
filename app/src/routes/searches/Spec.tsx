import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Draft } from '../../components/Draft'
import { Field } from '../../components/Field'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { Dots, EmptyLine } from '../../components/Quiet'
import { RowList, type ListItem } from '../../components/RowList'
import { Switch } from '../../components/Switch'
import { TextLink } from '../../components/TextLink'
import { data, type SpecRequest, type SpokenPerson } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'
import { ukTime } from '../../lib/time'

// Spec (Mia, 16 November 2026): the library of people Jason has spoken to,
// drawn from the calls the Granola agent writes. He marks a good candidate,
// says where the CV is or pastes it, and asks for matches. The research
// agent answers with skills, the live jobs they fit and the clients to
// introduce them to. The CV itself never stays here (rule 1).

export const SPOKEN_KEY = 'searches.spoken'
export const SPECS_KEY = 'searches.specs'

const callWord: Record<string, string> = { candidate_screen: 'Screen', coaching: 'Coaching', interview_prep: 'Interview prep', debrief: 'Debrief', reference: 'Reference', other: 'Call', unknown: 'Call' }

function useTabs() {
  const tab = sections.find((s) => s.key === 'searches')!
  return tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))
}

export function Spec() {
  const [params, setParams] = useSearchParams()
  const people = useQuery(SPOKEN_KEY, data.spokenTo)
  const specs = useQuery(SPECS_KEY, data.specRequests)
  const [note, setNote] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'good' | 'suggested'>('all')
  const tabs = useTabs()

  const all = people.data ?? []
  const byPerson = new Map((specs.data ?? []).map((r) => [r.personId, r]))
  const good = all.filter((p) => p.good)
  const ready = good.filter((p) => byPerson.get(p.personId)?.status === 'ready')
  const shown = filter === 'good' ? good : filter === 'suggested' ? all.filter((p) => p.suggested && !p.good) : all

  const cardId = params.get('card')?.startsWith('spec:') ? params.get('card')!.slice(5) : null
  const open = cardId ? all.find((p) => p.personId === cardId) : undefined

  function setCard(id: string | null) {
    setParams((p) => {
      if (id === null) p.delete('card')
      else p.set('card', `spec:${id}`)
      return p
    })
  }

  async function markGood(p: SpokenPerson, on: boolean) {
    setQueryData<SpokenPerson[]>(SPOKEN_KEY, (rows) => (rows ?? []).map((x) => (x.personId === p.personId ? { ...x, good: on } : x)))
    try {
      await data.setWarmSpec(p.personId, on)
    } catch {
      setQueryData<SpokenPerson[]>(SPOKEN_KEY, (rows) => (rows ?? []).map((x) => (x.personId === p.personId ? { ...x, good: !on } : x)))
      setNote('That did not save. Try again.')
    }
  }

  const rows: ListItem[] = shown.map((p) => {
    const r = byPerson.get(p.personId)
    const matches = r?.result?.matches.length ?? 0
    return {
      id: p.personId,
      dot: p.good ? ('solid' as const) : ('hollow' as const),
      title: p.name,
      detail: [p.title, p.company].filter(Boolean).join(', ') || (p.calls[0]?.summary ?? undefined),
      meta: r?.status === 'ready' ? `${matches} ${matches === 1 ? 'match' : 'matches'}` : r?.status === 'waiting' || r?.status === 'working' ? 'Working' : `Spoke ${p.lastCallOn}`,
      word: p.suggested && !p.good ? 'Suggested' : undefined,
      tone: p.good ? (matches > 0 ? ('new' as const) : ('pending' as const)) : p.suggested ? ('action' as const) : ('clear' as const),
      icon: 'user' as const,
      onOpen: () => setCard(p.personId),
      actions: p.good ? [] : [{ label: 'Good candidate', onClick: () => void markGood(p, true) }],
    }
  })

  const state = people.status === 'error' ? 'error' : people.status === 'loading' ? 'loading' : 'ready'

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Searches" tabs={tabs} />
      <div className="grid grid-cols-2 gap-x-8 gap-y-8">
        <HeroStat label="Good candidates" value={people.data ? twoDigits(good.length).text : undefined} tone={good.length > 0 ? 'pending' : undefined} icon="user" onClick={() => setFilter('good')} />
        <HeroStat label="With matches" value={people.data && specs.data ? twoDigits(ready.length).text : undefined} tone={ready.length > 0 ? 'new' : undefined} icon="check" onClick={() => setFilter('good')} />
      </div>
      <p className="text-body text-ink-2">Everyone you have spoken to, from your calls. Mark a good candidate, then Find matches reads their calls, profile and CV where it lives and comes back with the jobs and clients to put them in front of.</p>
      <nav aria-label="Show" className="flex flex-wrap gap-x-6">
        {(
          [
            ['all', 'Everyone'],
            ['suggested', 'Suggested'],
            ['good', 'Good candidates'],
          ] as const
        ).map(([v, label]) => (
          <TextLink key={v} label={label} active={filter === v} onClick={() => setFilter(v)} />
        ))}
      </nav>
      {state === 'loading' ? <Dots /> : state === 'error' ? <EmptyLine text="Could not load. Try again." /> : <RowList rows={rows} variant="avatar" emptyText={filter === 'all' ? 'No calls written up yet. The call agent fills this in.' : 'Nobody here yet.'} limit={12} />}
      {open && <SpecCard key={open.personId} person={open} request={byPerson.get(open.personId) ?? null} onGood={(on) => void markGood(open, on)} onNote={setNote} onClose={() => setCard(null)} />}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}

function SpecCard({ person: p, request: r, onGood, onNote, onClose }: { person: SpokenPerson; request: SpecRequest | null; onGood: (on: boolean) => void; onNote: (t: string) => void; onClose: () => void }) {
  const navigate = useNavigate()
  const [linkedin, setLinkedin] = useState(p.profileUrl ?? r?.linkedinUrl ?? '')
  const [cvWhere, setCvWhere] = useState<SpecRequest['cvWhere']>(r?.cvWhere ?? (p.crmUrl ? 'spott' : 'none'))
  const [cvText, setCvText] = useState('')
  const [busy, setBusy] = useState(false)
  const working = r?.status === 'waiting' || r?.status === 'working'

  async function find() {
    if (cvWhere === 'pasted' && !cvText.trim()) {
      onNote('Paste the CV text first, or say where it lives.')
      return
    }
    setBusy(true)
    try {
      await data.requestSpec(p.personId, { linkedinUrl: linkedin.trim() || null, cvWhere, cvText: cvWhere === 'pasted' ? cvText : null })
      setCvText('')
      invalidate(SPECS_KEY)
      invalidate(SPOKEN_KEY)
    } catch (e) {
      onNote(e instanceof Error ? e.message : 'That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function openMatch(m: SpecRequest['result'] extends infer T ? (T extends { matches: (infer M)[] } ? M : never) : never) {
    if (m.kind === 'job_lead') navigate(`/leads/jobs?card=job:${m.id}`)
    else if (m.kind === 'search') navigate(`/searches/open?card=search:${m.id}`)
    else navigate('/leads/wider')
  }

  const sections = [
    {
      body: (
        <div className="flex flex-col gap-3">
          <p className="text-ink-2">{[p.title, p.company, p.city?.replace(/_/g, ' ')].filter(Boolean).join(', ') || `Spoke ${p.lastCallOn}`}</p>
          <p className="flex flex-wrap gap-x-6">
            {p.crmUrl && <TextLink label="Open in CRM" href={p.crmUrl} icon="open" />}
            {(p.profileUrl || linkedin) && <TextLink label="LinkedIn profile" href={p.profileUrl ?? linkedin} icon="open" />}
          </p>
          <Switch on={p.good} label="Good candidate" onChange={onGood} />
        </div>
      ),
    },
    {
      label: 'Your calls',
      body: (
        <ul className="flex flex-col" aria-label="Calls with this person">
          {p.calls.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 border-b border-rule py-2">
              <span className="flex flex-wrap items-center gap-x-4">
                <span className="font-mono text-label text-ink-2">
                  {c.heldAt.slice(0, 10)} {ukTime(new Date(c.heldAt))}
                </span>
                <span className="label-caps text-ink-2">{callWord[c.callType] ?? 'Call'}</span>
                {c.granolaUrl && <TextLink label="Open the call notes" href={c.granolaUrl} icon="open" />}
              </span>
              {c.summary && <span className="text-body text-ink">{c.summary}</span>}
            </li>
          ))}
        </ul>
      ),
    },
    {
      label: 'What the agent reads',
      body: (
        <div className="flex flex-col gap-4">
          <Field label="LinkedIn profile" value={linkedin} onChange={setLinkedin} placeholder="https://www.linkedin.com/in/..." />
          <Field
            label="Their CV"
            kind="choice"
            value={cvWhere}
            onChange={(v) => setCvWhere(v as SpecRequest['cvWhere'])}
            choices={[
              { value: 'spott', label: 'In Spott, on their record' },
              { value: 'email', label: 'In the email it arrived on' },
              { value: 'pasted', label: 'Paste the text here' },
              { value: 'none', label: 'No CV yet' },
            ]}
          />
          {cvWhere === 'pasted' && <Draft label="CV text, read once and not kept" text={cvText} onChange={setCvText} />}
          <p className="font-mono text-label text-ink-3">The CV is read where it lives and never stored here. Pasted text goes once the answer is back.</p>
        </div>
      ),
    },
    ...(r
      ? [
          {
            label: r.status === 'ready' ? 'Matches' : r.status === 'failed' ? 'Could not finish' : 'Working',
            body:
              r.status === 'ready' && r.result ? (
                <div className="flex flex-col gap-4">
                  {r.result.summary && <p className="text-body text-ink">{r.result.summary}</p>}
                  {r.result.skills.length > 0 && (
                    <p className="flex flex-wrap gap-2" aria-label="Skills">
                      {r.result.skills.map((sk) => (
                        <span key={sk} className="inline-flex h-8 items-center rounded-pill border border-rule px-3 text-label text-ink-2">
                          {sk}
                        </span>
                      ))}
                    </p>
                  )}
                  {r.result.matches.length === 0 ? (
                    <p className="text-ink-3">Nothing live fits yet. Ask again when new roles land.</p>
                  ) : (
                    <ul className="flex flex-col" aria-label="Matches">
                      {r.result.matches.map((m) => (
                        <li key={`${m.kind}:${m.id}`} className="flex flex-col gap-1 border-b border-rule py-2">
                          <span className="flex flex-wrap items-baseline gap-x-3">
                            <span className="label-caps text-ink-2">{m.kind === 'job_lead' ? 'Job' : m.kind === 'search' ? 'Search' : 'Client'}</span>
                            <span className="text-body text-ink">
                              {m.name}
                              {m.role ? `, ${m.role}` : ''}
                            </span>
                            {m.fit !== null && <span className="font-mono text-label text-ink-3">{m.fit}</span>}
                          </span>
                          <span className="text-body text-ink-2">{m.why}</span>
                          <span>
                            <TextLink label={m.kind === 'account' ? 'Introduce through the account' : 'Open and introduce'} onClick={() => openMatch(m)} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.note && <p className="font-mono text-label text-ink-3">{r.note}</p>}
                  <p className="font-mono text-label text-ink-3">Found {r.finishedAt ? `${r.finishedAt.slice(0, 10)} ${ukTime(new Date(r.finishedAt))}` : ''}</p>
                </div>
              ) : r.status === 'failed' ? (
                <p className="text-ink-2">{r.note ?? 'It could not be done this time.'}</p>
              ) : (
                <p className="text-ink-2">This runs in the background. It will be here when you come back.</p>
              ),
          },
        ]
      : []),
  ]

  return (
    <Card
      label="Spec"
      title={p.name}
      tone={r?.status === 'ready' ? 'new' : p.good ? 'pending' : undefined}
      sections={sections}
      primaryAction={working ? { label: 'Working', onClick: () => {}, busy: true } : { label: r?.status === 'ready' ? 'Find matches again' : 'Find matches', onClick: () => void find(), busy }}
      links={<TextLink label="Back to Spec" icon="arrow" onClick={onClose} />}
      foot="Matches come from the research agent, within about 15 minutes."
      onClose={onClose}
    />
  )
}
