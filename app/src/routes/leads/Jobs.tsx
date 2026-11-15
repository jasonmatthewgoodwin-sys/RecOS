import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { NumberLine } from '../../components/NumberLine'
import { PageHeader } from '../../components/PageHeader'
import { RowList } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { data, type JobLead, type JobStage, type OutreachPatch } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { isTyping } from '../../lib/keyboard'
import {
  byFit,
  cityName,
  daysSince,
  filters,
  funnel,
  funnelPairs,
  funnelRatios,
  isLowerFit,
  matchesFilter,
  type JobFilter,
} from '../../lib/leads'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'
import { ukClock } from '../../lib/time'
import { JobCard, type CardMode } from './JobCard'

// The Jobs page (28.1, 28.2): two numbers, one list, a quiet funnel behind a
// link. A row lifts the job card over the right half of the sheet.

const LEADS_KEY = 'leads.jobs'
const CHASED_KEY = 'leads.chased'

const emptyWords: Record<JobFilter, string> = {
  new: 'No new leads',
  chased: 'No leads chased',
  replied: 'No replies',
  meeting: 'No meetings booked',
  all: 'All clear',
}

function isFilter(value: string | null): value is JobFilter {
  return filters.some((f) => f.value === value)
}

/** Keys j, k and x move between rows and bin the one in focus (25.6). Enter is the row's own click. */
function useRowKeys(enabled: boolean, onBin: (id: string) => void) {
  useEffect(() => {
    if (!enabled) return
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      if (!['j', 'k', 'x'].includes(e.key)) return
      const rows = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-row]'))
      if (rows.length === 0) return
      const at = rows.findIndex((r) => r === document.activeElement)
      if (e.key === 'x') {
        const id = rows[at]?.dataset.leadId
        if (id) onBin(id)
        return
      }
      const next = e.key === 'j' ? Math.min(rows.length - 1, at + 1) : Math.max(0, at - 1)
      rows[next]?.focus()
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, onBin])
}

export function Jobs() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  // Read once when the page opens. Nothing changes while the owner looks at it.
  const [today] = useState(() => ukClock(new Date()).date)

  const leads = useQuery(LEADS_KEY, data.jobLeads)
  const chased = useQuery(CHASED_KEY, data.chasedThisWeek)

  const filter: JobFilter = isFilter(params.get('stage')) ? (params.get('stage') as JobFilter) : 'new'
  const cardId = params.get('card')?.startsWith('job:') ? params.get('card')!.slice(4) : null
  const [mode, setMode] = useState<CardMode>('view')
  // Rows acted on stay where they are until the filter changes, so nothing
  // shifts under the cursor (25.5). The dot and the words change instead.
  const [kept, setKept] = useState<Set<string>>(() => new Set())
  const [note, setNote] = useState<string | null>(null)
  const [showFunnel, setShowFunnel] = useState(false)

  const leadsTab = sections.find((s) => s.key === 'leads')!
  const tabs = leadsTab.pages.map((p) => ({ label: p.label, route: `${leadsTab.path}/${p.slug}` }))

  function setFilter(next: JobFilter) {
    setKept(new Set())
    setParams((p) => {
      if (next === 'new') p.delete('stage')
      else p.set('stage', next)
      p.delete('card')
      return p
    })
  }

  function openCard(id: string, startIn: CardMode = 'view') {
    setMode(startIn)
    setParams(
      (p) => {
        p.set('card', `job:${id}`)
        return p
      },
      { state: { card: true } },
    )
  }

  function closeCard() {
    setMode('view')
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

  function patch(id: string, change: Partial<JobLead>) {
    setQueryData<JobLead[]>(LEADS_KEY, (rows) => (rows ?? []).map((l) => (l.id === id ? { ...l, ...change } : l)))
  }

  // The screen first, the server second. A failed write puts things back and
  // says so once (25.5).
  async function move(lead: JobLead, stage: JobStage, deadReason?: string) {
    const before = leads.data
    setKept((k) => new Set(k).add(lead.id))
    patch(lead.id, {
      stage,
      deadReason: stage === 'dead' ? (deadReason ?? null) : null,
      chasedOn: stage === 'chased' ? (lead.chasedOn ?? today) : lead.chasedOn,
      repliedOn: stage === 'replied' ? (lead.repliedOn ?? today) : lead.repliedOn,
      meetingOn: stage === 'meeting_booked' ? (lead.meetingOn ?? today) : lead.meetingOn,
    })
    try {
      await data.setLeadStage(lead.id, stage, deadReason)
      invalidate(CHASED_KEY)
    } catch {
      setQueryData<JobLead[]>(LEADS_KEY, () => before ?? [])
      setNote('Could not save that. Try again.')
    }
  }

  async function pass(lead: JobLead, colleague: string) {
    const before = leads.data
    setKept((k) => new Set(k).add(lead.id))
    patch(lead.id, { stage: 'passed' })
    try {
      await data.passLead(lead, colleague)
    } catch {
      setQueryData<JobLead[]>(LEADS_KEY, () => before ?? [])
      setNote('Could not pass that. Try again.')
    }
  }

  useRowKeys(cardId === null, (id) => openCard(id, 'bin'))

  const all = leads.data ?? []
  const visible = all.filter((l) => matchesFilter(l, filter) || kept.has(l.id)).sort(byFit)
  const newCount = leads.data === undefined ? undefined : twoDigits(all.filter((l) => l.stage === 'new').length)
  const card = cardId ? all.find((l) => l.id === cardId) : undefined

  // The ladder, by hand: the screen first, the server second (25.5).
  // Add to campaign (Mia, 15 November 2026): the poster enters an email campaign under Content, Campaigns, with the three steps. The hand-off to Spott or SourceWhale waits for their connection (docs/integrations.md).
  async function campaign(l: JobLead) {
    try {
      await data.addCampaign({
        name: `${l.posterName ?? 'The poster'} at ${l.company}`,
        tool: 'email',
        jobLeadId: l.id,
        candidatePersonId: null,
        steps: [
          { channel: 'email', note: `Spec email about the ${l.role} role` },
          { channel: 'phone', note: 'Call if no reply in three working days' },
          { channel: 'linkedin', note: 'Message if the call does not land' },
        ],
      })
      invalidate('content.campaigns')
      setNote(`${l.posterName ?? 'The poster'} is in a campaign. Find it under Content, Campaigns.`)
    } catch {
      setNote('That did not save. Try again.')
    }
  }

  async function outreach(l: JobLead, change: OutreachPatch) {
    const before = leads.data
    const today = ukClock(new Date()).date
    const dated: Partial<JobLead> = { ...change }
    if (change.outreachStage === 'connection_sent') dated.outreachConnectionOn = l.outreachConnectionOn ?? today
    if (change.outreachStage === 'connected') dated.outreachConnectedOn = l.outreachConnectedOn ?? today
    if (change.outreachStage === 'messaged') dated.outreachMessagedOn = l.outreachMessagedOn ?? today
    if (change.outreachStage === 'replied') dated.outreachRepliedOn = l.outreachRepliedOn ?? today
    setQueryData<JobLead[]>(LEADS_KEY, (rows) => (rows ?? []).map((x) => (x.id === l.id ? { ...x, ...dated } : x)))
    try {
      await data.setOutreach(l.id, change)
    } catch {
      setQueryData<JobLead[]>(LEADS_KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  const rows = visible.map((l) => {
    const open = l.stage !== 'dead' && l.stage !== 'passed'
    const actions = []
    if (l.stage === 'new') actions.push({ label: 'Chased', onClick: () => move(l, 'chased') })
    if (open) actions.push({ label: 'Bin', onClick: () => openCard(l.id, 'bin') })
    return {
      id: l.id,
      dot: l.stage === 'new' ? ('solid' as const) : ('hollow' as const),
      tone: !open ? ('clear' as const) : l.stage === 'new' ? ('new' as const) : l.stage === 'replied' ? ('action' as const) : ('pending' as const),
      title: l.role,
      detail: l.company,
      detailWord: l.existingClient ? 'Existing client' : undefined,
      meta: `${cityName(l.city)} ${daysSince(l.firstSeenOn, today)}d`.trim(),
      done: !open,
      section: isLowerFit(l) ? 'Lower fit' : undefined,
      actions,
      onOpen: () => openCard(l.id),
      leadId: l.id,
    }
  })

  const chasedText = chased.data ? (chased.data.target ? `${chased.data.total}/${chased.data.target}` : String(chased.data.total)) : undefined
  const meter = chased.data?.target ? { filled: chased.data.total, total: chased.data.target } : undefined
  const f = funnel(all, today)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={leadsTab.label} tabs={tabs} />

      <div className="grid grid-cols-2 gap-x-8 gap-y-8 md:flex md:gap-x-16">
        <HeroStat label="Chased this week" value={chasedText} meter={meter} onClick={() => setFilter('chased')} />
        <HeroStat label="New" value={newCount?.text} plus={newCount?.plus} onClick={() => setFilter('new')} />
      </div>

      <div className="flex flex-col gap-4">
        <nav aria-label="Show" className="flex flex-wrap gap-x-6">
          {filters.map((fl) => (
            <TextLink key={fl.value} label={fl.label} active={fl.value === filter} onClick={() => setFilter(fl.value)} />
          ))}
        </nav>
        <RowList icon="briefcase" variant="band" rows={rows} state={leads.status} emptyText={emptyWords[filter]} />
      </div>

      {leads.status === 'ready' && (
        <div className="flex flex-col gap-2">
          {showFunnel ? (
            <NumberLine pairs={funnelPairs(f)} note="Last 8 weeks" detail={funnelRatios(f)} />
          ) : (
            <TextLink label="Show funnel" onClick={() => setShowFunnel(true)} />
          )}
        </div>
      )}

      {card && (
        <JobCard
          key={card.id}
          lead={card}
          mode={mode}
          onMode={setMode}
          onStage={(stage, reason) => move(card, stage, reason)}
          onPass={(colleague) => pass(card, colleague)}
          onOutreach={(change) => void outreach(card, change)}
          onCampaign={() => void campaign(card)}
          onClose={closeCard}
        />
      )}

      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
