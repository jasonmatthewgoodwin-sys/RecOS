import { useEffect, useState } from 'react'
import { Field } from '../../components/Field'
import { PillButton } from '../../components/PillButton'
import { TextLink } from '../../components/TextLink'
import { cleanAnswers, data, matchQuestions, requestSearchJob, searchJobs, type MatchAnswers, type MatchCandidate, type MatchResult, type Search, type SearchCandidate, type SearchNote } from '../../lib/data'
import { invalidate, useQuery } from '../../lib/query'
import { latestJobs } from '../../lib/searchResearch'
import { ukTime } from '../../lib/time'

// Recommended candidates (Jason, 18 November 2026). He says what a good
// candidate looks like in five short answers, filled from the brief where it
// can be; the research agent reads the people he already knows (his calls,
// spec requests and pipelines) and answers with who fits, why and the gaps.
// Add to pipeline puts someone in Sourced; Not for this one hides them on
// this search only. The agent runs weekdays at 08:00, 12:00 and 16:00.

const jobsKey = (id: string) => `searches.jobs.${id}`
const fitWord = { strong: 'Strong fit', good: 'Good fit', maybe: 'Maybe' } as const

/** The five answers, from the last ask or else from the brief and the map. */
function answersFrom(search: Search, notes: SearchNote[], last: MatchAnswers | null | undefined): MatchAnswers {
  if (last && Object.keys(cleanAnswers(last)).length > 0) return { ...last }
  const brief = (notes.find((n) => n.tab === 'brief')?.structured ?? {}) as Record<string, unknown>
  const map = (notes.find((n) => n.tab === 'map')?.structured ?? {}) as { tiers?: { tier: number; companies: { name: string }[] }[]; poach_from?: { name: string }[] }
  const text = (k: string) => (typeof brief[k] === 'string' ? (brief[k] as string).trim() : '')
  const firstTier = map.poach_from?.map((c) => c.name) ?? map.tiers?.find((t) => t.tier === 1)?.companies.map((c) => c.name) ?? []
  return {
    must_haves: text('must_have'),
    nice_to_haves: text('nice_to_have'),
    target_backgrounds: firstTier.slice(0, 8).join(', '),
    deal_breakers: text('deal_breakers'),
    level_and_location: [text('comp_band'), text('location') || search.location || ''].filter(Boolean).join('. '),
  }
}

type Props = {
  search: Search
  notes: SearchNote[]
  candidates: SearchCandidate[]
  onAdded: () => void
  onNote: (t: string) => void
}

export function Recommended({ search: s, notes, candidates, onAdded, onNote }: Props) {
  const jobs = useQuery(jobsKey(s.id), () => searchJobs(s.id))
  const job = latestJobs(jobs.data ?? []).match
  const working = job?.status === 'waiting' || job?.status === 'working'
  const matchNotes = notes.filter((n) => n.tab === 'match').sort((a, b) => b.version - a.version)
  const latest = matchNotes[0]
  const result = (latest?.structured ?? null) as MatchResult | null
  // Hidden on this search, whichever version he hid them on.
  const dismissed = new Set(matchNotes.flatMap((n) => ((n.structured as MatchResult | null)?.dismissed ?? [])))
  const onBoard = new Set(candidates.map((c) => c.personId))
  const shown = (result?.candidates ?? []).filter((c) => !dismissed.has(c.person_id))
  const [asking, setAsking] = useState<boolean | null>(null)
  const [answers, setAnswers] = useState<MatchAnswers | null>(null)
  const [open, setOpen] = useState(candidates.length === 0)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const form = answers ?? answersFrom(s, notes, job?.instruction)
  // The form shows by itself only on an empty board, so a full board stays in view.
  const showForm = asking ?? (!result && !working && candidates.length === 0)

  // Working jobs are looked at again every half a minute while the tab is open.
  useEffect(() => {
    if (!working) return
    const t = setInterval(() => {
      invalidate(jobsKey(s.id))
      invalidate(`searches.notes.${s.id}`)
    }, 30_000)
    return () => clearInterval(t)
  }, [working, s.id])

  async function find() {
    const clean = cleanAnswers(form)
    if (Object.keys(clean).length === 0) {
      onNote('Fill in at least one answer first.')
      return
    }
    setBusy(true)
    try {
      await requestSearchJob(s.id, 'match', clean)
      invalidate(jobsKey(s.id))
      setAsking(false)
      setOpen(true)
    } catch {
      onNote('Could not ask. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function add(c: MatchCandidate) {
    setAdding(c.person_id)
    try {
      await data.addCandidate(s.id, c.person_id)
      onAdded()
    } catch {
      onNote('That did not save. Try again.')
    } finally {
      setAdding(null)
    }
  }

  async function hide(c: MatchCandidate) {
    if (!latest) return
    const next: MatchResult = { ...(result ?? { candidates: [] }), dismissed: [...new Set([...(result?.dismissed ?? []), c.person_id])] }
    try {
      await data.saveSearchNote(s.id, 'match', latest.content, next as unknown as Record<string, unknown>)
      invalidate(`searches.notes.${s.id}`)
    } catch {
      onNote('That did not save. Try again.')
    }
  }

  const count = shown.filter((c) => !onBoard.has(c.person_id)).length
  return (
    <section className="flex flex-col gap-3 border-b border-rule pb-4" aria-label="Recommended candidates">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <h4 className="label-caps text-ink-2">
          Recommended candidates{result ? <span className="ml-2 font-mono tabular-nums text-ink-3">{String(count).padStart(2, '0')}</span> : null}
        </h4>
        {working ? (
          <span className="font-mono text-label text-ink-3">Working: the research agent answers within a few hours</span>
        ) : (
          <>
            {result && <TextLink label={open ? 'Hide' : 'Show'} onClick={() => setOpen((o) => !o)} />}
            {!showForm && <TextLink label={result ? 'Change what good looks like' : 'Find candidates'} onClick={() => { setAsking(true); setOpen(true) }} />}
            {showForm && !result && candidates.length > 0 && <TextLink label="Hide" onClick={() => setAsking(false)} />}
          </>
        )}
        {job?.status === 'failed' && <span className="text-ink-2">Could not finish. {job.note ?? 'Try again.'}</span>}
        {job?.status === 'ready' && job.finishedAt && <span className="font-mono text-label text-ink-3">{job.finishedAt.slice(0, 10)} {ukTime(new Date(job.finishedAt))}</span>}
      </div>

      {showForm && !working && (
        <form
          className="flex flex-col gap-4"
          aria-label="What does a good candidate look like?"
          onSubmit={(e) => {
            e.preventDefault()
            void find()
          }}
        >
          <p className="text-body text-ink">What does a good candidate look like?</p>
          <div className="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-5">
            {matchQuestions.map((q) => (
              <Field key={q.key} label={q.label} kind="lines" rows={2} value={form[q.key] ?? ''} onChange={(v) => setAnswers({ ...form, [q.key]: v })} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <PillButton label="Find candidates" type="submit" kind="primary" busy={busy} />
            {result && <TextLink label="Keep the list I have" onClick={() => setAsking(false)} />}
            <span className="font-mono text-label text-ink-3">From the people you know: your calls, spec requests and pipelines. The agent runs weekdays at 08:00, 12:00 and 16:00.</span>
          </div>
        </form>
      )}

      {working && <p className="font-mono text-label text-ink-3">It runs weekdays at 08:00, 12:00 and 16:00. The list will be here when you come back.</p>}

      {result && open && !showForm && (
        shown.length === 0 ? (
          <p className="text-ink-3">Nobody from the people you know fits yet. Change the answers to look again.</p>
        ) : (
          <ul className="flex max-h-80 flex-col overflow-y-auto" aria-label="Recommended">
            {shown.map((c) => (
              <li key={c.person_id} className="grid gap-x-6 gap-y-1 border-b border-rule py-3 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto]" data-match={c.person_id}>
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 text-body text-ink">
                    <span aria-hidden className={`block size-2 shrink-0 rounded-pill border border-ink ${c.fit === 'strong' ? 'bg-ink' : 'bg-transparent'}`} />
                    {c.name}
                  </span>
                  <span className="truncate text-label text-ink-2">{[c.title, c.company].filter(Boolean).join(', ')}</span>
                  <span className={`label-caps ${c.fit === 'maybe' ? 'text-ink-3' : 'text-ink'}`}>{fitWord[c.fit]}</span>
                </div>
                <div className="flex max-w-prose flex-col gap-0.5 text-body">
                  <span className="text-ink">{c.why}</span>
                  {c.gaps && <span className="text-ink-2">Gap: {c.gaps}</span>}
                </div>
                <div className="flex flex-wrap items-start gap-x-5">
                  {onBoard.has(c.person_id) ? (
                    <span className="font-mono text-label text-ink-3">On the board</span>
                  ) : (
                    <>
                      <TextLink label={adding === c.person_id ? 'Adding' : 'Add to pipeline'} icon="plus" onClick={() => void add(c)} />
                      <TextLink label="Not for this one" onClick={() => void hide(c)} />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  )
}
