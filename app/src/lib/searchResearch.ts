// The new search flow's research jobs (docs/new-search-split.md): the types,
// and a small in-memory stand-in for when no Supabase project is configured.
// In sample mode a requested job turns ready a few seconds later with a small
// invented result in the contract's shape, so the screens can be built and
// shown without the database or the research routine. Every name here is
// made up.

import { questionBank, questionsAsText, type QuestionGroup } from './questionBank'

export type SearchJobKind = 'questions' | 'lowdown' | 'map' | 'brief' | 'match'
export type SearchJobStatus = 'waiting' | 'working' | 'ready' | 'failed'
export type SearchJob = {
  kind: SearchJobKind
  status: SearchJobStatus
  /** One plain line for the screen, for example why it failed. */
  note: string | null
  requestedAt: string
  finishedAt: string | null
  /** A match job's answers (0060). */
  instruction?: MatchAnswers | null
}
export type StartSearchInput = { client: string; role: string; roleType?: string | null; jdText?: string | null; briefDueOn?: string | null }
/** What the intake step saved on the search. The role type is one of the RoleType codes or Jason's own words (0060). */
export type SearchIntake = { roleType: string | null; jdText: string | null; briefDueOn: string | null }

/** His answers to "what does a good candidate look like?", the instruction of a match job (0060). */
export type MatchAnswers = { must_haves?: string; nice_to_haves?: string; target_backgrounds?: string; deal_breakers?: string; level_and_location?: string }
export const matchQuestions: { key: keyof MatchAnswers; label: string }[] = [
  { key: 'must_haves', label: 'Must-haves' },
  { key: 'nice_to_haves', label: 'Nice-to-haves' },
  { key: 'target_backgrounds', label: 'Target companies or backgrounds' },
  { key: 'deal_breakers', label: 'Deal-breakers' },
  { key: 'level_and_location', label: 'Level and location' },
]
export type MatchFit = 'strong' | 'good' | 'maybe'
/** One recommended candidate, as the match note holds it: someone already in people. */
export type MatchCandidate = { person_id: string; name: string; title: string | null; company: string | null; fit: MatchFit; why: string; gaps: string }
/** The `structured` of a match note. `dismissed` is the owner's: people he said are not for this one. */
export type MatchResult = { candidates: MatchCandidate[]; left_out?: number; dismissed?: string[] }

export type SearchResearch = {
  startSearch(input: StartSearchInput): Promise<string>
  requestSearchJob(searchId: string, kind: SearchJobKind, answers?: MatchAnswers): Promise<void>
  searchJobs(searchId: string): Promise<SearchJob[]>
  searchIntake(searchId: string): Promise<SearchIntake>
  /** One of the codes, or his own words. Blank clears it. */
  saveRoleType(searchId: string, roleType: string | null): Promise<void>
  /** The job description as text. Blank clears it. The file itself is never kept. */
  saveJd(searchId: string, text: string | null): Promise<void>
}

/** Only the answers with something in them, trimmed. Empty means nothing to ask with. */
export function cleanAnswers(a: MatchAnswers): MatchAnswers {
  const out: MatchAnswers = {}
  for (const q of matchQuestions) {
    const v = a[q.key]?.trim()
    if (v) out[q.key] = v
  }
  return out
}

/** The newest job of each kind, for a screen that shows one state per button. */
export function latestJobs(jobs: SearchJob[]): Partial<Record<SearchJobKind, SearchJob>> {
  const out: Partial<Record<SearchJobKind, SearchJob>> = {}
  for (const j of jobs) {
    const held = out[j.kind]
    if (!held || j.requestedAt > held.requestedAt) out[j.kind] = j
  }
  return out
}

// ---------------------------------------------------------------- sample results

type Result = { content: string; structured: Record<string, unknown> }

export function sampleQuestions(intake: SearchIntake): Result {
  const fromJd = Boolean(intake.jdText)
  const groups: QuestionGroup[] = questionBank(intake.roleType)
  if (fromJd) {
    groups.unshift({
      title: 'From the job description',
      questions: [
        { id: 'jd-1', text: 'The description names two product lines. Which one comes first, and who owns pricing for each?', why: 'The JD names two product lines but not who owns pricing', source: 'jd_gap' },
        { id: 'jd-2', text: 'It asks for eight years and also calls the role hands-on. Which matters more if you cannot have both?', why: 'The level and the day-to-day work point in different directions', source: 'jd_gap' },
        { id: 'jd-3', text: 'Launches are mentioned four times. How many a year, and which was the last one that went well?', why: 'Launches are the heart of the JD', source: 'jd' },
      ],
    })
  }
  return { content: questionsAsText(groups), structured: { role_type: intake.roleType ?? 'other', from_jd: fromJd, groups } }
}

export function sampleLowdown(client: string): Result {
  const structured = {
    worked_before: { summary: 'One search two years ago, filled. No contact since March.', placements: 1, last_contact_on: '2026-03-12', people: [{ name: 'Robin Madeup', role: 'VP Marketing', source: 'outlook' }] },
    company: { one_line: `${client} sells workflow software to mid-sized finance teams.`, founded: '2018', hq: 'Austin, Texas', headcount: 'about 240', story: 'Started as a reporting tool, moved to a platform in 2023 and now sells mostly to finance leaders.' },
    funding: [{ round: 'Series B', amount: '$40m', date: '2025-06', investors: ['Sample Ridge Partners'] }],
    leadership: [{ name: 'Casey Notreal', title: 'Chief executive' }, { name: 'Robin Madeup', title: 'VP Marketing' }],
    pmm_team: { size: '3', lead: 'Open since September', notes: 'Two product marketers and one in competitive intelligence.' },
    news: [{ date: '2026-10', headline: 'Opened a second office in Denver', url: 'https://example.com/news/denver' }],
    hiring_signals: ['Four marketing roles open, two of them in product marketing'],
    watch_outs: ['The last head of product marketing left after eleven months'],
    sources: [{ label: 'Company site, About', url: 'https://example.com/about' }, { label: 'Funding announcement', url: 'https://example.com/news/series-b' }],
  }
  const content = [
    `${client}: sample lowdown`,
    `Worked before: ${structured.worked_before.summary}`,
    `Company: ${structured.company.one_line} Founded ${structured.company.founded}, ${structured.company.hq}, ${structured.company.headcount} people.`,
    `Funding: ${structured.funding[0].round}, ${structured.funding[0].amount}, ${structured.funding[0].date}.`,
    `Product marketing: ${structured.pmm_team.notes}`,
    `Watch out: ${structured.watch_outs[0]}.`,
  ].join('\n')
  return { content, structured }
}

export function sampleMap(role: string): Result {
  const tiers = [
    { tier: 1, title: 'Direct competitors', companies: [
      { name: 'Ledgerly Sample', why: 'Sells the same close-management product to the same finance buyer', hq: 'New York', size: 'about 400', movability: 'Cut 10% of staff in October', signal_date: '2026-10' },
      { name: 'Northbook Demo', why: 'Closest rival in mid-market, with a product marketing team of five', hq: 'Boston', size: 'about 250' },
    ] },
    { tier: 2, title: 'Adjacent categories', companies: [
      { name: 'Paystream Pretend', why: 'Different product, same finance buyer and the same length of sales cycle', hq: 'Chicago', size: 'about 600' },
      { name: 'Auditline Example', why: 'Sells compliance tools into the same accounts', hq: 'Remote, US', size: 'about 180', movability: 'Head of marketing left in September', signal_date: '2026-09' },
    ] },
    { tier: 3, title: 'Talent factories', companies: [
      { name: 'Bigcloud Invented', why: 'Trains product marketers on launches at scale. People move on after two or three years', hq: 'San Francisco', size: 'over 5,000' },
    ] },
  ]
  const structured = {
    tiers,
    poach_from: [{ name: 'Ledgerly Sample', why: 'Right buyer and people are taking calls after the October cuts' }],
    titles: ['Senior Product Marketing Manager', 'Principal Product Marketing Manager', 'Product Marketing Lead', 'Group Product Marketing Manager'],
    keywords: ['go-to-market', 'positioning', 'product launch', 'sales enablement', 'finance buyer'],
    boolean: [
      { label: 'LinkedIn Recruiter, tier 1', string: '("product marketing" OR PMM) AND (senior OR principal OR lead) AND ("Ledgerly Sample" OR "Northbook Demo")' },
      { label: 'X-ray, broad', string: 'site:linkedin.com/in ("senior product marketing manager" OR "principal product marketing manager") ("fintech" OR "finance software")' },
    ],
    companies_csv: ['name,tier,why', ...tiers.flatMap((t) => t.companies.map((c) => `${c.name},${t.tier},"${c.why}"`))].join('\n'),
  }
  const content = [`Sample market map for ${role}`, ...tiers.map((t) => `Tier ${t.tier}, ${t.title}: ${t.companies.map((c) => c.name).join(', ')}`)].join('\n')
  return { content, structured }
}

/** The brief as the agent fills it from Spott and the calls (0051). */
export function sampleBrief(client: string, role: string): Result {
  const structured = {
    why_open: 'The last head moved to a VP role in-house in October',
    reports_to: 'The CMO, with a dotted line to the VP Product',
    team: 'Two product marketers and one in competitive intelligence',
    first_90: 'Own the launch calendar and rebuild the messaging house',
    good_at_six: 'Two launches landed, sales using the new deck, pricing page rewritten',
    must_have: 'B2B SaaS, launches at scale, has managed two or more',
    nice_to_have: 'Finance buyer, pricing and packaging',
    comp_band: 'Director band, equity on top',
    location: 'New York, three days in the office',
    process: 'Screen with the CMO, a case study with the team, a final with the CEO',
    timeline: 'Shortlist by the end of the month, offer before the holidays',
    competition: 'One internal candidate and one other agency, exclusive for three weeks',
    selling_points: 'A real seat at the table and a product that sells itself to finance teams',
    risks: 'The internal candidate, and the last head left after eleven months',
    sources: [{ label: 'Spott job', url: `https://example.com/spott/jobs/${client.toLowerCase().replace(/[^a-z]+/g, '-')}` }, { label: 'Brief call notes', url: 'https://example.com/granola/brief-call' }],
  }
  const content = [`${role} at ${client}: brief`, ...Object.entries(structured).filter(([k]) => k !== 'sources').map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v as string}`)].join('\n')
  return { content, structured }
}

/** Recommended candidates from the people he knows (0060): invented why and gaps over the sample people. */
export function sampleMatch(pool: { personId: string; name: string; title: string | null; company: string | null }[], answers: MatchAnswers): Result {
  const fits: MatchFit[] = ['strong', 'good', 'good', 'maybe']
  const whys = [
    'Ran two launches a year for a finance buyer and leads a small team',
    'Owns positioning and pricing for a product line much like this one',
    'Strong on sales enablement, and has worked with the CMO type described',
    'Right level, though most of the work has been in brand rather than product',
  ]
  const gaps = ['Has not managed managers yet', 'No time in a product-led company', 'Would need to relocate to the East Coast', 'Light on launches at this scale']
  const candidates: MatchCandidate[] = pool.slice(0, 4).map((p, i) => ({ person_id: p.personId, name: p.name, title: p.title, company: p.company, fit: fits[i], why: whys[i], gaps: gaps[i] }))
  const content = [`Sample matches${answers.must_haves ? ` for: ${answers.must_haves}` : ''}`, ...candidates.map((c) => `${c.name} (${c.fit}): ${c.why}. Gap: ${c.gaps}`)].join('\n')
  return { content, structured: { candidates, left_out: 0 } }
}

// ---------------------------------------------------------------- the stand-in

type Deps = {
  /** Make the search in the sample store and give back its id. */
  addSearch(input: { client: string; role: string }): Promise<string>
  /** Save a result where searchNotes will find it. */
  saveNote(searchId: string, tab: SearchJobKind, content: string, structured: Record<string, unknown>): Promise<void>
  /** The people he knows, for a sample match. */
  pool?: () => Promise<{ personId: string; name: string; title: string | null; company: string | null }[]>
  /** The people already on a search, left out of a sample match. */
  onSearch?: (searchId: string) => Promise<string[]>
  /** How long a job takes. Working shows from half way. */
  delayMs?: number
}

export function createSampleSearchResearch(deps: Deps): SearchResearch {
  const delay = deps.delayMs ?? 4000
  const jobs = new Map<string, SearchJob[]>()
  const intakes = new Map<string, SearchIntake & { client: string; role: string }>()
  const intakeOf = (searchId: string) => {
    let i = intakes.get(searchId)
    if (!i) {
      i = { client: '', role: '', roleType: null, jdText: null, briefDueOn: null }
      intakes.set(searchId, i)
    }
    return i
  }

  return {
    async startSearch(input) {
      const client = input.client.trim()
      const role = input.role.trim()
      if (!client) throw new Error('A search needs a client')
      if (!role) throw new Error('A search needs a role, however rough')
      const id = await deps.addSearch({ client, role })
      intakes.set(id, { client, role, roleType: input.roleType ?? null, jdText: input.jdText?.trim() || null, briefDueOn: input.briefDueOn ?? null })
      return id
    },

    async requestSearchJob(searchId, kind, answers) {
      const asked = kind === 'match' ? cleanAnswers(answers ?? {}) : {}
      if (kind === 'match' && Object.keys(asked).length === 0) throw new Error('Say what a good candidate looks like first')
      const list = jobs.get(searchId) ?? []
      jobs.set(searchId, list)
      // One open job per search and kind; a waiting match takes the newer answers.
      const open = list.find((j) => j.kind === kind && j.status === 'waiting')
      if (open && kind === 'match') open.instruction = asked
      if (list.some((j) => j.kind === kind && (j.status === 'waiting' || j.status === 'working'))) return
      const job: SearchJob = { kind, status: 'waiting', note: null, requestedAt: new Date().toISOString(), finishedAt: null, instruction: kind === 'match' ? asked : null }
      list.unshift(job)
      setTimeout(() => {
        job.status = 'working'
      }, delay / 2)
      setTimeout(async () => {
        const saved = intakes.get(searchId)
        const intake = { roleType: saved?.roleType ?? null, jdText: saved?.jdText ?? null, briefDueOn: saved?.briefDueOn ?? null, client: saved?.client || 'The client', role: saved?.role || 'the role' }
        let result: Result
        if (kind === 'match') {
          const taken = new Set((await deps.onSearch?.(searchId)) ?? [])
          result = sampleMatch(((await deps.pool?.()) ?? []).filter((p) => !taken.has(p.personId)), asked)
        } else result = kind === 'questions' ? sampleQuestions(intake) : kind === 'lowdown' ? sampleLowdown(intake.client) : kind === 'brief' ? sampleBrief(intake.client, intake.role) : sampleMap(intake.role)
        deps.saveNote(searchId, kind, result.content, result.structured).then(
          () => Object.assign(job, { status: 'ready', note: 'Sample result', finishedAt: new Date().toISOString() }),
          () => Object.assign(job, { status: 'failed', note: 'The sample result could not be saved.', finishedAt: new Date().toISOString() }),
        )
      }, delay)
    },

    async searchJobs(searchId) {
      return (jobs.get(searchId) ?? []).map((j) => ({ ...j }))
    },

    async searchIntake(searchId) {
      const i = intakes.get(searchId)
      return { roleType: i?.roleType ?? null, jdText: i?.jdText ?? null, briefDueOn: i?.briefDueOn ?? null }
    },

    async saveRoleType(searchId, roleType) {
      const v = roleType?.trim() || null
      if (v && v.length > 80) throw new Error('Keep the role type to 80 characters')
      intakeOf(searchId).roleType = v
    },

    async saveJd(searchId, text) {
      const v = text?.trim() || null
      if (v && v.length > 60000) throw new Error('That job description is too long. Keep it under 60,000 characters')
      intakeOf(searchId).jdText = v
    },
  }
}
