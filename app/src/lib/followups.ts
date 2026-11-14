// Pure helpers for the Follow-ups page (sections 21 and 27.6 to 27.9). No
// data access here.

import type { FollowUp } from './data'
import type { UkClock } from './time'

function plusDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

/** Working days from d1 to d2, Monday to Friday, like the database helper (7.3). */
export function workingDays(d1: string, d2: string): number {
  let n = 0
  let d = d1
  while (d < d2) {
    d = plusDays(d, 1)
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay()
    if (dow !== 0 && dow !== 6) n++
  }
  return n
}

/** Due before today: the Home sense of late, and the deck's first group (21.4). */
export function isOverdue(f: FollowUp, today: string): boolean {
  return f.dueOn < today
}

/** FUP-3: the word Late shows 5 working days past the due date. */
export function isLate(f: FollowUp, today: string): boolean {
  return f.status === 'open' && f.dueOn < today && workingDays(f.dueOn, today) >= 5
}

/** Late first, then due today, each oldest first; waiting-on-them chases at the end (21.4). */
export function byDeckOrder(today: string) {
  return (a: FollowUp, b: FollowUp): number => {
    const group = (f: FollowUp) => (f.direction === 'waiting' ? 2 : isOverdue(f, today) ? 0 : 1)
    if (group(a) !== group(b)) return group(a) - group(b)
    if (a.dueOn !== b.dueOn) return a.dueOn.localeCompare(b.dueOn)
    return a.createdAt.localeCompare(b.createdAt)
  }
}

/** The deck: owed follow-ups due today or earlier, then the chases the owner is waiting on. */
export function deckOf(items: FollowUp[], today: string): FollowUp[] {
  return items
    .filter((f) => f.status === 'open' && (f.direction === 'waiting' || f.dueOn <= today))
    .sort(byDeckOrder(today))
}

/** 21.5: everyone spoken to last week who still has an open follow-up. */
export function mondayFocusOf(items: FollowUp[], clock: UkClock): FollowUp[] {
  const thisMonday = plusDays(clock.date, 1 - clock.isoDay)
  const lastMonday = plusDays(thisMonday, -7)
  return items
    .filter((f) => f.status === 'open' && f.direction === 'owed' && f.source === 'call')
    .filter((f) => {
      const made = f.createdAt.slice(0, 10)
      return made >= lastMonday && made < thisMonday
    })
    .sort(byDeckOrder(clock.date))
}

/** This Thursday, or next Thursday when today is Thursday or later (T-FUP-5). */
export function nextThursday(clock: UkClock): string {
  const to = ((4 - clock.isoDay + 7) % 7) || 7
  return plusDays(clock.date, to)
}

export const FOCUS_LIMIT_MINUTES = 90

/** Tue, or Today, or Mon 3w ago is too much: the row meta is the due weekday. */
export function dueWord(f: FollowUp, today: string): string {
  if (f.dueOn === today) return 'Today'
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return days[new Date(`${f.dueOn}T12:00:00Z`).getUTCDay()]
}

/**
 * The primary button (21.4, 27.7): Send for a one-click email, Open in
 * Outlook for a draft-only email, Copy for LinkedIn. Those three need the
 * send engine and the mail adapter (P1-26, P1-27), so until then every
 * follow-up's primary is Done and a draft can be copied from a link.
 */
export function primaryWord(f: FollowUp, engine = false): string {
  if (engine && f.message) {
    if (f.message.channel === 'linkedin') return 'Copy'
    return f.message.level === 'one_click' ? 'Send' : 'Open in Outlook'
  }
  return 'Done'
}

export const kindWord: Record<string, string> = {
  after_candidate_call: 'After a candidate call',
  after_coaching: 'After coaching',
  after_client_meeting: 'After a client meeting',
  after_interview: 'After an interview',
  after_submission: 'After a submission',
  rejection: 'Rejection',
  aftercare: 'Aftercare',
  after_event: 'After an event',
  league_cadence: 'League',
  email_owed: 'Email owed',
  chase: 'Chase',
  referral_thanks: 'Referral thanks',
  other: 'Other',
}

/** mm:ss for the quiet Monday timer. */
export function clockText(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
