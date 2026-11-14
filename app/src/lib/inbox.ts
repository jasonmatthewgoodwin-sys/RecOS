// Pure helpers for the Inbox (section 27). No data access here: the page asks
// data.ts for rows and this file turns them into words, order and choices.

import type { InboxItem, InboxType } from './data'
import type { UkClock } from './time'

/** One word in mono capitals above the title (27.2). */
export const typeWord: Record<InboxType, string> = {
  job_lead: 'JOB',
  signal: 'SIGNAL',
  content_draft: 'DRAFT',
  event_idea: 'IDEA',
  call_writeup: 'CALL',
  follow_up: 'FOLLOW-UP',
  referral: 'REFERRAL',
  client_nudge: 'NUDGE',
  wider_lead: 'LEAD',
  auto_sent: 'AUTO',
  system_notice: 'NOTICE',
}

/** The list's type filter, in the order of 27.2. */
export const typeFilters: { value: InboxType; label: string }[] = [
  { value: 'job_lead', label: 'Jobs' },
  { value: 'signal', label: 'Signals' },
  { value: 'content_draft', label: 'Drafts' },
  { value: 'call_writeup', label: 'Calls' },
  { value: 'referral', label: 'Referrals' },
  { value: 'client_nudge', label: 'Nudges' },
  { value: 'wider_lead', label: 'Wider leads' },
  { value: 'event_idea', label: 'Ideas' },
  { value: 'follow_up', label: 'Follow-ups' },
  { value: 'system_notice', label: 'Notices' },
]

/** The primary button, named for the item type (27.2). */
export const primaryWord: Record<InboxType, string> = {
  job_lead: 'Chased',
  signal: 'Get in touch',
  content_draft: 'Approve',
  call_writeup: 'Confirm',
  referral: 'Contacted',
  client_nudge: 'Send',
  wider_lead: 'Pass on',
  event_idea: 'Keep',
  system_notice: 'Fix',
  follow_up: 'Done',
  auto_sent: 'Open',
}

/**
 * Three quick reasons per type, then Other (27.2). The design names no list,
 * so these are the builder's first words; see docs/decisions.md.
 */
export const binReasons: Record<InboxType, string[]> = {
  job_lead: ['Not a fit', 'Already known', 'Filled'],
  signal: ['Not relevant', 'Already in touch', 'Wrong person'],
  content_draft: ['Off topic', 'Not now', 'Said it before'],
  call_writeup: ['Not a real call', 'Duplicate', 'Nothing to record'],
  referral: ['Not relevant', 'Already known', 'No details'],
  client_nudge: ['Not needed', 'Already handled', 'Wrong client'],
  wider_lead: ['Not a fit', 'Already known', 'No one to pass to'],
  event_idea: ['Not now', 'Done before', 'Too small'],
  follow_up: ['Not needed', 'Already done', 'Wrong person'],
  system_notice: ['Fixed already', 'Not a problem', 'Later'],
  auto_sent: ['Not relevant', 'Already handled', 'Duplicate'],
}

/** Which agent found it, in words, for the quiet line at the foot of the card (27.4). */
export const agentWord: Record<string, string> = {
  a1_review: 'the review agent',
  a2_content: 'the content agent',
  a3_jobs: 'the jobs agent',
  a4_signals: 'the signals agent',
  a5_followups: 'the follow-ups agent',
  a6_calls: 'the calls agent',
  a7_events: 'the events agent',
  manual: 'you',
  system: 'a rule',
}

export const DECK_LIMIT = 30

/** Needs the owner: new and stale, not what was sent for them (14.1). */
export function waiting(items: InboxItem[]): InboxItem[] {
  return items.filter((i) => (i.status === 'new' || i.status === 'stale') && i.type !== 'auto_sent')
}

/**
 * Deck order: notices first (23.3), then new before stale (INBX-5), highest
 * rank first, oldest first among equals.
 */
export function byDeckOrder(a: InboxItem, b: InboxItem): number {
  const notice = (i: InboxItem) => (i.type === 'system_notice' ? 0 : 1)
  if (notice(a) !== notice(b)) return notice(a) - notice(b)
  const stale = (i: InboxItem) => (i.status === 'stale' ? 1 : 0)
  if (stale(a) !== stale(b)) return stale(a) - stale(b)
  if (a.rank !== b.rank) return b.rank - a.rank
  return a.createdAt.localeCompare(b.createdAt)
}

/** The first 30 by deck order. The rest wait (INBX-6). */
export function deckOf(items: InboxItem[]): InboxItem[] {
  return waiting(items).sort(byDeckOrder).slice(0, DECK_LIMIT)
}

/** Whole days the oldest waiting item has sat there, or null when nothing waits. */
export function oldestDays(items: InboxItem[], now: Date): number | null {
  const w = waiting(items)
  if (w.length === 0) return null
  const oldest = Math.min(...w.map((i) => Date.parse(i.createdAt)))
  return Math.max(0, Math.floor((now.getTime() - oldest) / 86_400_000))
}

export function isLate(item: InboxItem, today: string): boolean {
  return item.dueOn !== null && item.dueOn < today
}

function plusDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

export type Choice = { label: string; value: string }

/** Tomorrow, Thursday and next Monday as plain dates (27.7), from the UK clock. */
export function snoozeChoices(clock: UkClock): Choice[] {
  const toThursday = ((4 - clock.isoDay + 7) % 7) || 7
  const toMonday = ((1 - clock.isoDay + 7) % 7) || 7
  return [
    { label: 'Tomorrow', value: plusDays(clock.date, 1) },
    { label: 'Thursday', value: plusDays(clock.date, toThursday) },
    { label: 'Next Monday', value: plusDays(clock.date, toMonday) },
  ]
}

/** Tomorrow, the next weekday with nothing on, or a date typed in (27.2, content_draft). */
export function approveChoices(clock: UkClock): Choice[] {
  const tomorrow = plusDays(clock.date, 1)
  let free = tomorrow
  // The next free day is the first weekday after tomorrow. The calendar is not read yet.
  let d = plusDays(clock.date, 2)
  for (let i = 0; i < 7; i++) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay()
    if (dow !== 0 && dow !== 6) {
      free = d
      break
    }
    d = plusDays(d, 1)
  }
  return [
    { label: 'Tomorrow', value: tomorrow },
    { label: 'Next free day', value: free },
  ]
}

/** Count by type, in words, for the Clear old items confirmation (INBX-5). */
export function countByType(items: InboxItem[]): string {
  const counts = new Map<InboxType, number>()
  for (const i of items) counts.set(i.type, (counts.get(i.type) ?? 0) + 1)
  return [...counts.entries()].map(([t, n]) => `${n} ${typeWord[t].toLowerCase()}`).join(', ')
}
