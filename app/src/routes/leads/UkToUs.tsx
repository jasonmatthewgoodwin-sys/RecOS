import { useNavigate } from 'react-router-dom'
import { HeroStat } from '../../components/HeroStat'
import { PageHeader } from '../../components/PageHeader'
import { Dots, EmptyLine } from '../../components/Quiet'
import { RowList, type ListItem } from '../../components/RowList'
import { daysSince } from '../../lib/bd'
import { data } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { outreachWord } from '../../lib/outreach'
import { signalWord } from '../../lib/people'
import { useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'
import { ukClock } from '../../lib/time'

// UK to US (28.6, and Jason's notes of 14 November 2026): UK-headquartered
// companies hiring product marketers in the US, or likely to. The signals
// agent flags the signals and the jobs agent flags the leads; this page
// gathers both. Ready: flagged and not yet contacted. In conversation:
// a flagged lead past Found on the ladder.

export function UkToUs() {
  const navigate = useNavigate()
  const leads = useQuery('leads.jobs', data.jobLeads)
  const signals = useQuery('people.signals', data.signals)
  const today = ukClock(new Date()).date

  const tab = sections.find((s) => s.key === 'leads')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))

  const flaggedLeads = (leads.data ?? []).filter((l) => l.ukToUs && l.stage !== 'dead' && l.stage !== 'passed')
  const flaggedSignals = (signals.data ?? []).filter((s) => s.ukToUs)
  const ready = flaggedLeads.filter((l) => l.outreachStage === 'found').length + flaggedSignals.length
  const talking = flaggedLeads.filter((l) => l.outreachStage !== 'found').length

  const rows: ListItem[] = [
    ...flaggedLeads.map((l) => ({
      id: `lead:${l.id}`,
      section: 'Leads',
      dot: l.outreachStage === 'found' ? ('hollow' as const) : ('solid' as const),
      title: l.company,
      detail: [l.role, l.posterName].filter(Boolean).join(', '),
      meta: l.outreachStage === 'found' ? `${daysSince(l.firstSeenOn, today)}d` : outreachWord[l.outreachStage],
      word: l.outreachStage !== 'found' ? outreachWord[l.outreachStage] : l.existingClient ? 'Client' : undefined,
      tone: l.outreachStage === 'found' ? ('new' as const) : l.outreachStage === 'replied' ? ('clear' as const) : ('pending' as const),
      icon: 'briefcase' as const,
      onOpen: () => navigate(`/leads/jobs?card=job:${l.id}`),
    })),
    ...flaggedSignals.map((s) => ({
      id: `signal:${s.id}`,
      section: 'Signals',
      dot: 'hollow' as const,
      title: s.company ?? s.personName ?? 'A company',
      detail: [s.personName, s.title].filter(Boolean).join(', '),
      meta: signalWord[s.signalType] ?? s.signalType,
      tone: 'new' as const,
      icon: 'sparkle' as const,
      onOpen: () => navigate(`/people/signals?card=signal:${s.id}`),
    })),
  ]

  const state = leads.status === 'error' || signals.status === 'error' ? 'error' : leads.status === 'loading' || signals.status === 'loading' ? 'loading' : 'ready'

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={tab.label} tabs={tabs} />
      <div className="grid grid-cols-2 gap-x-8 gap-y-8">
        <HeroStat label="Ready" value={state === 'ready' ? twoDigits(ready).text : undefined} tone={ready > 0 ? 'new' : undefined} icon="flag" />
        <HeroStat label="In conversation" value={state === 'ready' ? twoDigits(talking).text : undefined} tone={talking > 0 ? 'pending' : undefined} icon="mail" />
      </div>
      {state === 'loading' ? (
        <Dots />
      ) : state === 'error' ? (
        <EmptyLine text="Could not load. Try again." />
      ) : (
        <RowList rows={rows} variant="band" emptyText="Nothing flagged yet. The signals agent watches UK companies hiring in the US." />
      )}
    </div>
  )
}
