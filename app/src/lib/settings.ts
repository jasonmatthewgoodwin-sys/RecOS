import type { Agent, AgentRun, SendLevel, SendPolicy, Target } from './data'

// Pure helpers for Settings (32.4). No data access.

export const levelWord: Record<SendLevel, string> = {
  automatic: 'Automatic',
  one_click: 'One click',
  draft_only: 'Draft only',
}

export const levels: SendLevel[] = ['automatic', 'one_click', 'draft_only']

const levelRank: Record<SendLevel, number> = { draft_only: 0, one_click: 1, automatic: 2 }

/** True when a level sits above the ceiling for the type (T-SET-2). */
export function aboveCeiling(level: SendLevel, policy: SendPolicy): boolean {
  return levelRank[level] > levelRank[policy.maxLevel]
}

export const channelWord: Record<string, string> = {
  email: 'Email',
  linkedin: 'LinkedIn',
  either: 'Email or LinkedIn',
}

export const runStatusWord: Record<string, string> = {
  running: 'Running',
  ok: 'OK',
  partial: 'Partial',
  failed: 'Failed',
  timed_out: 'Timed out',
}

/** Thu 09:30 in UK time, from a timestamp. */
export function runWhen(at: string): string {
  const d = new Date(at)
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/London' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London' }).format(d)
  return `${day} ${time}`
}

/** One line per run (32.4): when, how it went, what it made. */
export function runLine(r: AgentRun): string {
  const made = r.status === 'running' ? '' : `, ${r.itemsCreated} ${r.itemsCreated === 1 ? 'item' : 'items'}`
  return `${runWhen(r.startedAt)}, ${runStatusWord[r.status] ?? r.status}${made}`
}

/** The row meta for an agent: last run as a day and time, and items created. */
export function agentMeta(a: Agent): string {
  if (!a.lastRun) return 'Not run yet'
  return `${runWhen(a.lastRun.startedAt)}, ${a.lastRun.itemsCreated} ${a.lastRun.itemsCreated === 1 ? 'item' : 'items'}`
}

/** 12.40 of 50.00, two plain numbers. */
export function costWords(spent: number, budget: number | null): string {
  const money = (n: number) => n.toFixed(2)
  return budget === null ? `${money(spent)} this month` : `${money(spent)} of ${money(budget)}`
}

export const kpiWordAll: Record<string, string> = {
  posts_chased: 'Job posts chased',
  coaching_calls: 'Coaching calls',
  linkedin_posts: 'LinkedIn posts',
  new_a_star: 'New A-star candidates',
  events_held: 'Events held',
  blogs_published: 'Blogs published',
  testimonials: 'Testimonials',
}

export const periodWord: Record<string, string> = { week: 'a week', quarter: 'a quarter', year: 'a year' }

/** The target in force today and the one waiting for Monday, per KPI (T-SET-4). */
export function targetRows(targets: Target[], today: string): { kpi: string; period: string; current: Target | undefined; next: Target | undefined }[] {
  const keys = Array.from(new Set(targets.map((t) => `${t.kpi}|${t.period}`)))
  const order = Object.keys(kpiWordAll)
  keys.sort((a, b) => order.indexOf(a.split('|')[0]) - order.indexOf(b.split('|')[0]))
  return keys.map((key) => {
    const [kpi, period] = key.split('|')
    const mine = targets.filter((t) => t.kpi === kpi && t.period === period)
    const current = mine.find((t) => t.validFrom <= today && (t.validTo === null || t.validTo >= today))
    const next = mine.filter((t) => t.validFrom > today).sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0]
    return { kpi, period, current, next }
  })
}

/** Monday 23 November. */
export function fromWords(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}
