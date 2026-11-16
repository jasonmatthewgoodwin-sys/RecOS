import { useEffect, useState, type ReactNode } from 'react'
import { Field } from '../../components/Field'
import { PillButton } from '../../components/PillButton'
import { Dots } from '../../components/Quiet'
import { TextLink } from '../../components/TextLink'
import { data, requestSearchJob, searchIntake, searchJobs, type Call, type Search, type SearchJob, type SearchJobKind, type SearchNote } from '../../lib/data'
import { invalidate, useQuery } from '../../lib/query'
import { briefFields, writeUpTicks } from '../../lib/searches'
import { questionBank, ROLE_TYPES, type RoleType } from '../../lib/questionBank'
import { latestJobs } from '../../lib/searchResearch'
import { ukTime } from '../../lib/time'

// The workspace tabs rebuilt on 16 November 2026 (Mia): Pre-brief holds the
// intake and the research before the brief call; Brief is read, not typed,
// filled by the agent from Spott and the calls; Pipeline reads Spott's
// counts; Calls lists every call on the search with its Granola notes and
// the agent's summary. On-demand actions behave as 30.6 says.

const jobsKey = (id: string) => `searches.jobs.${id}`

const roleTypeWord: Record<RoleType, string> = {
  ic_pmm: 'Product marketing manager',
  senior_pmm: 'Senior PMM',
  technical_pmm: 'Technical PMM',
  head_of_pmm: 'Head of product marketing',
  director_vp_pmm: 'Director or VP',
  plg_pmm: 'Product-led growth PMM',
  other: 'Other',
}

function when(iso: string | null): string {
  return iso ? `${iso.slice(0, 10)} ${ukTime(new Date(iso))}` : ''
}

/** One research action: Ask, Working, then the result in place (30.6). */
function Action({ kind, job, label, onAsk, children }: { kind: SearchJobKind; job: SearchJob | undefined; label: string; onAsk: (kind: SearchJobKind) => void; children?: ReactNode }) {
  const working = job?.status === 'waiting' || job?.status === 'working'
  return (
    <section className="flex flex-col gap-3" aria-label={label}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <h4 className="label-caps text-ink-2">{label}</h4>
        {working ? <span className="font-mono text-label text-ink-3">Working. It will be here when you come back.</span> : <TextLink label={children ? 'Ask again' : 'Ask'} onClick={() => onAsk(kind)} />}
        {job?.status === 'failed' && <span className="text-ink-2">Could not finish. {job.note ?? 'Try again.'}</span>}
        {job?.status === 'ready' && job.finishedAt && <span className="font-mono text-label text-ink-3">{when(job.finishedAt)}</span>}
      </div>
      {children}
      {job?.status === 'ready' && job.note && <p className="font-mono text-label text-ink-3">{job.note}</p>}
    </section>
  )
}

function Structured({ value }: { value: unknown }): ReactNode {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number') return <span>{String(value)}</span>
  if (Array.isArray(value)) {
    return (
      <ul className="flex flex-col gap-1">
        {value.map((v, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="text-ink-3">·</span>
            <Structured value={v} />
          </li>
        ))}
      </ul>
    )
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    if (typeof o.url === 'string' && typeof o.label === 'string') return <TextLink label={o.label} href={o.url} icon="open" />
    if (typeof o.headline === 'string' && typeof o.url === 'string') return <TextLink label={`${o.date ? `${o.date} ` : ''}${o.headline}`} href={o.url} icon="open" />
    if (typeof o.string === 'string' && typeof o.label === 'string') {
      return (
        <span className="flex flex-col gap-1">
          <span className="label-caps text-ink-2">{o.label}</span>
          <code className="whitespace-pre-wrap break-words font-mono text-label text-ink">{o.string}</code>
          <span>
            <TextLink label="Copy" onClick={() => void navigator.clipboard?.writeText(o.string as string)} />
          </span>
        </span>
      )
    }
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {Object.entries(o).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="label-caps text-ink-2">{k.replace(/_/g, ' ')}</dt>
            <dd className="text-body text-ink">
              <Structured value={v} />
            </dd>
          </div>
        ))}
      </dl>
    )
  }
  return null
}

/** Pre-brief: the intake, the questions for the brief call, the client lowdown and the map. */
export function PreBriefTab({ search: s, notes, onNote }: { search: Search; notes: SearchNote[]; onNote: (t: string) => void }) {
  const jobs = useQuery(jobsKey(s.id), () => searchJobs(s.id))
  const intake = useQuery(`searches.intake.${s.id}`, () => searchIntake(s.id))
  const latest = latestJobs(jobs.data ?? [])
  const [roleType, setRoleType] = useState<RoleType | ''>('')
  useEffect(() => {
    if (intake.data?.roleType) setRoleType(intake.data.roleType)
  }, [intake.data])

  // Working jobs are looked at again every half a minute while the tab is open.
  const working = Object.values(latest).some((j) => j.status === 'waiting' || j.status === 'working')
  useEffect(() => {
    if (!working) return
    const t = setInterval(() => {
      invalidate(jobsKey(s.id))
      invalidate(`searches.notes.${s.id}`)
    }, 30_000)
    return () => clearInterval(t)
  }, [working, s.id])

  async function ask(kind: SearchJobKind) {
    try {
      await requestSearchJob(s.id, kind)
      invalidate(jobsKey(s.id))
    } catch {
      onNote('Could not ask. Try again.')
    }
  }

  const note = (tab: string) => notes.find((n) => n.tab === tab) ?? null
  const q = note('questions')
  const groups = (q?.structured as { groups?: { title: string; questions: { id: string; text: string; why?: string; source?: string }[] }[] } | null)?.groups ?? (roleType ? questionBank(roleType) : [])
  const lowdown = note('lowdown')
  const map = note('map')
  const tiers = (map?.structured as { tiers?: { tier: number; title: string; companies: { name: string; why: string; hq?: string; size?: string; movability?: string }[] }[] } | null)?.tiers ?? []
  const [tier, setTier] = useState<number | 'all'>('all')

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-label="Intake">
        <h4 className="label-caps text-ink-2">Intake</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role type" kind="choice" value={roleType} onChange={(v) => setRoleType(v as RoleType | '')} placeholder="Pick one" choices={ROLE_TYPES.map((r) => ({ value: r.value, label: roleTypeWord[r.value] ?? r.label }))} />
          <p className="self-end font-mono text-label text-ink-3">{intake.data?.jdText ? `Job description on file, ${intake.data.jdText.split(/\s+/).length} words` : 'No job description yet'}{intake.data?.briefDueOn ? `. Brief due ${intake.data.briefDueOn}` : ''}</p>
        </div>
      </section>

      <Action kind="questions" job={latest.questions} label="Questions for the brief call" onAsk={ask}>
        {groups.length > 0 && (
          <div className="flex flex-col gap-3">
            {groups.map((g) => (
              <div key={g.title} className="flex flex-col gap-1">
                <h5 className="text-body text-ink">{g.title}</h5>
                <ul className="flex flex-col gap-1">
                  {g.questions.map((qq) => (
                    <li key={qq.id} className="flex flex-col">
                      <span className="text-body text-ink">{qq.text}</span>
                      {qq.why && <span className="font-mono text-label text-ink-3">{qq.why}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <span>
              <TextLink label="Copy all" onClick={() => void navigator.clipboard?.writeText(groups.map((g) => `${g.title}\n${g.questions.map((x) => `- ${x.text}`).join('\n')}`).join('\n\n'))} />
            </span>
          </div>
        )}
      </Action>

      <Action kind="lowdown" job={latest.lowdown} label="Client lowdown" onAsk={ask}>
        {lowdown?.structured && <Structured value={lowdown.structured} />}
      </Action>

      <Action kind="map" job={latest.map} label="Market map, after the brief call" onAsk={ask}>
        {tiers.length > 0 && (
          <div className="flex flex-col gap-3">
            <nav aria-label="Tier" className="flex flex-wrap gap-x-6">
              <TextLink label={`All, ${tiers.reduce((n, t) => n + t.companies.length, 0)}`} active={tier === 'all'} onClick={() => setTier('all')} />
              {tiers.map((t) => (
                <TextLink key={t.tier} label={`${t.title}, ${t.companies.length}`} active={tier === t.tier} onClick={() => setTier(t.tier)} />
              ))}
            </nav>
            <div className="max-h-96 overflow-y-auto">
              {tiers
                .filter((t) => tier === 'all' || t.tier === tier)
                .map((t) => (
                  <section key={t.tier} className="flex flex-col gap-1 py-2" aria-label={t.title}>
                    <h5 className="label-caps text-ink-2">
                      Tier {t.tier}, {t.title}
                    </h5>
                    <ul className="flex flex-col">
                      {t.companies.map((c) => (
                        <li key={c.name} className="flex flex-col border-b border-rule py-1">
                          <span className="text-body text-ink">
                            {c.name}
                            {c.hq ? `, ${c.hq}` : ''}
                            {c.size ? `, ${c.size}` : ''}
                          </span>
                          <span className="text-label text-ink-2">
                            {c.why}
                            {c.movability ? `. ${c.movability}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
            {Array.isArray((map?.structured as { boolean?: unknown[] } | null)?.boolean) && (
              <details>
                <summary className="cursor-pointer text-body text-ink-2">Boolean strings</summary>
                <div className="mt-2 flex flex-col gap-3">
                  <Structured value={(map!.structured as { boolean: unknown[] }).boolean} />
                </div>
              </details>
            )}
          </div>
        )}
      </Action>
    </div>
  )
}

/** Brief: read, not typed. The agent fills it from Spott and the calls on the search. */
export function BriefTab({ search: s, note, loading, onNote }: { search: Search; note: SearchNote | null; loading: boolean; onNote: (t: string) => void }) {
  const jobs = useQuery(jobsKey(s.id), () => searchJobs(s.id))
  const job = latestJobs(jobs.data ?? []).brief
  const working = job?.status === 'waiting' || job?.status === 'working'
  useEffect(() => {
    if (!working) return
    const t = setInterval(() => {
      invalidate(jobsKey(s.id))
      invalidate(`searches.notes.${s.id}`)
    }, 30_000)
    return () => clearInterval(t)
  }, [working, s.id])
  if (loading) return <Dots />
  const fields = (note?.structured as Record<string, unknown> | null) ?? {}
  const extra: { key: string; label: string }[] = [
    { key: 'team', label: 'The team' },
    { key: 'location', label: 'Location and working pattern' },
    { key: 'selling_points', label: 'Selling points' },
    { key: 'risks', label: 'Risks' },
  ]
  const all = [...briefFields, ...extra].filter((f, i, arr) => arr.findIndex((x) => x.key === f.key) === i)
  const filled = all.filter((f) => typeof fields[f.key] === 'string' && (fields[f.key] as string).trim())
  const missing = all.filter((f) => !filled.includes(f))
  const sources = Array.isArray(fields.sources) ? (fields.sources as { label: string; url: string }[]) : []
  async function refresh() {
    try {
      await requestSearchJob(s.id, 'brief')
      invalidate(jobsKey(s.id))
    } catch {
      onNote('Could not ask. Try again.')
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="font-mono text-label text-ink-3">Filled from Spott and the calls on this search{note ? `, ${note.updatedAt.slice(0, 10)}` : ''}. Nothing to type.</p>
        {working ? <span className="font-mono text-label text-ink-3">Working. It will be here when you come back.</span> : <PillButton label={note ? 'Refresh from Spott and calls' : 'Fill from Spott and calls'} onClick={() => void refresh()} />}
        {job?.status === 'failed' && <span className="text-ink-2">Could not finish. {job.note ?? 'Try again.'}</span>}
      </div>
      {filled.length === 0 ? (
        <p className="text-ink-3">Nothing filled yet. Once the brief call is in Granola and the job is in Spott, Fill brings it here.</p>
      ) : (
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {filled.map((f) => (
            <div key={f.key} className="flex flex-col">
              <dt className="label-caps text-ink-2">{f.label}</dt>
              <dd className="text-body text-ink">{String(fields[f.key])}</dd>
            </div>
          ))}
        </dl>
      )}
      {missing.length > 0 && filled.length > 0 && (
        <p className="font-mono text-label text-ink-3" data-testid="still-to-find">
          Still to find out: {missing.map((f) => f.label.toLowerCase()).join(', ')}
        </p>
      )}
      {sources.length > 0 && (
        <p className="flex flex-wrap gap-x-6">
          {sources.map((src) => (
            <TextLink key={src.url} label={src.label} href={src.url} icon="open" />
          ))}
        </p>
      )}
    </div>
  )
}

/** Calls: every call on this search, newest first, with the notes link and the agent's summary. */
export function CallsTab({ calls, loading, onConfirm }: { calls: Call[]; loading: boolean; onConfirm?: (c: Call) => void }) {
  if (loading) return <Dots />
  if (calls.length === 0) return <p className="text-ink-3">No calls on this search yet. The call agent adds them as they are written up.</p>
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-label text-ink-3">{writeUpTicks.map((t) => t.label).join(' . ')}</p>
      <ul className="flex flex-col" aria-label="Calls on this search">
        {calls.map((c) => (
          <li key={c.id} className="flex flex-col gap-1 border-b border-rule py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-mono text-label text-ink-2">
                {c.heldAt.slice(0, 10)} {ukTime(new Date(c.heldAt))}
              </span>
              <span className="min-w-0 flex-1 truncate text-body text-ink">{c.personName ?? c.title ?? c.callType.replace(/_/g, ' ')}</span>
              <span className="label-caps text-ink-3">{c.callType.replace(/_/g, ' ')}</span>
              <span className="font-mono text-label text-ink" aria-label="Write-up">
                {writeUpTicks.map((t) => (c[t.key] ? '✓' : '–')).join(' ')}
              </span>
              {(c.matchConfidence === 'low' || c.matchConfidence === 'none') && onConfirm && <TextLink label="Confirm" onClick={() => onConfirm(c)} />}
            </div>
            {c.summary && <p className="text-body text-ink-2">{c.summary}</p>}
            <p className="flex flex-wrap gap-x-6">
              {c.granolaUrl && <TextLink label="Open the call notes" href={c.granolaUrl} icon="open" />}
              {c.crmUrl && <TextLink label="Open in CRM" href={c.crmUrl} icon="open" />}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The pipeline's header: Spott's counts, when they were read, and Refresh. */
export function PipelineHeader({ search: s, onNote }: { search: Search; onNote: (t: string) => void }) {
  const [asked, setAsked] = useState(false)
  async function refresh() {
    try {
      await data.requestRun('a6_calls')
      setAsked(true)
    } catch {
      onNote('Could not ask. Try again.')
    }
  }
  const counts = [
    ['sourced', s.nSourced],
    ['spoken', s.nSpoken],
    ['submitted', s.nSubmitted],
    ['first stage', s.nFirstStage],
    ['later stage', s.nLaterStage],
    ['offer', s.nOffer],
  ] as const
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-baseline gap-x-3 font-mono text-label text-ink-2" aria-label="Spott counts">
        {counts.map(([label, n], i) => (
          <span key={label}>
            {i > 0 && <span className="mr-3 text-ink-3">›</span>}
            <span className="text-ink">{n}</span> {label}
          </span>
        ))}
      </p>
      <p className="flex flex-wrap items-center gap-x-6">
        <span className="font-mono text-label text-ink-3">From Spott, read by the call agent each weekday morning</span>
        {asked ? <span className="font-mono text-label text-ink-3">Asked. The agent refreshes at its next check.</span> : <TextLink label="Refresh from Spott" onClick={() => void refresh()} />}
      </p>
    </div>
  )
}

