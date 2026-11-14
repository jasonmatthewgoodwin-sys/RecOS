import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Draft } from '../../components/Draft'
import { Field } from '../../components/Field'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { RowList } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { byWiderOrder, daysSince, functionWord, passedThisQuarter, widerIntroduction, widerSourceWord, widerStatusPills, widerStatusWord, widerTitle } from '../../lib/bd'
import { data, type WiderLead, type WiderLeadStatus } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'
import { ukClock } from '../../lib/time'

// Wider business (28.8): two numbers, spotted leads then passed ones
// awaiting an outcome, and a card where passing on needs the colleague and
// the split before the introduction can go (WID-1, WID-2, T-LEAD-4).

const KEY = 'leads.wider'

export function Wider() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [now] = useState(() => new Date())
  const clock = ukClock(now)

  const leads = useQuery(KEY, data.widerLeads)
  const [colleague, setColleague] = useState('')
  const [split, setSplit] = useState('')
  const [problem, setProblem] = useState<{ who?: string; split?: string }>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [note, setNote] = useState<string | null>(null)
  const cardId = params.get('card')?.startsWith('wider:') ? params.get('card')!.slice(6) : null

  const tab = sections.find((s) => s.key === 'leads')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))

  const all = leads.data ?? []
  const spotted = all.filter((w) => w.status === 'spotted')
  const chosen = cardId ? all.find((w) => w.id === cardId) : undefined

  function openCard(id: string) {
    setColleague('')
    setSplit('')
    setProblem({})
    setParams(
      (p) => {
        p.set('card', `wider:${id}`)
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

  function patch(id: string, change: Partial<WiderLead>) {
    setQueryData<WiderLead[]>(KEY, (rows) => (rows ?? []).map((w) => (w.id === id ? { ...w, ...change } : w)))
  }

  async function pass(w: WiderLead) {
    const next: { who?: string; split?: string } = {}
    if (!colleague.trim()) next.who = "Add the colleague's name"
    if (!split.trim()) next.split = 'Agree the split first'
    setProblem(next)
    if (next.who || next.split) return
    const before = leads.data
    patch(w.id, { status: 'passed', passedTo: colleague.trim(), splitNote: split.trim(), passedOn: clock.date })
    try {
      await data.passWiderLead(w.id, colleague.trim(), split.trim())
      invalidate('home')
      closeCard()
    } catch {
      setQueryData<WiderLead[]>(KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  async function setStatus(w: WiderLead, status: WiderLeadStatus) {
    if (status === w.status) return
    if (status === 'passed') {
      setProblem({ who: colleague.trim() ? undefined : "Add the colleague's name", split: split.trim() ? undefined : 'Agree the split first' })
      return
    }
    const before = leads.data
    patch(w.id, { status })
    try {
      await data.setWiderLeadStatus(w.id, status)
    } catch {
      setQueryData<WiderLead[]>(KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  const rows = [...all].sort(byWiderOrder).map((w) => ({
    id: w.id,
    dot: w.status === 'spotted' ? ('solid' as const) : ('hollow' as const),
    title: widerTitle(w),
    detail: `${w.company}, ${w.country}`,
    detailWord: w.existingClient ? 'Existing client' : undefined,
    meta: w.passedTo ? `Passed to ${w.passedTo}` : `${daysSince(w.createdAt.slice(0, 10), clock.date)}d`,
    onOpen: () => openCard(w.id),
  }))

  const intro = (w: WiderLead) => drafts[w.id] ?? widerIntroduction(w, colleague)

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={tab.label} tabs={tabs} />

      <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:flex md:gap-x-16">
        <HeroStat label="To pass on" value={leads.data ? twoDigits(spotted.length).text : undefined} />
        <HeroStat label="Passed this quarter" value={leads.data ? twoDigits(passedThisQuarter(all, clock)).text : undefined} />
      </div>

      <RowList icon="flag" rows={rows} state={leads.status} emptyText="Nothing to pass on" />

      {chosen && (
        <Card
          key={chosen.id}
          label="Wider lead"
          title={widerTitle(chosen)}
          sections={[
            {
              body: (
                <p className="text-ink-2">
                  {chosen.company}, {functionWord[chosen.function] ?? chosen.function}, {chosen.country === 'UK' ? 'UK' : chosen.country === 'US' ? 'US' : 'elsewhere'}
                  {chosen.existingClient ? '. Existing client' : ''}
                </p>
              ),
            },
            {
              label: 'Where it came from',
              body: (
                <p>
                  From {widerSourceWord[chosen.source] ?? chosen.source}
                  {chosen.mentionedByName ? `, mentioned by ${chosen.mentionedByName}` : ''}
                  {chosen.notes ? `. ${chosen.notes}` : ''}
                </p>
              ),
            },
            ...(chosen.status === 'spotted'
              ? [
                  {
                    body: (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          void pass(chosen)
                        }}
                        className="flex max-w-sm flex-col gap-6"
                        aria-label="Pass on"
                      >
                        <Field label="Pass to" value={colleague} onChange={(v) => { setColleague(v); setProblem((p) => ({ ...p, who: undefined })) }} placeholder="Who takes it" error={problem.who} />
                        <Field label="Split" value={split} onChange={(v) => { setSplit(v); setProblem((p) => ({ ...p, split: undefined })) }} placeholder="How the fee is shared" error={problem.split} />
                        <div className="max-w-prose">
                          <Draft label="Introduction" text={intro(chosen)} original={widerIntroduction(chosen, colleague)} onChange={(t) => setDrafts((d) => ({ ...d, [chosen.id]: t }))} />
                        </div>
                      </form>
                    ),
                  },
                ]
              : chosen.passedTo
                ? [{ label: 'Passed', body: <p>To {chosen.passedTo}{chosen.passedOn ? ` on ${chosen.passedOn}` : ''}{chosen.splitNote ? `. ${chosen.splitNote}` : ''}</p> }]
                : []),
            {
              label: 'Status',
              body: (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
                  {widerStatusPills.map((s) => (
                    <PillButton key={s} label={widerStatusWord[s]} current={s === chosen.status} onClick={() => void setStatus(chosen, s)} />
                  ))}
                </div>
              ),
            },
          ]}
          primaryAction={chosen.status === 'spotted' ? { label: 'Pass on', onClick: () => void pass(chosen) } : undefined}
          links={chosen.status === 'spotted' ? <TextLink label="Copy introduction" onClick={() => void navigator.clipboard?.writeText(intro(chosen))} /> : undefined}
          foot="Run it myself arrives with searches in phase 2"
          onClose={closeCard}
        />
      )}

      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
