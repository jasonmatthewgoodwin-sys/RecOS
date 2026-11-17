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
  { value: 'job_lead', label: 'Ad and post chasers' },
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
  a8_campaigns: 'the campaign runner',
  a9_tasks: 'the task assistant',
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

// ------------------------------------------------ two panes and folders
// The two-pane Inbox and the owner's folders (Jason, 2026-11-14).

/**
 * Which box the left side has chosen: Inbox (unfiled), one of the owner's
 * folders, or one of the three looking-back views.
 */
export type InboxBox = 'inbox' | 'sent' | 'done' | 'binned' | `folder:${string}` | `auto:${AutoFolder}`

/**
 * The automatic folders (Jason, 17 November 2026): every waiting item that is
 * not in one of his own folders also shows in one of these four, worked out
 * from what the item is. Nothing is stored; filing it in his own folder takes
 * it out of them.
 */
export type AutoFolder = 'clients' | 'candidates' | 'leads' | 'other'

export const autoFolders: { key: AutoFolder; label: string }[] = [
  { key: 'clients', label: 'Clients' },
  { key: 'candidates', label: 'Candidates' },
  { key: 'leads', label: 'Job leads' },
  { key: 'other', label: 'Other' },
]

export function autoBox(key: AutoFolder): InboxBox {
  return `auto:${key}`
}

export function autoOf(box: InboxBox): AutoFolder | null {
  const k = box.startsWith('auto:') ? box.slice(5) : null
  return autoFolders.some((f) => f.key === k) ? (k as AutoFolder) : null
}

/** A company name as a key: lower case, single spaces. */
export function companyKey(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Which automatic folder an item belongs in. Clients: a client nudge, or
 * anything about a company that has a live search (clientKeys). Job leads:
 * job and wider leads. Candidates: follow-ups, call write-ups, referrals and
 * signals about people. Other: drafts, event ideas, notices, sent for you.
 */
export function autoFolderOf(item: Pick<InboxItem, 'type' | 'company'>, clientKeys: ReadonlySet<string> = new Set()): AutoFolder {
  if (item.type === 'client_nudge') return 'clients'
  if (item.type === 'job_lead' || item.type === 'wider_lead') return 'leads'
  if (item.company && clientKeys.has(companyKey(item.company))) return 'clients'
  if (item.type === 'follow_up' || item.type === 'call_writeup' || item.type === 'referral' || item.type === 'signal') return 'candidates'
  return 'other'
}

export function folderBox(id: string): InboxBox {
  return `folder:${id}`
}

export function folderIdOf(box: InboxBox): string | null {
  return box.startsWith('folder:') ? box.slice(7) : null
}

/** Waiting items in a box: Inbox holds the unfiled ones, a folder its own. */
export function inBox(items: InboxItem[], box: InboxBox, clientKeys: ReadonlySet<string> = new Set()): InboxItem[] {
  const folder = folderIdOf(box)
  const auto = autoOf(box)
  if (auto) return waiting(items).filter((i) => !i.folderId && autoFolderOf(i, clientKeys) === auto)
  if (box === 'inbox') return waiting(items).filter((i) => !i.folderId)
  if (folder) return waiting(items).filter((i) => i.folderId === folder)
  return []
}

/** How many wait in Inbox and in each folder, for the left side. */
export type BoxCounts = { inbox: number; folders: Record<string, number>; auto: Record<AutoFolder, number> }

export function boxCounts(items: InboxItem[], clientKeys: ReadonlySet<string> = new Set()): BoxCounts {
  const folders: Record<string, number> = {}
  const auto: Record<AutoFolder, number> = { clients: 0, candidates: 0, leads: 0, other: 0 }
  let inbox = 0
  for (const i of waiting(items)) {
    if (i.folderId) folders[i.folderId] = (folders[i.folderId] ?? 0) + 1
    else {
      inbox++
      auto[autoFolderOf(i, clientKeys)]++
    }
  }
  return { inbox, folders, auto }
}

const typeName: Record<InboxType, string> = {
  job_lead: 'Job lead',
  signal: 'Signal',
  content_draft: 'Draft',
  event_idea: 'Event idea',
  call_writeup: 'Call',
  follow_up: 'Follow-up',
  referral: 'Referral',
  client_nudge: 'Nudge',
  wider_lead: 'Wider lead',
  auto_sent: 'Sent for you',
  system_notice: 'RecOS',
}

/** Who or which company, for the first line of a row. */
export function whoOf(item: InboxItem): string {
  return item.company ?? typeName[item.type]
}

/** A short age for a row: now, 40m, 3h, 2d, 5w. */
export function ageWord(createdAt: string, now: Date): string {
  const mins = Math.max(0, Math.floor((now.getTime() - Date.parse(createdAt)) / 60_000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

/** A folder name is 1 to 40 characters and not taken, whatever the case. */
export function folderNameProblem(name: string, taken: string[]): string | undefined {
  const t = name.trim()
  if (t.length === 0) return 'Give it a name'
  if (t.length > 40) return 'Keep it to 40 characters'
  if (['inbox', 'sent for you', 'done', 'binned', ...autoFolders.map((f) => f.label.toLowerCase())].includes(t.toLowerCase())) return 'That name is already a folder here'
  if (taken.some((n) => n.trim().toLowerCase() === t.toLowerCase())) return 'That name is taken'
  return undefined
}

/** Count by type, in words, for the Clear old items confirmation (INBX-5). */
export function countByType(items: InboxItem[]): string {
  const counts = new Map<InboxType, number>()
  for (const i of items) counts.set(i.type, (counts.get(i.type) ?? 0) + 1)
  return [...counts.entries()].map(([t, n]) => `${n} ${typeWord[t].toLowerCase()}`).join(', ')
}
