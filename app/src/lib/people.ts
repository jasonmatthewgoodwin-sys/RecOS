// Pure helpers for the People lists (sections 14.6, 23.4, 29.1). No data
// access here.

import type { Member, Tier } from './data'

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

/** Within a tier: late first, most late first, then by name. */
export function byTierOrder(a: Member, b: Member): number {
  const t = tiers.indexOf(a.tier) - tiers.indexOf(b.tier)
  if (t !== 0) return t
  if (a.daysLate !== b.daysLate) return b.daysLate - a.daysLate
  return a.name.localeCompare(b.name)
}

/** The N/50 figure for ON CADENCE: members neither late nor due. */
export function onCadence(members: Member[]): number {
  return members.filter((m) => m.state === 'fine').length
}
