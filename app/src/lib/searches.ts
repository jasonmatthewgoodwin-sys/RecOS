import type { CandidateStage, Search, SearchCandidate, SearchPriority } from './data'
import type { Tone } from '../theme/tokens'

// Searches and the candidates in play (30, 31.1): words, order and the
// small rules the pages run on. Nothing here reads a CV or a note.

export const priorityWord: Record<SearchPriority, string> = { focus: 'Focus', active: 'Active', maintenance: 'Maintenance', dormant: 'Dormant' }
export const priorityOrder: SearchPriority[] = ['focus', 'active', 'maintenance', 'dormant']

export const stageWord: Record<CandidateStage, string> = {
  sourced: 'Sourced',
  spoken: 'Spoken',
  submitted: 'Submitted',
  first_stage: 'First stage',
  later_stage: 'Later stage',
  offer: 'Offer',
  placed: 'Placed',
  rejected: 'Rejected',
  withdrew: 'Withdrew',
}
export const stageOrder: CandidateStage[] = ['sourced', 'spoken', 'submitted', 'first_stage', 'later_stage', 'offer', 'placed', 'rejected', 'withdrew']
export const inPlay: CandidateStage[] = ['sourced', 'spoken', 'submitted', 'first_stage', 'later_stage', 'offer']

export const healthWord = { warm: 'Warm', cooling: 'Cooling', cold: 'Cold' } as const
export const statusWord = { intake: 'Intake', open: 'Open', offer: 'At offer', placed: 'Placed', lost: 'Lost', on_hold: 'On hold', closed: 'Closed' } as const

export const offerWord = { expected: 'Expected', verbal: 'Verbal', written: 'Written', accepted: 'Accepted', declined: 'Declined' } as const

export function isLive(s: Search): boolean {
  return s.status === 'intake' || s.status === 'open' || s.status === 'offer'
}

/** The four counts spoken . submitted . interviewing . offer, as one mono line (30.1). */
export function numberLine(s: Search): string {
  return [s.nSpoken, s.nSubmitted, s.nFirstStage + s.nLaterStage, s.nOffer].join(' . ')
}

export function searchTone(s: Search): Tone {
  if (s.status === 'placed') return 'clear'
  if (s.health === 'cold') return 'action'
  if (s.health === 'cooling' || s.status === 'offer') return 'pending'
  return 'new'
}

/** Working days between two plain dates, Monday to Friday. */
export function workingDaysBetween(from: string, to: string): number {
  let n = 0
  const a = new Date(`${from}T12:00:00Z`)
  const b = new Date(`${to}T12:00:00Z`)
  for (let d = new Date(a); d < b; d.setUTCDate(d.getUTCDate() + 1)) {
    const next = new Date(d)
    next.setUTCDate(next.getUTCDate() + 1)
    const dow = next.getUTCDay()
    if (dow !== 0 && dow !== 6) n += 1
  }
  return n
}

/** FEEDBACK 4D when a submission has waited that many working days (30.4). */
export function feedbackWord(c: SearchCandidate, today: string): string | undefined {
  if (c.stage !== 'submitted' || !c.submittedOn || c.feedbackReceivedOn) return undefined
  const days = workingDaysBetween(c.submittedOn, today)
  return days >= 1 ? `Feedback ${days}d` : undefined
}

/** Waiting on the desk, or feedback late (30.4): the solid dot. */
export function candidateNeedsDesk(c: SearchCandidate, today: string): boolean {
  if (c.stage === 'submitted' && c.submittedOn && !c.feedbackReceivedOn) return workingDaysBetween(c.submittedOn, today) >= 3
  if (c.stage === 'offer') return true
  return false
}

/** Health by rule (14.5, the short form): cold after 7 working days of no client contact on a live search, cooling after 4. Dormant searches never cool. */
export function healthOf(s: Search, today: string): { health: Search['health']; reason: string | null } {
  if (!isLive(s) || s.priority === 'dormant') return { health: 'warm', reason: null }
  const since = s.lastClientContactOn ?? s.openedOn
  const days = workingDaysBetween(since, today)
  if (days >= 7) return { health: 'cold', reason: `No client contact for ${days} working days` }
  if (days >= 4) return { health: 'cooling', reason: `No client contact for ${days} working days` }
  return { health: 'warm', reason: null }
}

export const briefFields: { key: string; label: string }[] = [
  { key: 'why_open', label: 'Why the role is open' },
  { key: 'reports_to', label: 'Reports to' },
  { key: 'first_90', label: 'The first 90 days' },
  { key: 'good_at_six', label: 'What good looks like at month six' },
  { key: 'must_have', label: 'Must have' },
  { key: 'nice_to_have', label: 'Nice to have' },
  { key: 'comp_band', label: 'Band and level, in words' },
  { key: 'process', label: 'The process and who sits in it' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'competition', label: 'Who else they have seen' },
]

export const closeChecks: { key: string; label: string }[] = [
  { key: 'crm_placement', label: 'Placement recorded in the CRM' },
  { key: 'start_date', label: 'Start date set' },
  { key: 'aftercare', label: 'Aftercare dates in the diary' },
  { key: 'testimonial_client', label: 'Testimonial asked from the client' },
  { key: 'testimonial_candidate', label: 'Testimonial asked from the candidate' },
  { key: 'referral_ask', label: 'Referral asked' },
  { key: 'account_growth', label: 'Account growth question asked' },
]

export const writeUpTicks: { key: 'wRecord' | 'wCv' | 'wNote' | 'wOnSearch' | 'wFollowUp'; label: string }[] = [
  { key: 'wRecord', label: 'Record' },
  { key: 'wCv', label: 'CV' },
  { key: 'wNote', label: 'Note' },
  { key: 'wOnSearch', label: 'On search' },
  { key: 'wFollowUp', label: 'Follow-up' },
]

export const toolWord: Record<string, string> = { linkedin: 'LinkedIn', spott: 'Spott', email: 'Email', phone: 'Phone', other: 'Other' }
