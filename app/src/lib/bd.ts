// Pure helpers for the Coaching, Referrals and Wider business pages
// (sections 28.3, 28.4, 28.8). No data access here.

import type { CoachingSession, Referral, WiderLead, WiderLeadStatus } from './data'
import type { UkClock } from './time'

export const functionWord: Record<string, string> = {
  pmm: 'product marketing',
  marketing: 'marketing',
  sales: 'sales',
  customer_success: 'customer success',
  revops: 'revenue operations',
  creative: 'creative',
  operating_partner: 'an operating partner',
  other: 'another role',
}

export const widerSourceWord: Record<string, string> = {
  client_call: 'a client call',
  placement: 'a placement',
  coaching: 'a coaching session',
  league_call: 'a league call',
  alex_leads: "Alex's leads",
  uk_client: 'a UK client',
  job_post: 'a job post',
  other: 'elsewhere',
}

export const widerStatusWord: Record<WiderLeadStatus, string> = {
  spotted: 'Spotted',
  passed: 'Passed',
  meeting_booked: 'Meeting',
  job_won: 'Won',
  placed: 'Placed',
  not_pursued: 'Not pursued',
}

export const widerStatusPills: WiderLeadStatus[] = ['spotted', 'passed', 'meeting_booked', 'job_won', 'placed', 'not_pursued']

/** The four standing coaching questions (9.2, COA-3), in the order asked. */
export const coachingQuestions: { key: keyof CoachingSession['answers']; question: string }[] = [
  { key: 'interviewedWhere', question: 'Where have you interviewed?' },
  { key: 'whoElseLooking', question: 'Who else do you know who is looking?' },
  { key: 'howTheyHire', question: 'How do they hire?' },
  { key: 'eventsRated', question: 'Which events were worth it?' },
]

function plusDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

export function thisMonday(clock: UkClock): string {
  return plusDays(clock.date, 1 - clock.isoDay)
}

/** Sessions held since Monday, for the N/5 hero. */
export function heldThisWeek(sessions: CoachingSession[], clock: UkClock): number {
  const monday = thisMonday(clock)
  return sessions.filter((s) => s.status === 'held' && s.heldAt !== null && s.heldAt.slice(0, 10) >= monday).length
}

/** Booked and still to come this week. */
export function bookedThisWeek(sessions: CoachingSession[], clock: UkClock, now: Date): number {
  const sunday = plusDays(thisMonday(clock), 6)
  return sessions.filter((s) => s.status === 'booked' && s.bookedFor !== null && s.bookedFor >= now.toISOString() && s.bookedFor.slice(0, 10) <= sunday).length
}

/** Newest first: the next booked at the top, then held ones most recent first (28.3). */
export function bySessionOrder(a: CoachingSession, b: CoachingSession): number {
  const when = (s: CoachingSession) => s.heldAt ?? s.bookedFor ?? ''
  return when(b).localeCompare(when(a))
}

/** Tue 14:30 for a booking, Held for a held session, in UK time. */
export function sessionMeta(s: CoachingSession): string {
  if (s.status === 'held') return 'Held'
  if (s.status === 'no_show') return 'No show'
  if (s.status === 'cancelled') return 'Cancelled'
  if (!s.bookedFor) return ''
  const d = new Date(s.bookedFor)
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
  return `${day} ${time}`
}

export function daysSince(date: string, today: string): number {
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)
  return Math.max(0, Math.round(ms / 86_400_000))
}

/** A warm opening line that names the referrer (28.4). The owner edits it before it goes anywhere. */
export function referralOpening(r: Referral): string {
  const first = r.referredName.split(/\s+/)[0]
  return `Hi ${first}, ${r.referredByName} suggested we speak. I work on product marketing hires into the US from London, and ${r.referredByName} thought it might be worth a short call. Would a few minutes this week suit?`
}

/** The passed leads awaiting an outcome come after the spotted ones (28.8). */
export function byWiderOrder(a: WiderLead, b: WiderLead): number {
  const g = (w: WiderLead) => (w.status === 'spotted' ? 0 : 1)
  if (g(a) !== g(b)) return g(a) - g(b)
  return b.createdAt.localeCompare(a.createdAt)
}

export function widerTitle(w: WiderLead): string {
  return w.role ?? `Hiring in ${functionWord[w.function] ?? w.function}`
}

/** Passed since the first day of this quarter, UK time. */
export function passedThisQuarter(leads: WiderLead[], clock: UkClock): number {
  const month = Number(clock.date.slice(5, 7))
  const quarterStart = `${clock.date.slice(0, 4)}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')}-01`
  return leads.filter((w) => w.passedOn !== null && w.passedOn >= quarterStart).length
}

/** The introduction to the colleague, with the context (28.8). */
export function widerIntroduction(w: WiderLead, colleague: string): string {
  const who = colleague.trim() ? colleague.trim().split(/\s+/)[0] : 'there'
  const from = w.mentionedByName ? `${w.mentionedByName} mentioned it on ${widerSourceWord[w.source] ?? w.source}` : `it came up on ${widerSourceWord[w.source] ?? w.source}`
  const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')
  const role = w.role ? `${article(w.role)} ${w.role}` : `someone in ${functionWord[w.function] ?? w.function}`
  return `Hi ${who}, ${w.company} is looking for ${role} in the ${w.country === 'UK' ? 'UK' : 'US'}. ${from}. ${w.existingClient ? 'They are an existing client, so please go through the account owner. ' : ''}Happy to make the introduction.`
}
