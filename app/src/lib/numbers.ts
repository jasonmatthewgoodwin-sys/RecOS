import type { KpiStreak, KpiWeek } from './data'

// Pure helpers for the Numbers tab (32.1, 14.3, 22.5). No data access.

/** The four weekly KPIs in the order the stepper walks them (13.2). */
export const weeklyKpis = ['posts_chased', 'coaching_calls', 'linkedin_posts', 'new_a_star'] as const

export const kpiWord: Record<string, string> = {
  posts_chased: 'Job posts chased',
  coaching_calls: 'Coaching calls',
  linkedin_posts: 'LinkedIn posts',
  new_a_star: 'New A-star candidates',
  events_held: 'Events held',
  blogs_published: 'Blogs published',
  testimonials: 'Testimonials',
}

/** The weekly rows in stepper order. A KPI with no target this week is left out. */
export function inOrder(weeks: KpiWeek[]): KpiWeek[] {
  return weeklyKpis.map((k) => weeks.find((w) => w.kpi === k)).filter((w): w is KpiWeek => w !== undefined)
}

/** The figure in view: PMM by default, all work when the switch is on (22.5). */
export function figure(w: KpiWeek, allWork: boolean): { total: number; hit: boolean } {
  return allWork ? { total: w.total, hit: w.hit } : { total: w.pmmTotal, hit: w.pmmHit }
}

/** 12/20, whole numbers. */
export function fraction(total: number, target: number): string {
  return `${Math.round(total)}/${Math.round(target)}`
}

/** 9 November. */
function dayMonth(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}

/** The sentence instead of a trend chart (14.3). */
export function streakSentence(s: KpiStreak | undefined, allWork: boolean): string {
  if (!s) return ''
  if (s.weeksHistory < 4) {
    return s.firstWeek ? `Tracking since the week of ${dayMonth(s.firstWeek)}.` : 'Tracking from this week.'
  }
  const hits = allWork ? s.hitLast4 : s.pmmHitLast4
  if (hits >= 4) return 'Hit every week for the last 4.'
  if (hits > 0) return `Hit in ${hits} of the last 4 weeks.`
  const best = Math.round(allWork ? s.best12 : s.pmmBest12)
  return `Not hit in the last 4 weeks. Best week was ${best}.`
}
