import type { ContentItem, ContentStatus } from './data'
import { shiftDate, weekdayOf } from './time'

// The content calendar (31.2, and the calendar handover of 14 November 2026
// brought into the RecOS look): one week at a time, Monday to Friday, a
// weekend day only when something sits on it. No month view.

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** The seven plain dates from a Monday. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i))
}

/** The day a post sits on: the day it was posted, else the day it is planned for. */
export function dayOf(c: ContentItem): string | null {
  return c.status === 'posted' ? (c.postedOn ?? c.plannedFor) : c.plannedFor
}

/** A post, not an idea or a testimonial, and not binned. */
export function isPost(c: ContentItem): boolean {
  return c.kind !== 'idea' && c.kind !== 'testimonial' && c.kind !== 'case_study' && c.status !== 'binned'
}

export function postsOn(items: ContentItem[], date: string): ContentItem[] {
  return items.filter((c) => isPost(c) && dayOf(c) === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Monday to Friday, plus a weekend day only when a post sits on it. */
export function visibleDays(items: ContentItem[], monday: string): string[] {
  return weekDates(monday).filter((d, i) => i < 5 || postsOn(items, d).length > 0)
}

/** Posts marked posted in the week that starts on this Monday. */
export function postedInWeek(items: ContentItem[], monday: string): number {
  const end = shiftDate(monday, 6)
  return items.filter((c) => isPost(c) && c.status === 'posted' && c.postedOn !== null && c.postedOn >= monday && c.postedOn <= end).length
}

/** Approved drafts with no day yet: the second number (31.2). */
export function readyDrafts(items: ContentItem[]): ContentItem[] {
  return items.filter((c) => isPost(c) && c.status === 'approved' && c.plannedFor === null).sort((a, b) => b.rank - a.rank)
}

export const stateWord: Record<ContentStatus, string> = {
  idea: 'Idea',
  draft: 'Draft',
  approved: 'Ready',
  planned: 'Planned',
  posted: 'Posted',
  held: 'Held',
  binned: 'Binned',
}

/** The states the composer offers. */
export const composerStates: { value: ContentStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'planned', label: 'Planned' },
  { value: 'posted', label: 'Posted' },
]

/** The whole post as one text: hook, body, close, a blank line between. */
export function copyOf(c: ContentItem): string {
  return [c.hook, c.body, c.closeLine].filter((s) => s && s.trim()).join('\n\n')
}

/** Back from the text: the first paragraph is the hook, the last the close when there are three or more. */
export function splitCopy(copy: string): { hook: string | null; body: string; closeLine: string | null } {
  const parts = copy
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length <= 1) return { hook: null, body: copy.trim(), closeLine: null }
  if (parts.length === 2) return { hook: parts[0], body: parts[1], closeLine: null }
  return { hook: parts[0], body: parts.slice(1, -1).join('\n\n'), closeLine: parts[parts.length - 1] }
}

/** The topic a hand-written post files under: its first line, 80 characters at most. */
export function topicFrom(copy: string): string {
  const line = copy.split('\n').map((l) => l.trim()).find(Boolean) ?? 'A post'
  return line.length > 80 ? `${line.slice(0, 77).trimEnd()}...` : line
}

export function topicKey(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Tuesday 10 November. */
export function dayTitle(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  return `${weekdayOf(date)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** MON 09, for the row label. */
export function dayLabel(date: string, index: number): string {
  return `${DAY_NAMES[index]} ${date.slice(8, 10)}`
}

/** Whole days between two plain dates. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}
