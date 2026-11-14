import type { FollowUpsDone, KpiOutputWeek, KpiStreak, KpiWeek, KpiWeekRow, ReviewFields } from './data'
import { mondayOf, shiftDate } from './time'

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

/** The three quarterly targets in stepper order (13.2). */
export const quarterlyKpis = ['events_held', 'blogs_published', 'testimonials'] as const

/** The outputs table on Quarter, in order (32.2). */
export const outputKpis = ['client_meetings', 'jobs_won', 'shortlists', 'first_interviews', 'offers', 'placements', 'referrals_received', 'leads_passed'] as const

export const outputWord: Record<string, string> = {
  client_meetings: 'Client meetings',
  jobs_won: 'Jobs won',
  shortlists: 'Shortlists sent',
  first_interviews: 'First interviews',
  offers: 'Offers',
  placements: 'Placements',
  referrals_received: 'Referrals received',
  leads_passed: 'Leads passed to colleagues',
}

/** Words for the What moved line: 1 shortlist, 2 first interviews. */
const movedWord: Record<string, [string, string]> = {
  client_meetings: ['client meeting', 'client meetings'],
  jobs_won: ['job won', 'jobs won'],
  shortlists: ['shortlist', 'shortlists'],
  first_interviews: ['first interview', 'first interviews'],
  offers: ['offer', 'offers'],
  placements: ['placement', 'placements'],
  referrals_received: ['referral', 'referrals'],
  leads_passed: ['lead passed on', 'leads passed on'],
}

/** w/c 9 November. */
export function weekWords(week: string): string {
  return `w/c ${dayMonth(week)}`
}

/** The Monday of the week before the one holding a moment. */
export function lastMonday(now: Date): string {
  return shiftDate(mondayOf(now), -7)
}

/** The What moved line (32.3): outputs for one week in plain words. */
export function movedWords(outputs: KpiOutputWeek[], week: string, allWork: boolean): string {
  const parts = outputKpis
    .map((k) => {
      const row = outputs.find((o) => o.kpi === k && o.week === week)
      const n = row ? Math.round(allWork ? row.total : row.pmmTotal) : 0
      return n > 0 ? `${n} ${movedWord[k][n === 1 ? 0 : 1]}` : null
    })
    .filter((p): p is string => p !== null)
  return parts.length ? `${parts.join(', ')}.` : 'Nothing moved.'
}

/** One line per weekly KPI for a week: name, N/target and hit or missed. */
export function weekLines(weeks: KpiWeekRow[], week: string, allWork: boolean): { kpi: string; name: string; fraction: string; hit: boolean; mark: boolean }[] {
  return inOrder(weeks.filter((w) => w.week === week)).map((w) => {
    const f = figure(w, allWork)
    return { kpi: w.kpi, name: kpiWord[w.kpi] ?? w.kpi, fraction: fraction(f.total, w.target), hit: f.hit, mark: w.hasManual }
  })
}

/**
 * The summary email in the shape A1 sends (17.2), built from the same lines
 * the page shows. A1's own message replaces it once the agent posts.
 */
export function summaryDraft(input: {
  week: string
  lines: ReturnType<typeof weekLines>
  moved: string
  followUps: FollowUpsDone | undefined
  review: ReviewFields | null
}): string {
  const { week, lines, moved, followUps, review } = input
  const kpiLines = lines.length
    ? lines.map((l) => `${l.name}: ${l.fraction}, ${l.hit ? 'hit' : 'missed'}`).join('\n')
    : 'No logged activity this week. Job posts chased, coaching calls, LinkedIn posts and new A-star candidates were not logged.'
  const away = review && /\b(away|holiday)\b/i.test(review.plan) ? 'I was away for part of the week.\n\n' : ''
  const notes: string[] = []
  if (review?.learned.trim()) notes.push(`What I learned: ${review.learned.trim()}`)
  if (review?.plan.trim()) notes.push(`Next week: ${review.plan.trim()}`)
  const notesBlock = notes.length ? notes.join('\n\n') : 'Notes to add before the review.'
  const followLine = followUps ? `Follow-ups on time: ${Math.round(followUps.onTime)} of ${Math.round(followUps.completed)}.` : ''
  return [
    `Subject: PMM weekly KPIs - ${weekWords(week)}`,
    '',
    'Olly,',
    '',
    `${away}Last week against target:`,
    kpiLines,
    '',
    `Moved: ${moved}`,
    followLine,
    '',
    notesBlock,
    '',
    'Jason',
  ]
    .filter((l, i, all) => !(l === '' && all[i - 1] === ''))
    .join('\n')
}
