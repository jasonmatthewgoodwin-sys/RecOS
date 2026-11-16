// The Tasks tab's shape and rules. Pure functions only: the page asks data.ts
// for rows and this file decides the words, the band and the order.

export type TaskSource =
  | 'inbox_items'
  | 'follow_ups'
  | 'calendar_today'
  | 'searches'
  | 'search_candidates'
  | 'calls'
  | 'content_items'

export type TaskKind =
  | 'job_lead'
  | 'signal'
  | 'content_draft'
  | 'event_idea'
  | 'call_writeup'
  | 'follow_up'
  | 'referral'
  | 'client_nudge'
  | 'wider_lead'
  | 'system_notice'
  | 'suggestion'
  | 'prepare_call'
  | 'search_health'
  | 'feedback_chase'
  | 'call_confirm'
  | 'cv_chase'
  | 'content_approve'
  | 'content_post'

export type TaskLink = { label: string; url: string }

/** What the owner changed by hand. The agent's own words stay beside it. */
export type TaskEdits = {
  title: string | null
  notes: string | null
  dueOn: string | null
  sortOrder: number | null
}

export type Task = {
  /** source:id, the key the overrides table uses. */
  key: string
  source: TaskSource
  sourceId: string
  kind: TaskKind
  title: string
  why: string | null
  personName: string | null
  company: string | null
  dueOn: string | null
  rank: number
  /** Who or what this is waiting on. Null when nothing blocks it. */
  waitingOn: string | null
  draft: string | null
  draftOriginal: string | null
  subject: string | null
  channel: 'email' | 'linkedin' | null
  messageId: string | null
  messageState: string | null
  /** Where the context lives: the CV in the CRM, the call notes, the thread. Never the content itself. */
  links: TaskLink[]
  refTable: string | null
  refId: string | null
  agent: string | null
  searchId: string | null
  createdAt: string
  stale: boolean
  edits: TaskEdits
}

export type Band = 'now' | 'week' | 'later'
export type TaskStatus = 'late' | 'today' | 'waiting' | 'on_track'

export const typeWord: Record<TaskKind, string> = {
  job_lead: 'Job',
  signal: 'Signal',
  content_draft: 'Draft',
  event_idea: 'Idea',
  call_writeup: 'Call',
  follow_up: 'Follow-up',
  referral: 'Referral',
  client_nudge: 'Nudge',
  wider_lead: 'Lead',
  system_notice: 'Notice',
  suggestion: 'Suggested',
  prepare_call: 'Prepare',
  search_health: 'Search',
  feedback_chase: 'Feedback',
  call_confirm: 'Confirm',
  cv_chase: 'CV',
  content_approve: 'Draft',
  content_post: 'Post',
}

/** The primary button for each kind (27.2, extended for the derived kinds). */
export function primaryLabel(task: Task): string {
  switch (task.kind) {
    case 'job_lead':
      return 'Chased'
    case 'signal':
      return 'Get in touch'
    case 'content_draft':
    case 'content_approve':
      return 'Approve'
    case 'call_writeup':
    case 'call_confirm':
      return 'Confirm'
    case 'referral':
      return 'Contacted'
    case 'client_nudge':
      return task.messageId ? 'Send' : 'Done'
    case 'wider_lead':
      return 'Pass on'
    case 'event_idea':
      return 'Keep'
    case 'system_notice':
      return 'Fix'
    case 'prepare_call':
      return 'Ready'
    case 'cv_chase':
      return 'Received'
    case 'content_post':
      return 'Posted'
    case 'follow_up':
      return task.messageId && task.channel === 'email' ? 'Send' : 'Done'
    default:
      return 'Done'
  }
}

export function shownTitle(task: Task): string {
  return task.edits.title?.trim() || task.title
}

export function effectiveDue(task: Task): string | null {
  return task.edits.dueOn ?? task.dueOn
}

/** The Monday of the week holding a plain date, as a plain date. */
function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  const back = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - back)
  return d.toISOString().slice(0, 10)
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Now: due today or late, or urgent by rank. This week: due by Sunday. Later: the rest. */
export function band(task: Task, today: string): Band {
  const due = effectiveDue(task)
  if (task.kind === 'system_notice') return 'now'
  if (due !== null && due <= today) return 'now'
  if (task.rank >= 50) return 'now'
  const sunday = addDays(mondayOf(today), 6)
  if (due !== null && due <= sunday) return 'week'
  if (task.rank >= 30) return 'week'
  return 'later'
}

/** Shown as a colour mark and a word. Waiting beats the date. */
export function status(task: Task, today: string): TaskStatus {
  if (task.waitingOn) return 'waiting'
  const due = effectiveDue(task)
  if (due !== null && due < today) return 'late'
  if (due === today) return 'today'
  return 'on_track'
}

export const statusWord: Record<TaskStatus, string> = {
  late: 'Late',
  today: 'Today',
  waiting: 'Waiting',
  on_track: 'On track',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Today, Mon, or 3 Dec. Late dates read as the day they fell due. */
export function dueWord(task: Task, today: string): string {
  const due = effectiveDue(task)
  if (due === null) return ''
  if (due === today) return 'Today'
  const d = new Date(`${due}T12:00:00Z`)
  const days = Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
  if (days > -7 && days < 7) return DAYS[d.getUTCDay()]
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)
}

/** The owner's order first, then late before the rest (21.4), then rank, then the nearer due date, then the oldest. */
export function byOrder(today: string): (a: Task, b: Task) => number {
  return (a, b) => {
    const oa = a.edits.sortOrder
    const ob = b.edits.sortOrder
    if (oa !== null && ob !== null && oa !== ob) return oa - ob
    if (oa !== null && ob === null) return -1
    if (oa === null && ob !== null) return 1
    const la = status(a, today) === 'late'
    const lb = status(b, today) === 'late'
    if (la !== lb) return la ? -1 : 1
    if (a.rank !== b.rank) return b.rank - a.rank
    const da = effectiveDue(a) ?? '9999'
    const db = effectiveDue(b) ?? '9999'
    if (da !== db) return da.localeCompare(db)
    return a.createdAt.localeCompare(b.createdAt)
  }
}

export type TaskFilter = 'now' | 'week' | 'later' | 'waiting' | 'all'

export const filters: { value: TaskFilter; label: string }[] = [
  { value: 'now', label: 'Now' },
  { value: 'week', label: 'This week' },
  { value: 'later', label: 'Later' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'all', label: 'All' },
]

export type Column = { key: 'now' | 'week' | 'later' | 'waiting'; label: string; tasks: Task[] }

/** Waiting tasks sit in their own column whatever their band. */
export function columns(tasks: Task[], today: string): Column[] {
  const sorted = [...tasks].sort(byOrder(today))
  const waiting = sorted.filter((t) => status(t, today) === 'waiting')
  const rest = sorted.filter((t) => status(t, today) !== 'waiting')
  return [
    { key: 'now', label: 'Now', tasks: rest.filter((t) => band(t, today) === 'now') },
    { key: 'week', label: 'This week', tasks: rest.filter((t) => band(t, today) === 'week') },
    { key: 'later', label: 'Later', tasks: rest.filter((t) => band(t, today) === 'later') },
    { key: 'waiting', label: 'Waiting', tasks: waiting },
  ]
}

/** Bin reasons by kind: three quick choices and Other (27.2). */
export function binReasons(kind: TaskKind): string[] {
  switch (kind) {
    case 'job_lead':
      return ['Not ICP', 'Filled', 'Uses another agency']
    case 'signal':
      return ['Not relevant', 'Already in touch', 'Wrong person']
    case 'content_draft':
    case 'content_approve':
      return ['Off topic', 'Too similar to a recent post', 'Not in my voice']
    case 'follow_up':
      return ['Already handled', 'No action needed', 'Wrong person']
    case 'suggestion':
      return ['Already done', 'Not now', 'Not useful']
    default:
      return ['Already done', 'Not needed', 'Wrong']
  }
}

/** Snooze choices (27.7): tomorrow, Thursday, next Monday. */
export function snoozeChoices(today: string): { label: string; until: string }[] {
  const d = new Date(`${today}T12:00:00Z`)
  const dow = d.getUTCDay()
  const toThu = ((4 - dow + 7) % 7) || 7
  const toMon = ((1 - dow + 7) % 7) || 7
  return [
    { label: 'Tomorrow', until: addDays(today, 1) },
    { label: 'Thursday', until: addDays(today, toThu) },
    { label: 'Next Monday', until: addDays(today, toMon) },
  ]
}

/** Where the queue is refreshed from, for the quiet line at the foot. */
export const refreshLine = 'Write-ups after each call. Mail sweep Monday and Thursday 7:30. Calendar each weekday 8:45. Rules nightly.'

/**
 * A start on the email when the agent left none: built from the task's own
 * words so Jason polishes rather than starts from nothing. Null when there is
 * nobody to write to.
 */
export function starterDraft(task: Task, myFirstName = 'Jason'): { subject: string; body: string } | null {
  if (!task.personName) return null
  const first = task.personName.split(' ')[0]
  const reason = (task.why ?? task.title).replace(/\.$/, '')
  const lower = reason.charAt(0).toLowerCase() + reason.slice(1)
  switch (task.kind) {
    case 'follow_up':
      return {
        subject: task.waitingOn ? `Following up: ${reason}` : reason,
        body: task.waitingOn
          ? `Hi ${first},\n\nJust bringing this back to the top of your inbox. ${reason}. Any news your end?\n\nThanks,\n${myFirstName}`
          : `Hi ${first},\n\nGood to speak. As promised, ${lower}.\n\n[Add the detail here]\n\nSpeak soon,\n${myFirstName}`,
      }
    case 'cv_chase':
      return {
        subject: 'Your CV',
        body: `Hi ${first},\n\nWhen you get a minute, could you send over your latest CV? It means I can get you in front of the right people quickly.\n\nThanks,\n${myFirstName}`,
      }
    case 'feedback_chase':
      return {
        subject: `Feedback on ${task.title.replace(/^Chase feedback on /, '')}`,
        body: `Hi ${first},\n\nA quick one to ask where you landed on the profile I sent over. ${reason}. Even a line either way helps me keep them warm.\n\nThanks,\n${myFirstName}`,
      }
    case 'search_health':
      return {
        subject: `${task.title.split(': ')[1] ?? task.title}: update`,
        body: `Hi ${first},\n\nA short update on the ${task.title.split(': ')[1] ?? 'search'}. [Where things stand, in two lines.] Would a quick call this week suit?\n\nBest,\n${myFirstName}`,
      }
    case 'prepare_call':
      return null
    default:
      return {
        subject: reason,
        body: `Hi ${first},\n\n${reason}.\n\n[Add the detail here]\n\nBest,\n${myFirstName}`,
      }
  }
}
