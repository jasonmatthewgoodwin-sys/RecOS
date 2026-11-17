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
  /** Where the task came from: the post, the email, the call notes, the CRM record. */
  sourceUrl: string | null
  edits: TaskEdits
  /** The lead behind a job task (0054): dates, the poster, where the LinkedIn outreach stands. */
  lead?: TaskLead | null
}

export type LeadOutreach = 'found' | 'connection_sent' | 'connected' | 'messaged' | 'replied'

export type TaskLead = {
  id: string
  postedOn: string | null
  foundOn: string | null
  posterName: string | null
  posterTitle: string | null
  profileUrl: string | null
  stage: LeadOutreach
  connectionOn: string | null
  connectedOn: string | null
  messagedOn: string | null
  repliedOn: string | null
  replyOutcome: string | null
  /** The connection request in the send engine: draft, held, queued, sending, sent, cancelled. */
  connectState: string | null
  connectHold: string | null
  connectAfter: string | null
  campaign: { name: string; addedOn: string | null; enrolledOn: string | null } | null
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

/**
 * Where a task's message goes (Jason, 17 November 2026): LinkedIn when the
 * task came from LinkedIn or its message is a LinkedIn one, email otherwise.
 * The buttons follow it: Open in LinkedIn or Open in Outlook, never both.
 */
export function channelOf(task: Task): 'linkedin' | 'email' {
  if (task.channel) return task.channel
  if (task.lead && /linkedin\.com/i.test(task.sourceUrl ?? '')) return 'linkedin'
  if (task.kind === 'signal' || task.kind === 'content_post' || task.kind === 'content_approve') return 'linkedin'
  return 'email'
}

/** The LinkedIn page a task opens: the person's profile, else the post. */
export function linkedinUrl(task: Task): string {
  const profile = task.lead?.profileUrl ?? task.links.find((l) => /profile/i.test(l.label))?.url
  if (profile) return profile
  if (task.kind === 'content_post' || task.kind === 'content_approve') return 'https://www.linkedin.com/feed/?shareActive=true'
  return task.sourceUrl && /linkedin\.com/i.test(task.sourceUrl) ? task.sourceUrl : 'https://www.linkedin.com/messaging/'
}

/** The next move on a LinkedIn lead, from where the outreach stands. */
export type LeadMove = 'connect' | 'waiting' | 'message' | 'chase'

export function leadMove(lead: TaskLead): LeadMove {
  if (lead.stage === 'connected') return 'message'
  if (lead.stage === 'messaged' || lead.stage === 'replied') return 'chase'
  if (lead.stage === 'connection_sent') return 'waiting'
  return lead.connectState && lead.connectState !== 'cancelled' ? 'waiting' : 'connect'
}

const shortDate = (d: string | null) =>
  d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d.slice(0, 10)}T12:00:00Z`)) : null

/** LinkedIn job lead. Posted 9 Nov. Found 14 Nov. */
export function leadLine(task: Task): string {
  const l = task.lead
  const where = /linkedin\.com/i.test(task.sourceUrl ?? '') ? 'LinkedIn job lead' : 'Job lead'
  if (!l) return where
  return [where, l.postedOn ? `Posted ${shortDate(l.postedOn)}` : null, l.foundOn ? `Found ${shortDate(l.foundOn)}` : null].filter(Boolean).join('. ')
}

/** Where the outreach stands, in words: Not connected, Request sent 16 Nov, Connected, In a campaign. */
export function leadStatus(l: TaskLead): string {
  const who = l.posterName?.split(' ')[0] ?? 'They'
  let line: string
  switch (l.stage) {
    case 'replied':
      line = `${who} replied ${shortDate(l.repliedOn) ?? ''}`.trim() + (l.replyOutcome ? `, ${l.replyOutcome.replace(/_/g, ' ')}` : '')
      break
    case 'messaged':
      line = `Messaged ${shortDate(l.messagedOn) ?? ''}. Waiting for a reply`
      break
    case 'connected':
      line = `Connected ${shortDate(l.connectedOn) ?? ''}. Message not sent yet`
      break
    case 'connection_sent':
      line = `Request sent ${shortDate(l.connectionOn) ?? ''}. Waiting for ${who} to accept`
      break
    default:
      if (l.connectState === 'draft' && l.connectHold === 'Template needs approval') line = 'Request ready. It goes once you approve the connection note in Settings, Templates'
      else if (l.connectState === 'queued' || l.connectState === 'sending') line = `Request queued${l.connectAfter ? `, goes ${shortDate(l.connectAfter)}` : ''} from your laptop`
      else if (l.connectState === 'held') line = `Request held: ${(l.connectHold ?? 'by the send engine').toLowerCase()}`
      else if (l.connectState === 'draft') line = `Request waiting: ${(l.connectHold ?? 'not approved yet').toLowerCase()}`
      else line = 'Not connected'
  }
  const campaign = l.campaign ? `. In a campaign since ${shortDate(l.campaign.addedOn)}${l.campaign.enrolledOn ? ', enrolled in Spott' : ''}` : ''
  return line.replace(/\s+\./g, '.') + campaign
}

/** The primary button for each kind (27.2, extended for the derived kinds). */
export function primaryLabel(task: Task): string {
  switch (task.kind) {
    case 'job_lead':
      if (task.lead) {
        const move = leadMove(task.lead)
        if (move === 'connect') return 'Connect on LinkedIn'
        if (move === 'message') return 'Copy and open LinkedIn'
        if (move === 'waiting') return 'Open profile'
      }
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

/** The day the task surfaced: the day a lead was found, else the day the task was raised. */
export function surfacedOn(task: Task): string {
  return task.lead?.foundOn ?? task.createdAt.slice(0, 10)
}

/**
 * The due date: the owner's, else the agent's, else three days after it
 * surfaced (Jason, 17 November 2026: anything older than three days is
 * overdue).
 */
export function effectiveDue(task: Task): string | null {
  return task.edits.dueOn ?? task.dueOn ?? addDays(surfacedOn(task), 3)
}

/** Where the task came from, in two or three words for the tile. */
export function sourceShort(task: Task): string {
  const url = task.sourceUrl ?? ''
  if (/linkedin\.com\/jobs/i.test(url)) return 'LinkedIn advert'
  if (/linkedin\.com/i.test(url)) return 'LinkedIn post'
  if (/granola/i.test(url)) return 'Call'
  if (/outlook|office|live\.com|microsoft/i.test(url)) return 'Email'
  switch (task.kind) {
    case 'job_lead':
      return url ? 'Job advert' : 'Jobs agent'
    case 'wider_lead':
      return 'Jobs agent'
    case 'signal':
      return 'LinkedIn signal'
    case 'call_writeup':
    case 'call_confirm':
    case 'cv_chase':
    case 'referral':
      return 'Call'
    case 'follow_up':
      return task.agent === 'a6_calls' ? 'Call' : task.agent === 'a5_followups' ? 'Email' : task.agent === 'manual' ? 'You' : 'Rule'
    case 'prepare_call':
      return 'Calendar'
    case 'feedback_chase':
    case 'search_health':
      return 'Spott'
    case 'content_draft':
    case 'content_approve':
    case 'content_post':
      return 'Content agent'
    case 'event_idea':
      return 'Events agent'
    case 'suggestion':
      return 'Rule'
    case 'system_notice':
      return 'RecOS'
    default:
      return task.agent === 'manual' ? 'You' : 'Agent'
  }
}

/** 14 Nov, for the tile's surfaced line. */
export function shortDay(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
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
  if (task.kind === 'job_lead') return leadEmail(task, myFirstName)
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

/** Where the task came from, in words: the call, the email, the post, the rule. */
export function sourceWords(task: Task): string {
  const url = task.sourceUrl ?? ''
  const linkedin = /linkedin\.com/i.test(url)
  const granola = /granola/i.test(url)
  const outlook = /outlook|office|live\.com|microsoft/i.test(url)
  const who = task.personName ? ` with ${task.personName}` : ''
  switch (task.kind) {
    case 'job_lead':
      return linkedin ? 'A LinkedIn post, found by the jobs agent' : url ? 'A job advert, found by the jobs agent' : 'A lead from the jobs agent'
    case 'wider_lead':
      return 'A lead outside product marketing, found by the jobs agent'
    case 'signal':
      return 'A signal on LinkedIn, found by the signals agent'
    case 'content_draft':
    case 'content_approve':
    case 'content_post':
      return 'The content agent, from your calls and the market'
    case 'event_idea':
      return 'The events agent'
    case 'call_writeup':
    case 'call_confirm':
    case 'cv_chase':
      return `A call${who}, written up by the call agent`
    case 'referral':
      return 'A name given on a call, written up by the call agent'
    case 'follow_up':
      if (task.agent === 'a6_calls' || granola) return `A call${who}, written up by the call agent`
      if (task.agent === 'a5_followups' || outlook) return `An email thread${who}, found by the follow-up sweep`
      if (task.agent === 'manual') return 'Added by you'
      return 'A rule in RecOS'
    case 'prepare_call':
      return 'Your calendar for today'
    case 'search_health':
      return 'The search, as the call agent read it this morning'
    case 'feedback_chase':
      return 'The pipeline, from Spott'
    case 'suggestion':
      return 'A standing rule in RecOS'
    case 'system_notice':
      return 'RecOS itself'
    default:
      return 'RecOS'
  }
}

// ---- The chat on a task (0052)

export type TaskChatLine = {
  id: string
  author: 'owner' | 'agent'
  kind: 'note' | 'check' | 'change' | 'do' | 'answer'
  body: string
  at: string
}

export type TaskJobKind = 'check' | 'change' | 'do'

export type TaskJob = {
  id: string
  kind: TaskJobKind
  instruction: string | null
  status: 'waiting' | 'working' | 'ready' | 'failed'
  note: string | null
  requestedAt: string
  finishedAt: string | null
}

export type TaskChat = { lines: TaskChatLine[]; job: TaskJob | null }

export const chatKey = (taskKey: string) => `tasks.chat.${taskKey}`

/** The three asks, in the owner's words. */
export const askWord: Record<TaskJobKind, string> = {
  check: 'Still relevant?',
  change: 'Change it',
  do: 'Do this for me',
}

/** What the chat says while the assistant has the task. */
export function jobWord(job: TaskJob | null): string | null {
  if (!job) return null
  if (job.status === 'waiting') return 'Waiting for the task assistant. It looks every quarter of an hour on weekdays.'
  if (job.status === 'working') return 'The task assistant has it.'
  if (job.status === 'failed') return job.note ?? 'It could not be done this time.'
  return null
}

/**
 * The email to copy on a job lead (Jason, 17 November 2026): about their
 * hiring, never about the agent's report. Wording still to be agreed; it is a
 * start to polish, kept for when the campaign tools are not to hand.
 */
export function leadEmail(task: Task, myFirstName = 'Jason'): { subject: string; body: string } {
  const first = task.lead?.posterName?.split(' ')[0] ?? task.personName?.split(' ')[0] ?? null
  const role = task.title.replace(/\s+at\s+.+$/, '')
  const company = task.company ?? 'your team'
  return {
    subject: 'Hiring product marketers?',
    body: `Hi${first ? ` ${first}` : ''},\n\nI saw ${company} is hiring for a ${role}. I only recruit product marketers, mostly for US tech teams, so I speak to people who fit that kind of brief most weeks.\n\nIf it would help, I can send over two or three profiles worth a look, or share what we are seeing on pay and time to hire right now.\n\nBest,\n${myFirstName}`,
  }
}
