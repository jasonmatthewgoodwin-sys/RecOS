// Pure helpers for the Leads tab (section 28). No data access here: the page
// asks data.ts for rows and this file turns them into words and numbers.

import type { JobLead, JobStage } from './data'

export const stages: JobStage[] = ['new', 'chased', 'replied', 'meeting_booked', 'job_won', 'dead', 'passed']

/** The six stage pills on the job card (28.2). Passed leaves the page, so it is not offered. */
export const stagePills: JobStage[] = ['new', 'chased', 'replied', 'meeting_booked', 'job_won', 'dead']

export const stageWord: Record<JobStage, string> = {
  new: 'New',
  chased: 'Chased',
  replied: 'Replied',
  meeting_booked: 'Meeting booked',
  job_won: 'Job won',
  dead: 'Dead',
  passed: 'Passed',
}

/** JOB-4, in the words the design uses. Expired is set by the nightly job, never chosen. */
export const deadReasons: { value: string; label: string }[] = [
  { value: 'no_reply', label: 'No reply' },
  { value: 'filled', label: 'Filled' },
  { value: 'other_agency', label: 'Uses another agency' },
  { value: 'in_house', label: 'In-house only' },
  { value: 'not_icp', label: 'Not ICP' },
  { value: 'other', label: 'Other' },
]

export function deadReasonWord(code: string | null): string {
  if (code === 'expired') return 'Expired'
  return deadReasons.find((r) => r.value === code)?.label ?? 'Other'
}

export const sourceWord: Record<string, string> = {
  alex_leads: "Alex's leads",
  linkedin_post: 'LinkedIn post',
  linkedin_advert: 'LinkedIn advert',
  manual: 'Added by hand',
  call: 'From a call',
}

/** Where the lead came from, in words: LinkedIn post or Alex's leads first, then whatever else it was seen in. */
export function leadSourceWord(sources: string[]): string | null {
  if (sources.includes('linkedin_post')) return sourceWord.linkedin_post
  if (sources.includes('alex_leads')) return sourceWord.alex_leads
  const first = sources[0]
  return first ? (sourceWord[first] ?? null) : null
}

/**
 * Where the LinkedIn outreach stands, in one short word (Jason, 18 November
 * 2026). Accepted means the poster took the request and Jason must message
 * them. Null when nothing has been asked yet.
 */
export function outreachShort(lead: Pick<JobLead, 'outreachStage' | 'connectMessageId'>): string | null {
  switch (lead.outreachStage) {
    case 'replied':
      return 'Replied'
    case 'messaged':
      return 'Messaged'
    case 'connected':
      return 'Accepted'
    case 'connection_sent':
      return 'Request sent'
    default:
      return lead.connectMessageId ? 'Request queued' : null
  }
}

/** 16 Nov. */
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`))
}

/** new_york becomes New York, remote_us becomes Remote US. */
export function cityName(city: string | null): string {
  if (!city) return ''
  return city
    .split('_')
    .map((w) => (w === 'us' || w === 'uk' ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Whole days from a plain date to today. */
export function daysSince(date: string, today: string): number {
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)
  return Math.max(0, Math.round(ms / 86_400_000))
}

export type JobFilter = 'new' | 'chased' | 'replied' | 'meeting' | 'sent' | 'accepted' | 'all'

export const filters: { value: JobFilter; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'chased', label: 'Chased' },
  { value: 'replied', label: 'Replied' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'sent', label: 'Request sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'all', label: 'All' },
]

export function matchesFilter(lead: JobLead, filter: JobFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'meeting') return lead.stage === 'meeting_booked'
  // The LinkedIn filters follow the outreach, on leads still open (Jason, 18 November 2026).
  const open = lead.stage !== 'dead' && lead.stage !== 'passed'
  if (filter === 'sent') return open && lead.outreachStage === 'connection_sent'
  if (filter === 'accepted') return open && lead.outreachStage === 'connected'
  return lead.stage === filter
}

/** Highest fit first (28.2). Leads with no score come last, then the oldest first. */
export function byFit(a: JobLead, b: JobLead): number {
  const fa = a.fitScore ?? -1
  const fb = b.fitScore ?? -1
  if (fa !== fb) return fb - fa
  return a.firstSeenOn.localeCompare(b.firstSeenOn)
}

export const LOWER_FIT = 40

/** The day a lead was posted, or the day it was first seen when that is unknown (0047). */
export function postedDay(lead: JobLead): string {
  return lead.postedOn ?? lead.firstSeenOn
}

/**
 * The Jobs list order (Jason, 16 November): the lower-fit group stays below the
 * line, and within each group the newest posting comes first.
 */
export function byPosted(a: JobLead, b: JobLead): number {
  const la = isLowerFit(a) ? 1 : 0
  const lb = isLowerFit(b) ? 1 : 0
  if (la !== lb) return la - lb
  const d = postedDay(b).localeCompare(postedDay(a))
  if (d !== 0) return d
  return (b.fitScore ?? -1) - (a.fitScore ?? -1)
}

export function isLowerFit(lead: JobLead): boolean {
  return lead.fitScore === null || lead.fitScore < LOWER_FIT
}

/** The stage the primary button moves to, or null when there is none (28.2). */
export function nextStage(stage: JobStage): JobStage | null {
  switch (stage) {
    case 'new':
      return 'chased'
    case 'chased':
      return 'replied'
    case 'replied':
      return 'meeting_booked'
    default:
      // Job won needs a search (JOBS-1). Dead and passed are the end.
      return null
  }
}

export function primaryLabel(lead: JobLead): string | null {
  if (lead.stage === 'new' && lead.existingClient) return 'Tell the account owner'
  const next = nextStage(lead.stage)
  return next ? stageWord[next] : null
}

export type Funnel = { found: number; chased: number; replied: number; meetings: number; won: number }

/** The last 8 weeks, counted from the stage dates (28.9). */
export function funnel(leads: JobLead[], today: string): Funnel {
  const start = new Date(Date.parse(`${today}T00:00:00Z`) - 56 * 86_400_000).toISOString().slice(0, 10)
  const since = (d: string | null) => d !== null && d >= start
  return {
    found: leads.filter((l) => since(l.firstSeenOn)).length,
    chased: leads.filter((l) => since(l.chasedOn)).length,
    replied: leads.filter((l) => since(l.repliedOn)).length,
    meetings: leads.filter((l) => since(l.meetingOn)).length,
    won: leads.filter((l) => since(l.wonOn)).length,
  }
}

export function funnelPairs(f: Funnel): { label: string; value: number }[] {
  return [
    { label: 'found', value: f.found },
    { label: 'chased', value: f.chased },
    { label: 'replied', value: f.replied },
    { label: 'meetings', value: f.meetings },
    { label: 'won', value: f.won },
  ]
}

/** Each step as a share of the one before, for the second line (28.9). Steps with nothing to compare are left out. */
export function funnelRatios(f: Funnel): string {
  const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`
  const parts = [
    f.found > 0 && `${pct(f.chased, f.found)} of found were chased`,
    f.chased > 0 && `${pct(f.replied, f.chased)} of chased replied`,
    f.replied > 0 && `${pct(f.meetings, f.replied)} of replies became meetings`,
    f.meetings > 0 && `${pct(f.won, f.meetings)} of meetings were won`,
  ].filter((p): p is string => typeof p === 'string')
  return parts.length > 0 ? parts.join('. ') : 'Nothing to compare yet'
}
