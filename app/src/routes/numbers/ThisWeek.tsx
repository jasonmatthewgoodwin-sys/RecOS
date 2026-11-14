import { useEffect, useState, type FormEvent } from 'react'
import { Field } from '../../components/Field'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { Switch } from '../../components/Switch'
import { TextLink } from '../../components/TextLink'
import type { Role } from '../../lib/auth'
import { data, type KpiEvent } from '../../lib/data'
import { isTyping } from '../../lib/keyboard'
import { figure, fraction, inOrder, kpiWord, streakSentence } from '../../lib/numbers'
import { invalidate, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'

// Numbers, This week (32.1): one KPI at a time, large, with a stepper through
// the four. A sentence instead of a trend chart (14.3). Show what counted
// lists the rows behind the number; Correct this number adds a manual event
// (22.4). The All work switch includes non-PMM work (22.5). No chart (3.11).

const WEEK_KEY = 'numbers.week'
const STREAK_KEY = 'numbers.streaks'

function WhatCounted({ kpi, allWork }: { kpi: string; allWork: boolean }) {
  const events = useQuery(`numbers.events.${kpi}`, () => data.kpiEvents(kpi))
  if (events.status === 'loading' && !events.data) return <Dots />
  const rows = (events.data ?? []).filter((e) => allWork || e.isPmm)
  if (rows.length === 0) return <EmptyLine text="Nothing counted yet this week" />
  return (
    <ul className="flex flex-col divide-y divide-rule" aria-label="What counted">
      {rows.map((e) => (
        <li key={e.id} className="flex min-h-10 items-center gap-6 py-2 text-body text-ink">
          <span className="font-mono text-label tabular-nums text-ink-2">{amountWord(e)}</span>
          <span>{e.manual ? `Correction: ${e.reason ?? ''}` : (e.label ?? kpiWord[kpi])}</span>
        </li>
      ))}
    </ul>
  )
}

function amountWord(e: KpiEvent): string {
  if (e.amount === 1) return '+1'
  return e.amount > 0 ? `+${Math.round(e.amount)}` : `−${Math.abs(Math.round(e.amount))}`
}

export function ThisWeek({ role }: { role: Role }) {
  const owner = role === 'owner'
  const weeks = useQuery(WEEK_KEY, data.kpiThisWeek)
  const streaks = useQuery(STREAK_KEY, data.kpiStreaks)
  const [at, setAt] = useState(0)
  const [allWork, setAllWork] = useState(false)
  const [showing, setShowing] = useState<'none' | 'counted' | 'correct' | 'all'>('none')
  const [form, setForm] = useState({ way: 'subtract', count: '1', why: '' })
  const [problem, setProblem] = useState<{ count?: string; why?: string }>({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const tab = sections.find((s) => s.key === 'numbers')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))
  const rows = inOrder(weeks.data ?? [])
  const index = Math.min(at, Math.max(0, rows.length - 1))
  const current = rows[index]
  const streak = current ? streaks.data?.find((s) => s.kpi === current.kpi) : undefined

  function step(by: number) {
    if (rows.length === 0) return
    setAt((index + by + rows.length) % rows.length)
    if (showing === 'counted' || showing === 'correct') setShowing('none')
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!current) return
    const count = Number(form.count)
    const next: typeof problem = {}
    if (!Number.isInteger(count) || count <= 0) next.count = 'A whole number, 1 or more.'
    if (!form.why.trim()) next.why = 'Say why, in a few words.'
    setProblem(next)
    if (next.count || next.why) return
    setBusy(true)
    try {
      await data.correctKpi(current.kpi, form.way === 'subtract' ? -count : count, form.why)
      invalidate('numbers')
      invalidate('home')
      setShowing('none')
      setForm({ way: 'subtract', count: '1', why: '' })
    } catch {
      setNote('That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const shown = current ? figure(current, allWork) : undefined

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <PageHeader title={tab.label} tabs={tabs} />
        <Switch on={allWork} label="All work" onChange={setAllWork} />
      </div>

      {weeks.status === 'error' && !weeks.data && <EmptyLine text="The numbers did not load. Try again in a moment" />}
      {weeks.data && rows.length === 0 && <EmptyLine text="No weekly targets yet. Set them in Settings, Targets" />}

      {(!weeks.data || current) && (
        <div className="flex flex-col gap-10">
          <div className="flex flex-wrap items-start gap-x-16 gap-y-8">
            <HeroStat
              label={current ? kpiWord[current.kpi] ?? current.kpi : 'This week'}
              value={current && shown ? fraction(shown.total, current.target) : undefined}
              mark={current?.hasManual ? 'm' : undefined}
              meter={current && shown ? { filled: shown.total, total: current.target } : undefined}
            />
            <div className="flex min-h-10 items-center gap-4 self-center font-mono text-label text-ink-2" aria-label="Stepper">
              <button type="button" aria-label="Previous" onClick={() => step(-1)} className="flex size-10 items-center justify-center text-body text-ink hover:text-ink-2">
                ‹
              </button>
              <span className="tabular-nums" data-testid="stepper">
                {rows.length ? `${index + 1} of ${rows.length}` : '– of –'}
              </span>
              <button type="button" aria-label="Next" onClick={() => step(1)} className="flex size-10 items-center justify-center text-body text-ink hover:text-ink-2">
                ›
              </button>
            </div>
          </div>

          <p className="max-w-prose text-body text-ink" data-testid="sentence">
            {streakSentence(streak, allWork) || ' '}
          </p>

          {owner && current && (
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <TextLink label={showing === 'counted' ? 'Hide what counted' : 'Show what counted'} onClick={() => setShowing(showing === 'counted' ? 'none' : 'counted')} active={showing === 'counted'} />
              <TextLink label="Correct this number" onClick={() => setShowing(showing === 'correct' ? 'none' : 'correct')} active={showing === 'correct'} />
            </div>
          )}

          {owner && current && showing === 'counted' && <WhatCounted key={current.kpi} kpi={current.kpi} allWork={allWork} />}

          {owner && current && showing === 'correct' && (
            <form onSubmit={save} className="flex max-w-prose flex-col gap-6" aria-label="Correct this number">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <Field
                  label="Add or subtract"
                  kind="choice"
                  value={form.way}
                  onChange={(way) => setForm({ ...form, way })}
                  choices={[
                    { value: 'subtract', label: 'Subtract' },
                    { value: 'add', label: 'Add' },
                  ]}
                />
                <Field label="How many" value={form.count} onChange={(count) => setForm({ ...form, count })} error={problem.count} />
              </div>
              <Field label="Why" value={form.why} onChange={(why) => setForm({ ...form, why })} placeholder="Shown beside the correction" error={problem.why} autoFocus />
              <div className="flex flex-wrap items-center gap-6">
                <PillButton label="Save correction" kind="primary" type="submit" busy={busy} />
                <TextLink label="Cancel" onClick={() => setShowing('none')} />
              </div>
            </form>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <footer className="flex flex-col gap-4 border-t border-rule pt-6">
          <TextLink label={showing === 'all' ? 'One at a time' : 'All four at once'} onClick={() => setShowing(showing === 'all' ? 'none' : 'all')} />
          {showing === 'all' && (
            <ul className="flex flex-col gap-2" aria-label="All four">
              {rows.map((w) => {
                const f = figure(w, allWork)
                return (
                  <li key={w.kpi} className="flex min-h-10 items-center gap-6 text-body text-ink">
                    <span className="w-16 font-mono tabular-nums">
                      {fraction(f.total, w.target)}
                      {w.hasManual ? 'm' : ''}
                    </span>
                    <span className={f.hit ? 'font-medium' : ''}>{kpiWord[w.kpi] ?? w.kpi}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </footer>
      )}

      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
