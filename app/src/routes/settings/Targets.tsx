import { useState, type FormEvent } from 'react'
import { Field } from '../../components/Field'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { EmptyLine } from '../../components/Quiet'
import { TextLink } from '../../components/TextLink'
import { data } from '../../lib/data'
import { invalidate, useQuery } from '../../lib/query'
import { settings } from '../../lib/sections'
import { fromWords, kpiWordAll, periodWord, targetRows } from '../../lib/settings'
import { ukClock } from '../../lib/time'

// Settings, Targets (13.2, 32.4): seven rows, KPI name and target. Clicking
// a number edits it. A change takes effect from the next Monday and the row
// says so (T-SET-4). Past weeks stay judged against the target that applied.

const KEY = 'settings.targets'

export function Targets() {
  const targets = useQuery(KEY, data.targets)
  const [today] = useState(() => ukClock(new Date()).date)
  const [editing, setEditing] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [problem, setProblem] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const tabs = settings.pages.map((p) => ({ label: p.label, route: `${settings.path}/${p.slug}` }))
  const rows = targetRows(targets.data ?? [], today)

  function start(key: string, current: number | undefined) {
    setEditing(key)
    setValue(current === undefined ? '' : String(current))
    setProblem(undefined)
  }

  async function save(e: FormEvent, kpi: string, period: string) {
    e.preventDefault()
    const n = Number(value.trim())
    if (value.trim() === '' || !Number.isFinite(n) || n < 0) {
      setProblem('A number, 0 or more.')
      return
    }
    setBusy(true)
    try {
      await data.setTarget(kpi, period as 'week' | 'quarter' | 'year', n)
      invalidate(KEY)
      invalidate('home')
      invalidate('numbers')
      setEditing(null)
    } catch {
      setNote('That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={settings.label} tabs={tabs} />

      {targets.status === 'error' && !targets.data && <EmptyLine text="The targets did not load. Try again in a moment" />}
      {targets.data && rows.length === 0 && <EmptyLine text="No targets yet" />}

      {rows.length > 0 && (
        <ul className="flex max-w-prose flex-col divide-y divide-rule" aria-label="Targets">
          {rows.map(({ kpi, period, current, next }) => {
            const key = `${kpi}|${period}`
            return (
              <li key={key} className="flex min-h-12 flex-col gap-2 py-2">
                <div className="flex items-center gap-6">
                  <span className="flex-1 text-body text-ink">
                    {kpiWordAll[kpi] ?? kpi} <span className="text-ink-2">{periodWord[period]}</span>
                  </span>
                  {editing === key ? (
                    <form onSubmit={(e) => void save(e, kpi, period)} className="flex items-end gap-4" aria-label={`Target for ${kpiWordAll[kpi] ?? kpi}`}>
                      <div className="w-24">
                        <Field label="Target" value={value} onChange={setValue} error={problem} autoFocus />
                      </div>
                      <PillButton label="Save" kind="primary" type="submit" busy={busy} />
                      <TextLink label="Cancel" onClick={() => setEditing(null)} />
                    </form>
                  ) : (
                    <button type="button" onClick={() => start(key, current?.target)} className="min-h-10 font-mono text-body tabular-nums text-ink underline decoration-rule underline-offset-4 hover:decoration-ink" aria-label={`Change ${kpiWordAll[kpi] ?? kpi}`}>
                      {current ? Math.round(current.target) : '–'}
                    </button>
                  )}
                </div>
                {next && (
                  <p className="font-mono text-label text-ink-2">
                    From {fromWords(next.validFrom)}: {Math.round(next.target)}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="max-w-prose text-body text-ink-2">A change starts on the next Monday. This week is judged on the target that applied on Monday.</p>

      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
