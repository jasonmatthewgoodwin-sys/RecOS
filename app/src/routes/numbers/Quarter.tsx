import { useCallback, useState } from 'react'
import { HeroStat } from '../../components/HeroStat'
import { NumberLine } from '../../components/NumberLine'
import { PageHeader } from '../../components/PageHeader'
import { EmptyLine } from '../../components/Quiet'
import { Switch } from '../../components/Switch'
import { TextLink } from '../../components/TextLink'
import { data, type KpiQuarter } from '../../lib/data'
import { fraction, kpiWord, outputKpis, outputWord, quarterlyKpis } from '../../lib/numbers'
import { useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'
import { Stepper } from './Stepper'

// Numbers, Quarter (32.2): the quarterly target in view with the same
// stepper, a short table of outputs, and two links at the foot: Show funnel
// (the plain-number funnel of 14.4) and Forecast (14.8). No chart.

const QUARTER_KEY = 'numbers.quarter'

export function Quarter() {
  const quarter = useQuery(QUARTER_KEY, data.kpiQuarter)
  const followUps = useQuery('numbers.followUpsQuarter', data.followUpsQuarter)
  const funnel = useQuery('numbers.funnel', data.bdFunnel)
  const [at, setAt] = useState(0)
  const [allWork, setAllWork] = useState(false)
  const [showing, setShowing] = useState<'none' | 'funnel' | 'forecast'>('none')

  const tab = sections.find((s) => s.key === 'numbers')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))
  const rows = quarter.data ?? []
  const targets = quarterlyKpis.map((k) => rows.find((r) => r.kpi === k)).filter((r): r is KpiQuarter => r !== undefined && r.target !== null)
  const index = Math.min(at, Math.max(0, targets.length - 1))
  const current = targets[index]
  const total = (r: KpiQuarter) => (allWork ? r.total : r.pmmTotal)

  const step = useCallback(
    (by: number) => {
      if (targets.length === 0) return
      setAt((i) => (Math.min(i, targets.length - 1) + by + targets.length) % targets.length)
    },
    [targets.length],
  )

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <PageHeader title={tab.label} tabs={tabs} />
        <Switch on={allWork} label="All work" onChange={setAllWork} />
      </div>

      {quarter.status === 'error' && !quarter.data && <EmptyLine text="The numbers did not load. Try again in a moment" />}
      {quarter.data && targets.length === 0 && <EmptyLine text="No quarterly targets yet. Set them in Settings, Targets" />}

      {(!quarter.data || current) && (
        <div className="flex flex-wrap items-start gap-x-16 gap-y-8">
          <HeroStat
            label={current ? kpiWord[current.kpi] ?? current.kpi : 'This quarter'}
            value={current ? fraction(total(current), current.target ?? 0) : undefined}
            mark={current?.hasManual ? 'm' : undefined}
            meter={current ? { filled: total(current), total: current.target ?? 0 } : undefined}
          />
          <div className="self-center">
            <Stepper index={index} count={targets.length} onStep={step} />
          </div>
        </div>
      )}

      {quarter.data && (
        <table className="max-w-prose border-collapse text-body text-ink" aria-label="Outputs this quarter">
          <thead>
            <tr className="border-b border-rule">
              <th scope="col" className="label-caps py-2 pr-8 text-left font-normal text-ink-2">
                Output
              </th>
              <th scope="col" className="label-caps py-2 text-right font-normal text-ink-2">
                This quarter
              </th>
            </tr>
          </thead>
          <tbody>
            {outputKpis.map((k) => {
              const r = rows.find((x) => x.kpi === k)
              return (
                <tr key={k} className="border-b border-rule">
                  <td className="py-2 pr-8">{outputWord[k]}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{r ? Math.round(total(r)) : '–'}</td>
                </tr>
              )
            })}
            <tr>
              <td className="py-2 pr-8">Follow-ups on time</td>
              <td className="py-2 text-right font-mono tabular-nums">{followUps.data ? `${followUps.data.onTime} of ${followUps.data.completed}` : '–'}</td>
            </tr>
          </tbody>
        </table>
      )}

      <footer className="flex flex-col gap-6 border-t border-rule pt-6">
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <TextLink label="Show funnel" onClick={() => setShowing(showing === 'funnel' ? 'none' : 'funnel')} active={showing === 'funnel'} />
          <TextLink label="Forecast" onClick={() => setShowing(showing === 'forecast' ? 'none' : 'forecast')} active={showing === 'forecast'} />
        </div>
        {showing === 'funnel' && (
          <div className="flex flex-col gap-4">
            {funnel.data ? (
              <NumberLine
                pairs={[
                  { label: 'found', value: funnel.data.found },
                  { label: 'chased', value: funnel.data.chased },
                  { label: 'replied', value: funnel.data.replied },
                  { label: 'meetings', value: funnel.data.meetings },
                  { label: 'won', value: funnel.data.won },
                ]}
                note="last 8 weeks"
                detail={ratios(funnel.data)}
              />
            ) : (
              <EmptyLine text="Loading" />
            )}
            <EmptyLine text="The search funnel arrives with searches, in phase 2" />
          </div>
        )}
        {showing === 'forecast' && <EmptyLine text="The forecast arrives with searches, in phase 2" />}
      </footer>
    </div>
  )
}

/** The second, quiet line: ratios on request (14.4). */
function ratios(f: { found: number; chased: number; replied: number; meetings: number; won: number }): string {
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : '–')
  return `Chased ${pct(f.chased, f.found)} of found. Replied ${pct(f.replied, f.chased)} of chased. Meetings ${pct(f.meetings, f.replied)} of replied. Won ${pct(f.won, f.meetings)} of meetings.`
}
