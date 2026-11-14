import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Draft } from '../../components/Draft'
import { Field } from '../../components/Field'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { Switch } from '../../components/Switch'
import { TextLink } from '../../components/TextLink'
import type { Role } from '../../lib/auth'
import { data, type ReviewFields } from '../../lib/data'
import { lastMonday, movedWords, summaryDraft, systemLine, weekLines, weekWords } from '../../lib/numbers'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'
import { shiftDate } from '../../lib/time'
import { Stepper } from './Stepper'

// Numbers, Review (32.3): the page used in the Monday meeting, read top to
// bottom like one sheet of paper. Last week's four lines and what moved come
// from the views; the three notes and the quarterly focus are the owner's and
// save when a field is left; the summary is the A1 email, drafted here from
// the same lines until the agent posts its own. Earlier weeks by the arrows.
// The reviewer reads it only.

const EMPTY: ReviewFields = { learned: '', changes: '', plan: '', quarterlyFocus: '' }

export function Review({ role }: { role: Role }) {
  const owner = role === 'owner'
  const [params, setParams] = useSearchParams()
  const [now] = useState(() => new Date())
  const latest = lastMonday(now)
  const week = /^\d{4}-\d{2}-\d{2}$/.test(params.get('week') ?? '') ? params.get('week')! : latest

  const weeks = useQuery('numbers.weeks', data.kpiWeeks)
  const outputs = useQuery('numbers.outputs', data.kpiOutputWeeks)
  const followUps = useQuery('numbers.followUpsWeeks', data.followUpsWeeks)
  const review = useQuery(`numbers.review.${week}`, () => data.weeklyReview(week))
  const system = useQuery('numbers.system', owner ? data.systemWeeks : async () => [])
  const [allWork, setAllWork] = useState(false)
  const [fields, setFields] = useState<ReviewFields>(EMPTY)
  const [summary, setSummary] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // The notes come from the saved row once it loads, and start blank for a new week.
  useEffect(() => {
    if (review.status === 'ready') {
      const r = review.data
      setFields(r ? { learned: r.learned, changes: r.changes, plan: r.plan, quarterlyFocus: r.quarterlyFocus } : EMPTY)
      setSummary(null)
    }
  }, [review.status, review.data])

  const tab = sections.find((s) => s.key === 'numbers')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))
  // The views hold 12 weeks: this one and the 11 before it (14.2).
  const earliest = shiftDate(latest, -70)
  const weekIndex = Math.max(0, Math.round((new Date(week).getTime() - new Date(earliest).getTime()) / (7 * 86_400_000)))
  const weekCount = Math.max(1, Math.round((new Date(latest).getTime() - new Date(earliest).getTime()) / (7 * 86_400_000)) + 1)

  function step(by: number) {
    const next = shiftDate(week, 7 * by)
    if (next > latest || next < earliest) return
    setParams((p) => {
      if (next === latest) p.delete('week')
      else p.set('week', next)
      return p
    })
  }

  const lines = weekLines(weeks.data ?? [], week, allWork)
  const moved = movedWords(outputs.data ?? [], week, allWork)
  const done = followUps.data?.find((f) => f.week === week)
  const draft = summaryDraft({ week, lines, moved, followUps: done, review: fields })

  async function save() {
    if (!owner) return
    const before = review.data
    setQueryData(`numbers.review.${week}`, () => ({ week, followupBlockMinutes: before?.followupBlockMinutes ?? null, heldOn: before?.heldOn ?? null, ...fields }))
    try {
      await data.saveWeeklyReview(week, fields)
      invalidate('home')
    } catch {
      setNote('That did not save. Try again.')
    }
  }

  const loading = weeks.status === 'loading' && !weeks.data

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <PageHeader title={tab.label} tabs={tabs} />
        <Switch on={allWork} label="All work" onChange={setAllWork} />
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <h2 className="font-mono text-body text-ink" data-testid="week">
          {weekWords(week)}
        </h2>
        <Stepper index={weekIndex} count={weekCount} onStep={step} label="Week" />
      </div>

      {loading && <Dots />}

      {!loading && (
        <section className="flex flex-col gap-4" aria-label="Last week">
          <h3 className="label-caps text-ink-2">Last week</h3>
          {lines.length === 0 && <EmptyLine text="Not logged" />}
          {lines.length > 0 && (
            <ul className="flex max-w-prose flex-col divide-y divide-rule">
              {lines.map((l) => (
                <li key={l.kpi} className="flex min-h-10 items-center gap-6 py-1 text-body text-ink">
                  <span className="flex-1">{l.name}</span>
                  <span className="font-mono tabular-nums">
                    {l.fraction}
                    {l.mark ? 'm' : ''}
                  </span>
                  <span className={`label-caps w-16 text-right ${l.hit ? 'text-ink' : 'text-ink-2'}`}>{l.hit ? 'Hit' : 'Missed'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!loading && (
        <section className="flex flex-col gap-4" aria-label="What moved">
          <h3 className="label-caps text-ink-2">What moved</h3>
          <p className="max-w-prose text-body text-ink">{moved}</p>
          {done && (
            <p className="max-w-prose text-body text-ink">
              Follow-ups on time: {done.onTime} of {done.completed}.
            </p>
          )}
        </section>
      )}

      {owner ? (
        <form className="flex max-w-prose flex-col gap-8" aria-label="Notes" onSubmit={(e) => e.preventDefault()}>
          <Field label="What I learned" kind="lines" rows={3} value={fields.learned} onChange={(learned) => setFields({ ...fields, learned })} onBlur={() => void save()} />
          <Field label="What changes" kind="lines" rows={2} value={fields.changes} onChange={(changes) => setFields({ ...fields, changes })} onBlur={() => void save()} />
          <Field label="Next week" kind="lines" rows={3} value={fields.plan} onChange={(plan) => setFields({ ...fields, plan })} onBlur={() => void save()} />
          <Field
            label="Quarterly focus"
            value={fields.quarterlyFocus}
            onChange={(quarterlyFocus) => setFields({ ...fields, quarterlyFocus })}
            onBlur={() => void save()}
            placeholder="Which quarterly item gets time this week"
          />
        </form>
      ) : (
        <section className="flex max-w-prose flex-col gap-8" aria-label="Notes">
          {[
            ['What I learned', fields.learned],
            ['What changes', fields.changes],
            ['Next week', fields.plan],
            ['Quarterly focus', fields.quarterlyFocus],
          ].map(([label, text]) => (
            <div key={label} className="flex flex-col gap-2">
              <h3 className="label-caps text-ink-2">{label}</h3>
              {text.trim() ? <p className="whitespace-pre-line text-body text-ink">{text}</p> : <EmptyLine text="Nothing written" />}
            </div>
          ))}
        </section>
      )}

      <section className="flex max-w-prose flex-col gap-6" aria-label="Summary">
        <Draft label="Summary" text={summary ?? draft} original={draft} onChange={setSummary} />
        <div className="flex flex-wrap items-center gap-6">
          <PillButton
            label="Copy summary"
            kind="primary"
            onClick={() => {
              void navigator.clipboard?.writeText(summary ?? draft)
              setNote('Copied. Send and Open in Outlook arrive with the send engine.')
            }}
          />
          {week !== latest && <TextLink label="This week's review" onClick={() => step(Math.round((new Date(latest).getTime() - new Date(week).getTime()) / (7 * 86_400_000)))} />}
        </div>
      </section>

      {owner && system.data && (
        <p className="max-w-prose text-body text-ink-3" data-testid="system-line">
          {systemLine(system.data.find((s) => s.week === week))}
        </p>
      )}

      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
