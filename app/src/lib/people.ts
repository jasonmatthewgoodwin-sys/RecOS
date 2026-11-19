// Pure helpers for the People lists (sections 14.6, 23.4, 29.1). No data
// access here.

import type { ContactHow, ContactStatus, Member, Rhythm, Tier } from './data'
import type { Tone } from '../theme/tokens'
import { cityName } from './leads'

export const tiers: Tier[] = ['premier', 'championship', 'league_one']

export const tierWord: Record<Tier, string> = { premier: 'Premier', championship: 'Championship', league_one: 'League One' }

/** The tier in small capitals for a row's meta (29.1). */
export const tierShort: Record<Tier, string> = { premier: 'PREMIER', championship: 'CHAMP', league_one: 'ONE' }

/** Seats per tier within a list, from section 10.2: 20, 15, 15 of 50. */
export const tierSeats: Record<Tier, number> = { premier: 20, championship: 15, league_one: 15 }

export const signalWord: Record<string, string> = {
  new_role: 'NEW ROLE',
  promoted: 'PROMOTED',
  company_raised: 'RAISED',
  company_hiring: 'HIRING',
  open_to_work: 'OPEN',
  speaker_idea: 'SPEAKER',
  placed_anniversary: 'ANNIVERSARY',
  left_company: 'MOVED',
}

/** 3w, 2d, Today: how long since the last touch. */
export function sinceWord(lastTouchOn: string | null, today: string): string {
  if (!lastTouchOn) return 'Never'
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastTouchOn}T00:00:00Z`)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days < 7) return `${days}d`
  if (days < 56) return `${Math.floor(days / 7)}w`
  return `${Math.floor(days / 30)}m`
}

/**
 * This week's suggestions (23.4), from the members of one list: anyone with a
 * live signal, strongest first; then premier members who are late, then due;
 * then championship late; then League One more than one cycle late.
 */
export function thisWeek(members: Member[], limit = 8): Member[] {
  const rank = (m: Member): number => {
    if (m.liveSignal) return 0
    // With a contact rhythm (0061): overdue, then due this week.
    if (m.contactStatus) return m.contactStatus === 'overdue' ? 1 : m.contactStatus === 'due' ? 2 : 9
    if (m.tier === 'premier' && m.state === 'late') return 1
    if (m.tier === 'premier' && m.state === 'due') return 2
    if (m.tier === 'championship' && m.state === 'late') return 3
    if (m.tier === 'league_one' && m.missedCycles >= 1) return 4
    return 9
  }
  return members
    .filter((m) => rank(m) < 9)
    .sort((a, b) => rank(a) - rank(b) || b.daysLate - a.daysLate)
    .slice(0, limit)
}

/** Within a tier: overdue first (a contact rhythm), then late first, most late first, then by name. */
export function byTierOrder(a: Member, b: Member): number {
  const t = tiers.indexOf(a.tier) - tiers.indexOf(b.tier)
  if (t !== 0) return t
  const r = contactRank(a) - contactRank(b)
  if (r !== 0) return r
  if (a.daysLate !== b.daysLate) return b.daysLate - a.daysLate
  return a.name.localeCompare(b.name)
}

/** The N/50 figure for ON CADENCE: members neither late nor due; with a contact rhythm, on track. */
export function onCadence(members: Member[]): number {
  return members.filter((m) => (m.contactStatus ? m.contactStatus === 'on_track' : m.state === 'fine')).length
}

/** The DUE figure: with a contact rhythm, due this week or overdue; else late or due by tier. */
export function dueCount(members: Member[]): number {
  return members.filter((m) => (m.contactStatus ? m.contactStatus !== 'on_track' : m.state !== 'fine')).length
}

// ---- The senior network (Jason, 19 November 2026): LinkedIn profile, how
// you know them, last contact and a contact rhythm.

export const rhythms: Rhythm[] = [30, 60, 90, null]

export function rhythmWord(r: Rhythm): string {
  return r ? `Every ${r} days` : 'None'
}

export const howWord: Record<ContactHow, string> = {
  call: 'call',
  email: 'email',
  linkedin_message: 'LinkedIn message',
  linkedin_request: 'LinkedIn request',
  meeting: 'meeting',
  event: 'event',
  other: 'noted',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 12 Nov, 27 Sep: three letters always, as the database writes it in a task title (never "Sept"). */
export function dayMonth(date: string): string {
  const [, m, d] = date.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

/** Last contact: 12 Nov, call. Or Last contact: Never. */
export function lastContactWords(on: string | null, how: ContactHow | null): string {
  if (!on) return 'Last contact: Never'
  return `Last contact: ${dayMonth(on)}, ${howWord[how ?? 'other']}`
}

export const contactStatusWord: Record<ContactStatus, string> = { overdue: 'Overdue', due: 'Due', on_track: 'On track' }

/** The tone dots: overdue needs you, due is waiting, on track is settled. */
export const contactTone: Record<ContactStatus, Tone> = { overdue: 'action', due: 'pending', on_track: 'clear' }

export function contactRank(m: Pick<Member, 'contactStatus'>): number {
  return m.contactStatus === 'overdue' ? 0 : m.contactStatus === 'due' ? 1 : m.contactStatus === 'on_track' ? 2 : 3
}

/** Overdue in one line: "Overdue since 3 Nov", "Due by 22 Nov", "On track, next by 10 Jan". */
export function contactLine(m: Pick<Member, 'contactStatus' | 'nextContactOn'>): string | null {
  if (!m.contactStatus || !m.nextContactOn) return null
  const d = dayMonth(m.nextContactOn)
  if (m.contactStatus === 'overdue') return `Overdue since ${d}`
  if (m.contactStatus === 'due') return `Due by ${d}`
  return `On track, next by ${d}`
}

/** The Due or overdue filter: overdue first, then the nearest date. */
export function dueOrOverdue(members: Member[]): Member[] {
  return members
    .filter((m) => m.contactStatus === 'overdue' || m.contactStatus === 'due')
    .sort((a, b) => contactRank(a) - contactRank(b) || (a.nextContactOn ?? '').localeCompare(b.nextContactOn ?? '') || a.name.localeCompare(b.name))
}

/** A list works by contact rhythm when anyone on it has one. The senior network starts at every 60 days. */
export function usesRhythm(members: Member[], listKey?: string): boolean {
  return listKey === 'senior_network' || members.some((m) => m.contactEveryDays !== null)
}

/** City, country: Boston, United States. */
export function placeLine(city: string | null, country: string | null): string {
  return [cityName(city), country ?? ''].filter(Boolean).join(', ')
}

/** Where the profile fields came from: From LinkedIn, read 3 Nov. Or waiting, or why the reader could not. */
export function linkedinLine(m: Pick<Member, 'linkedinQueued' | 'linkedinReadAt' | 'linkedinError'>): string | null {
  if (m.linkedinQueued) return 'Waiting for the LinkedIn reader'
  if (m.linkedinReadAt) return `From LinkedIn, read ${dayMonth(m.linkedinReadAt)}`
  if (m.linkedinError) return `The LinkedIn reader could not read it: ${m.linkedinError}`
  return null
}

/**
 * A linkedin.com/in/ link, tidied to https://www.linkedin.com/in/<name>, as
 * the database does it (set_person_linkedin). Null when it is not one.
 */
export function linkedinProfileUrl(text: string): string | null {
  const t = text.trim()
  if (!/^(https?:\/\/)?([a-z]{2,3}\.)?(www\.)?linkedin\.com\/in\/[A-Za-z0-9%_.-]+\/?([?#].*)?$/i.test(t)) return null
  const slug = /linkedin\.com\/in\/([A-Za-z0-9%_.-]+)/i.exec(t)![1]
  return `https://www.linkedin.com/in/${slug}`
}
