// The small data layer (CLAUDE.md: "Fetch data with the Supabase client and a
// small data layer in app/src/lib"). Screens ask this file for what they need
// and never build queries themselves.

import { sampleSource } from './sample'
import { supabase } from './supabase'
import { splitCopy, topicFrom, topicKey } from './calendar'
import type { CaptureKind, SearchHit } from './capture'
import { mondayOf, shiftDate, ukClock, weekdayOf } from './time'
import { band, type Task, type TaskChat, type TaskChatLine, type TaskEdits, type TaskJob, type TaskJobKind, type TaskKind, type TaskLink, type TaskSource } from './tasks'
import type { Tone } from '../theme/tokens'

export type CalendarCall = {
  id: string
  /** ISO timestamp */
  startsAt: string
  title: string
  callType: string
  personName: string | null
  /** The person's CRM page, for the prep card's one link (26.4). */
  crmUrl?: string | null
  /** For the day view (14 November 2026): when it ends, and whether it is a call with someone outside or an internal meeting. */
  endsAt?: string | null
  isExternal?: boolean
}

export type FollowUpsDue = {
  /** Owed and due today or earlier. The number on Home. */
  due: number
  /** Of those, due before today. */
  late: number
  /** The weekday the oldest late one fell due, for the next-step line. */
  lateFromDay: string | null
}

export type WeekTargets = { hit: number; total: number }

export type JobStage = 'new' | 'chased' | 'replied' | 'meeting_booked' | 'job_won' | 'dead' | 'passed'
/** The outreach ladder on a lead (14 November 2026): the agent connects, then messages; the owner marks replies. */
export type OutreachStage = 'found' | 'connection_sent' | 'connected' | 'messaged' | 'replied'
export type ReplyOutcome = 'interested' | 'not_interested' | 'no_answer'

/** A thin reference to a role at a company (section 9.1). Names only, never contact details. */
export type JobLead = {
  id: string
  company: string
  role: string
  city: string | null
  country: 'US' | 'UK' | 'other'
  level: string | null
  /** Where it was seen, with a link for each where one is known (same index). */
  sources: string[]
  sourceUrls: string[]
  posterName: string | null
  posterTitle: string | null
  posterProfileUrl: string | null
  fitScore: number | null
  fitReason: string | null
  existingClient: boolean
  stage: JobStage
  deadReason: string | null
  /** Up to 3 suggested people: a name and a one-line reason. */
  matched: { personId: string | null; name: string; reason: string }[]
  /** The spec or chase message written by the agent, when there is one. */
  draft: string | null
  /** Plain dates, 2026-11-14. */
  firstSeenOn: string
  /** The day the post was published (from the LinkedIn post id, 0047); null when unknown. */
  postedOn?: string | null
  chasedOn: string | null
  repliedOn: string | null
  meetingOn: string | null
  wonOn: string | null
  outreachStage: OutreachStage
  outreachConnectionOn: string | null
  outreachConnectedOn: string | null
  outreachMessagedOn: string | null
  outreachRepliedOn: string | null
  replyOutcome: ReplyOutcome | null
  /** The two staged messages: the connection note and the first message once connected. */
  connectionNote: string | null
  firstMessage: string | null
  /** The owner's own words on where he is with the poster (0037). Null means the app writes the summary. */
  outreachNote: string | null
  /** A UK-headquartered company hiring, or likely to hire, in the US. */
  ukToUs: boolean
}
export type OutreachPatch = Partial<Pick<JobLead, 'outreachStage' | 'replyOutcome' | 'connectionNote' | 'firstMessage' | 'outreachNote'>>

/** Hero 1 on the Jobs page: posts chased this week against the weekly target. */
export type ChasedThisWeek = { total: number; target: number | null }

export type InboxType =
  | 'job_lead'
  | 'signal'
  | 'content_draft'
  | 'event_idea'
  | 'call_writeup'
  | 'follow_up'
  | 'referral'
  | 'client_nudge'
  | 'wider_lead'
  | 'auto_sent'
  | 'system_notice'

export type InboxStatus = 'new' | 'approved' | 'done' | 'snoozed' | 'binned' | 'stale'

/** One thing an agent found or a rule raised (section 8.1). The prompt to act, not the record. */
export type InboxItem = {
  id: string
  type: InboxType
  agent: string
  title: string
  personId: string | null
  company: string | null
  role: string | null
  location: string | null
  why: string | null
  suggestedAction: string | null
  draft: string | null
  draftOriginal: string | null
  source: string | null
  sourceUrl: string | null
  links: { label: string; url: string }[]
  refTable: string | null
  refId: string | null
  rank: number
  status: InboxStatus
  binReason: string | null
  snoozedUntil: string | null
  dueOn: string | null
  /** ISO timestamp */
  createdAt: string
}

/** What the primary button did, so Undo can put it back (INBX-2). */
export type InboxAction = 'done' | 'approve' | 'bin' | 'snooze' | 'pass'

export type FollowUpStatus = 'open' | 'sent' | 'done' | 'handled_offline' | 'snoozed' | 'closed'

/** One exec coaching session (section 9.2). The person is a thin reference. */
export type CoachingSession = {
  id: string
  personId: string
  personName: string
  personTitle: string | null
  personCompany: string | null
  /** ISO timestamps */
  bookedFor: string | null
  heldAt: string | null
  source: string | null
  status: 'booked' | 'held' | 'no_show' | 'cancelled'
  /** The four standing questions. Null means not asked (COA-3). */
  answers: { interviewedWhere: string | null; whoElseLooking: string | null; howTheyHire: string | null; eventsRated: string | null }
  adviceGiven: string | null
  referralsCount: number
  leadsCount: number
  followedUp: boolean
}

export type ReferralStage = 'new' | 'contacted' | 'spoken' | 'added_to_league' | 'not_relevant'

/** Someone named on a call (section 9.3). A name and a company, never contact details. */
export type Referral = {
  id: string
  referredName: string
  referredCompany: string | null
  referredTitle: string | null
  referredById: string | null
  referredByName: string
  context: string | null
  kind: 'person' | 'company' | 'job'
  stage: ReferralStage
  thanked: boolean
  /** Plain dates */
  receivedOn: string
  contactedOn: string | null
  /** The three questions for the call (14 November 2026): who hires, through whom, and is the job open. */
  hiringManagerName: string | null
  hiringManagerUrl: string | null
  sourcedVia: 'recruiter' | 'direct' | 'unknown' | null
  jobOpen: 'yes' | 'no' | 'unknown' | null
  jobLeadId: string | null
}
export type ReferralPatch = Partial<Pick<Referral, 'hiringManagerName' | 'hiringManagerUrl' | 'sourcedVia' | 'jobOpen'>>

export type WiderLeadStatus = 'spotted' | 'passed' | 'meeting_booked' | 'job_won' | 'placed' | 'not_pursued'

export type Tier = 'premier' | 'championship' | 'league_one'

/** A named list under People (docs/decisions.md, 14 November 2026). */
export type PeopleList = { id: string; key: string; name: string; kind: 'leader' | 'a_star' | 'other'; seats: number; colour: Tone | 'mist'; archived: boolean; position: number }

/** One person on a list, with their cadence state from league_due_view (14.6). Names only. */
export type Member = {
  id: string
  personId: string
  name: string
  title: string | null
  company: string | null
  city: string | null
  crmUrl: string | null
  profileUrl: string | null
  listId: string
  tier: Tier
  why: string | null
  /** A group of the owner's naming within the list, drawn as a separator (14 November 2026). */
  groupName: string | null
  /** Plain dates */
  lastTouchOn: string | null
  nextDueOn: string
  daysLate: number
  state: 'late' | 'due' | 'fine'
  missedCycles: number
  liveSignal: string | null
  notesForNextContact: string | null
  /** A short description pulled in from their LinkedIn profile by the signals agent, or written by hand (14 November 2026). */
  profileSummary: string | null
  profilePulledAt: string | null
  jobsBriefed: number
  referralsGiven: number
  introsMade: number
}

export type Touch = { id: string; touchedOn: string; channel: string; kind: string; note: string | null; sourceUrl: string | null }

export type SignalStatus = 'new' | 'actioned' | 'added_to_league' | 'ignored' | 'expired'

/** One weekly KPI this week, from kpi_this_week (14.2, 22.5). */
export type KpiWeek = {
  kpi: string
  target: number
  /** All work. */
  total: number
  hit: boolean
  /** PMM only: what the targets are set against. Shown by default. */
  pmmTotal: number
  pmmHit: boolean
  /** A correction typed by the owner is part of the week (22.4). */
  hasManual: boolean
}

/** The parts of the sentence instead of a trend chart (14.3). */
export type KpiStreak = {
  kpi: string
  weeksHistory: number
  /** Plain date of the first tracked week. */
  firstWeek: string | null
  hitLast4: number
  pmmHitLast4: number
  best12: number
  pmmBest12: number
}

/** One quarterly target or output this quarter (32.2). An output has no target. */
export type KpiQuarter = {
  kpi: string
  position: number
  target: number | null
  total: number
  pmmTotal: number
  hit: boolean | null
  pmmHit: boolean | null
  hasManual: boolean
}

/** One KPI in one of the last 12 weeks (14.2). */
export type KpiWeekRow = KpiWeek & { week: string }

/** An output KPI that moved in a week (32.3). */
export type KpiOutputWeek = { kpi: string; week: string; total: number; pmmTotal: number }

export type FollowUpsDone = { week: string | null; completed: number; onTime: number }

/** The BD funnel as plain numbers, last 8 weeks (14.4). */
export type BdFunnel = { found: number; chased: number; replied: number; meetings: number; won: number }

/** The owner's notes for one week (13.3). */
export type WeeklyReview = {
  week: string
  learned: string
  changes: string
  plan: string
  quarterlyFocus: string
  followupBlockMinutes: number | null
  heldOn: string | null
}
export type ReviewFields = Pick<WeeklyReview, 'learned' | 'changes' | 'plan' | 'quarterlyFocus'>

/** A background agent (13.4). The key itself is never readable; only when it was made. */
export type Agent = {
  code: string
  name: string
  schedule: string
  enabled: boolean
  modelTier: 'light' | 'standard'
  monthlyBudget: number | null
  keyCreatedAt: string | null
  consecutiveFailures: number
  lastRun: { startedAt: string; status: AgentRunStatus; itemsCreated: number } | null
  /** Sum of cost estimates for runs this month. */
  spentThisMonth: number
  /** What it connects to and the plain criteria it works to (14 November 2026). */
  connections: string[]
  criteria: Record<string, unknown>
}

export type AgentRunStatus = 'running' | 'ok' | 'partial' | 'failed' | 'timed_out'

export type AgentRun = {
  id: string
  startedAt: string
  finishedAt: string | null
  status: AgentRunStatus
  itemsCreated: number
  itemsMerged: number
  summary: string | null
}

export type AgentPrompt = { version: number; body: string; active: boolean; note: string | null; createdAt: string }

export type SendLevel = 'automatic' | 'one_click' | 'draft_only'

/** One message type's rules (13.5, 20.2). */
export type SendPolicy = {
  type: string
  label: string
  channel: 'email' | 'linkedin' | 'either'
  level: SendLevel
  maxLevel: SendLevel
  dailyCap: number | null
  weeklyCap: number | null
  perRunCap: number | null
  minDaysBetweenSamePerson: number
  windowStart: string
  windowEnd: string
  requiresTemplate: boolean
  paused: boolean
  pausedReason: string | null
}

export type SendPolicyPatch = Partial<Pick<SendPolicy, 'level' | 'dailyCap' | 'weeklyCap' | 'perRunCap' | 'windowStart' | 'windowEnd' | 'paused'>>

/** A message template (12.5). Editing an approved one makes a new, unapproved version (TPL-1). */
export type Template = {
  id: string
  type: string
  name: string
  channel: 'email' | 'linkedin'
  subject: string | null
  body: string
  variables: string[]
  version: number
  approved: boolean
  approvedAt: string | null
  /** The version in use. An edited, approved version stands aside until the new one is approved. */
  active: boolean
  updatedAt: string
}
export type NewTemplate = { type: string; name: string; channel: 'email' | 'linkedin'; subject: string | null; body: string }

/** One row of the send log (8.4): the fact of a decision, not the words. */
export type SendLogRow = {
  id: string
  messageId: string
  type: string
  channel: 'email' | 'linkedin'
  toName: string
  level: SendLevel
  outcome: 'queued' | 'sent' | 'failed' | 'held' | 'skipped' | 'cancelled'
  detail: string | null
  loggedAt: string
}

/** The owner's four actions on a message (15.6). */
export type SendAction = 'approve' | 'open_draft' | 'mark_sent' | 'cancel'
export type SendActionResult = { state: string; note?: string; send_after?: string; outlook_draft_url?: string }

/** One target row (13.2). A change adds a row from the next Monday. */
export type Target = { id: string; kpi: string; period: 'week' | 'quarter' | 'year'; target: number; validFrom: string; validTo: string | null }

/** The one-row settings table (13.6), typed. */
export type AppSettings = {
  allSendingPaused: boolean
  icp: { sector: string; companySize: string; buyer: string; locations: string[]; secondAngle: string; excluded: string[] }
  coachingTitlePhrases: string[]
  leagueDays: { premier: number; championship: number; leagueOne: number }
  health: { clientCooling: number; clientCold: number; candidateCooling: number; candidateCold: number }
  feedback: { nudge: number; cooling: number; cold: number }
  staleAfterDays: number
  deckDefault: boolean
  homeStats: string[]
  theme: 'paper' | 'night'
  fontSans: string
  fontMono: string
  workingHours: Record<string, [string, string]>
  reviewerEmail: string | null
}

export type SharedBlock = { code: string; title: string; body: string; updatedAt: string }

export type DoNotContact = { id: string; name: string | null; company: string | null; scope: 'person' | 'company'; reason: string | null; createdAt: string }

export type AuditEntry = { id: number; at: string; actor: string; action: string; targetTable: string | null; detail: Record<string, unknown> | null }

/** A person found by name or email, with where they appear (15.7). No row contents. */
export type FoundPerson = { id: string; displayName: string; displayTitle: string | null; displayCompany: string | null; counts: Record<string, number> }

/** The weekly health line (33.7): runs, failures, items, sent for you. Owner only. */
export type SystemWeek = { week: string; runs: number; failed: number; items: number; sent: number; failedDetail: string | null }

/** One row behind a number this week (13.1). Labels name a role and company, never a person. */
export type KpiEvent = {
  id: string
  label: string | null
  amount: number
  manual: boolean
  reason: string | null
  isPmm: boolean
  happenedAt: string
}


/** Something that changed for a person or their company (section 10.4). */
export type Signal = {
  id: string
  personId: string | null
  personName: string | null
  company: string | null
  title: string | null
  city: string | null
  signalType: string
  strength: number
  detail: string | null
  source: string
  sourceUrl: string | null
  /** Plain date */
  seenOn: string
  status: SignalStatus
  /** True when the person is already on a list (SIG-2, T-PEO-6). */
  onList: boolean
  ukToUs: boolean
}

/** A lead for the rest of the business (section 9.4). */
export type WiderLead = {
  id: string
  company: string
  role: string | null
  function: string
  country: 'US' | 'UK' | 'other'
  location: string | null
  source: string
  mentionedByName: string | null
  existingClient: boolean
  passedTo: string | null
  passedOn: string | null
  splitNote: string | null
  status: WiderLeadStatus
  notes: string | null
  createdAt: string
  accountId?: string | null
}
export type NewWiderLead = { company: string; role: string | null; function: string; country: 'US' | 'UK' | 'other'; source: string; accountId: string | null; existingClient: boolean; notes: string | null; mentionedByName: string | null }

/** An account (29.3, 14 November 2026): a group client or one of the owner's own, as a thin reference. */
export type AccountKind = 'group_client' | 'my_account'
export type Account = {
  id: string
  company: string
  kind: AccountKind
  colleague: string | null
  contactName: string | null
  contactTitle: string | null
  functions: string[]
  crmUrl: string | null
  notes: string | null
  active: boolean
  introducedTo: string | null
}
export type NewAccount = Pick<Account, 'company' | 'kind' | 'colleague' | 'contactName' | 'contactTitle' | 'functions' | 'crmUrl'>

/** Searches (11.1, 30): the working layer of a search. The record of each candidate stays in the CRM. */
export type SearchPriority = 'focus' | 'active' | 'maintenance' | 'dormant'
export type SearchStatus = 'intake' | 'open' | 'offer' | 'placed' | 'lost' | 'on_hold' | 'closed'
export type SearchHealth = 'warm' | 'cooling' | 'cold'
export type Search = {
  id: string
  client: string
  role: string
  function: string
  level: string | null
  location: string | null
  city: string | null
  country: string
  confidential: boolean
  crmUrl: string | null
  crmJobRef: string | null
  priority: SearchPriority
  status: SearchStatus
  /** Plain dates */
  openedOn: string
  firstSubmissionOn: string | null
  placedOn: string | null
  lastClientContactOn: string | null
  waitingOn: 'client' | 'candidate' | 'desk' | 'nobody' | null
  nextStep: string | null
  nextStepOn: string | null
  health: SearchHealth
  healthReason: string | null
  nSourced: number
  nSpoken: number
  nSubmitted: number
  nFirstStage: number
  nLaterStage: number
  nOffer: number
  feeEstimate: number | null
  wonFromJobLead: string | null
  createdAt: string
}
export type NewSearch = { client: string; role: string; function: string; crmUrl: string | null; priority: SearchPriority; confidential?: boolean; wonFromJobLead?: string | null }
export type SearchPatch = Partial<Pick<Search, 'priority' | 'status' | 'waitingOn' | 'nextStep' | 'nextStepOn' | 'health' | 'healthReason' | 'nSourced' | 'nSpoken' | 'nSubmitted' | 'nFirstStage' | 'nLaterStage' | 'nOffer' | 'confidential' | 'crmUrl' | 'level' | 'location' | 'feeEstimate' | 'lastClientContactOn'>>

export type CandidateStage = 'sourced' | 'spoken' | 'submitted' | 'first_stage' | 'later_stage' | 'offer' | 'placed' | 'rejected' | 'withdrew'
export type OfferStatus = 'expected' | 'verbal' | 'written' | 'accepted' | 'declined'
/** A candidate in play on a search (11.3): names and clocks only (CAN-5). */
export type SearchCandidate = {
  id: string
  searchId: string
  personId: string
  name: string
  title: string | null
  company: string | null
  crmUrl: string | null
  profileUrl: string | null
  stage: CandidateStage
  stageChangedOn: string
  submittedOn: string | null
  feedbackReceivedOn: string | null
  feedbackNudges: number
  consentToSubmit: boolean
  nextInterviewAt: string | null
  prepSent: boolean
  lastCandidateContactOn: string | null
  outcomeReason: string | null
  offerStatus: OfferStatus | null
  decisionDueOn: string | null
  startOn: string | null
  referencesTaken: number
  referencesNeeded: number
  competingProcess: boolean
  risks: string | null
  wouldSwing: string | null
  aftercareOn: string | null
}
export type CandidatePatch = Partial<Pick<SearchCandidate, 'stage' | 'consentToSubmit' | 'feedbackReceivedOn' | 'feedbackNudges' | 'nextInterviewAt' | 'prepSent' | 'lastCandidateContactOn' | 'outcomeReason' | 'offerStatus' | 'decisionDueOn' | 'startOn' | 'referencesTaken' | 'referencesNeeded' | 'competingProcess' | 'risks' | 'wouldSwing'>>

export type SearchNoteTab = 'brief' | 'map' | 'calibration' | 'client_updates' | 'interviews' | 'offer' | 'close_out' | 'questions' | 'lowdown'
export type SearchNote = { id: string; searchId: string; tab: SearchNoteTab; title: string | null; content: string; structured: Record<string, unknown> | null; version: number; updatedAt: string }

// ======================================================================
// The new search flow, Jason's half (docs/new-search-split.md, contract 4;
// migration 0048). Mia's screens call these and do not edit this block.
// Results are read with data.searchNotes and saved with data.saveSearchNote:
// the newest version of tab `questions`, `lowdown` or `map` is the current
// one. With no Supabase project the stand-in in searchResearch.ts answers: a
// requested job turns ready a few seconds later with an invented result.
// ======================================================================
import { createSampleSearchResearch, type SearchIntake, type SearchJob, type SearchJobKind, type SearchResearch, type StartSearchInput } from './searchResearch'
import { isRoleType } from './questionBank'

export { questionBank, questionSet, questionsAsText, isRoleType, ROLE_TYPES } from './questionBank'
export type { RoleType, QuestionSource, BriefQuestion, QuestionGroup, QuestionSet } from './questionBank'
export { latestJobs } from './searchResearch'
export type { SearchJob, SearchJobKind, SearchJobStatus, StartSearchInput, SearchIntake } from './searchResearch'

const liveResearch: SearchResearch = {
  async startSearch(input) {
    const { data: id, error } = await supabase!.rpc('start_search', {
      p_client: input.client,
      p_role: input.role,
      p_role_type: input.roleType ?? null,
      p_jd_text: input.jdText ?? null,
      p_brief_due_on: input.briefDueOn ?? null,
    })
    fail(error)
    return id as string
  },
  async requestSearchJob(searchId, kind) {
    const { error } = await supabase!.rpc('request_search_job', { p_search: searchId, p_kind: kind })
    fail(error)
  },
  async searchJobs(searchId) {
    const { data: found, error } = await supabase!.from('search_jobs').select('kind, status, note, requested_at, finished_at').eq('search_id', searchId).order('requested_at', { ascending: false })
    fail(error)
    type Row = { kind: SearchJob['kind']; status: SearchJob['status']; note: string | null; requested_at: string; finished_at: string | null }
    return ((found ?? []) as Row[]).map((j) => ({ kind: j.kind, status: j.status, note: j.note, requestedAt: j.requested_at, finishedAt: j.finished_at }))
  },
  async searchIntake(searchId) {
    const { data: row, error } = await supabase!.from('searches').select('role_type, jd_text, brief_due_on').eq('id', searchId).maybeSingle()
    fail(error)
    const r = row as { role_type: string | null; jd_text: string | null; brief_due_on: string | null } | null
    return { roleType: isRoleType(r?.role_type) ? r.role_type : null, jdText: r?.jd_text ?? null, briefDueOn: r?.brief_due_on ?? null }
  },
}

const research: SearchResearch = supabase
  ? liveResearch
  : createSampleSearchResearch({
      addSearch: async ({ client, role }) => (await data.addSearch({ client, role, function: 'pmm', crmUrl: null, priority: 'active' })).id,
      saveNote: (searchId, tab, content, structured) => data.saveSearchNote(searchId, tab, content, structured),
    })

/** Start a search from the intake step, at status `intake`. Gives back the new search's id. */
export function startSearch(input: StartSearchInput): Promise<string> {
  return research.startSearch(input)
}
/** Ask for tailored questions, the client lowdown or the market map. A second ask while one is open does nothing. */
export function requestSearchJob(searchId: string, kind: SearchJobKind): Promise<void> {
  return research.requestSearchJob(searchId, kind)
}
/** Every job asked for on a search, newest first. `latestJobs` picks one per kind. */
export function searchJobs(searchId: string): Promise<SearchJob[]> {
  return research.searchJobs(searchId)
}
/** The role type, job description and brief date the intake step saved (not in the contract; here so a screen can reopen a search). */
export function searchIntake(searchId: string): Promise<SearchIntake> {
  return research.searchIntake(searchId)
}
// ====================================================== end of the block

/** A recorded conversation (11.4): the five write-up ticks and the links. No note text, ever. */
export type Call = {
  id: string
  granolaUrl: string | null
  title: string | null
  heldAt: string
  minutes: number | null
  callType: string
  personId: string | null
  personName: string | null
  crmUrl: string | null
  searchId: string | null
  matchConfidence: 'confirmed' | 'high' | 'low' | 'none'
  wRecord: boolean
  wCv: boolean
  wNote: boolean
  wOnSearch: boolean
  wFollowUp: boolean
  cvRequested: boolean
  isNewAStar: boolean
  skipReason: string | null
  /** The agent's own few lines on the call (0051). Never the note text. */
  summary: string | null
}
export type CallPatch = Partial<Pick<Call, 'searchId' | 'matchConfidence' | 'wRecord' | 'wCv' | 'wNote' | 'wOnSearch' | 'wFollowUp' | 'cvRequested' | 'skipReason'>>

export type AStarSuggestion = { id: string; name: string; title: string | null; company: string | null; city: string | null; linkedinUrl: string | null; why: string | null; week: string; verdict: 'pending' | 'good' | 'not_good' }

/** A warm spec (31.1): someone worth putting in front of companies, with the open leads they match. */
/** Someone Jason has spoken to, from the calls the Granola agent writes (0051). */
export type SpokenPerson = {
  personId: string
  name: string
  title: string | null
  company: string | null
  city: string | null
  crmUrl: string | null
  profileUrl: string | null
  /** Good candidate: the warm spec flag on the person. */
  good: boolean
  /** The agent flagged them as a new A-star on a call. */
  suggested: boolean
  lastCallOn: string
  calls: { id: string; heldAt: string; callType: string; granolaUrl: string | null; summary: string | null; searchId: string | null }[]
}

export type SpecMatch = { kind: 'job_lead' | 'search' | 'account'; id: string; name: string; role: string | null; why: string; fit: number | null }
export type SpecRequest = {
  id: string
  personId: string
  linkedinUrl: string | null
  cvWhere: 'spott' | 'email' | 'pasted' | 'none'
  status: 'waiting' | 'working' | 'ready' | 'failed'
  note: string | null
  result: { skills: string[]; summary: string; matches: SpecMatch[] } | null
  requestedAt: string
  finishedAt: string | null
}
export type SpecAsk = { linkedinUrl?: string | null; cvWhere: SpecRequest['cvWhere']; cvText?: string | null }

export type WarmSpec = { personId: string; name: string; title: string | null; company: string | null; crmUrl: string | null; profileUrl: string | null; matches: { leadId: string; company: string; role: string }[] }

export type CampaignStep = { channel: string; note: string; doneOn?: string | null }
export type Campaign = {
  id: string
  name: string
  tool: string
  jobLeadId: string | null
  candidatePersonId: string | null
  steps: CampaignStep[]
  contacted: number
  replies: number
  callsBooked: number
  status: 'planned' | 'running' | 'done'
  startedOn: string | null
  endedOn: string | null
  createdAt: string
}
export type CampaignPatch = Partial<Pick<Campaign, 'name' | 'tool' | 'contacted' | 'replies' | 'callsBooked' | 'status' | 'steps' | 'startedOn' | 'endedOn' | 'jobLeadId' | 'candidatePersonId'>>

/** One next action owed to a person, or awaited from them (section 8.2). */
/** Content (12.1, 31.2): a post, a draft, an idea or a testimonial. Never a feed. */
export type ContentKind = 'linkedin_post' | 'job_post' | 'blog' | 'testimonial' | 'case_study' | 'idea' | 'event'
export type EventType = 'panel' | 'happy_hour' | 'webinar' | 'breakfast' | 'other'
export type ContentStatus = 'idea' | 'draft' | 'approved' | 'planned' | 'posted' | 'held' | 'binned'
export type ContentSource = 'calls' | 'pmm_community' | 'recruiting_news' | 'event' | 'manual'
export type ContentItem = {
  id: string
  kind: ContentKind
  runSource: ContentSource | null
  angle: 'hiring_manager' | 'talent_market' | 'candidate' | null
  topic: string
  hook: string | null
  body: string | null
  closeLine: string | null
  hashtags: string[]
  dataPoint: string | null
  dataPointUrl: string | null
  promptedBy: string | null
  formatOk: boolean
  formatReason: string | null
  rank: number
  status: ContentStatus
  heldReason: string | null
  /** Plain dates */
  plannedFor: string | null
  postedOn: string | null
  postUrl: string | null
  impressions: number | null
  comments: number | null
  inboundMessages: number | null
  /** For an event (14 November 2026): what kind, and the time of day as HH:mm. */
  eventType: EventType | null
  eventTime: string | null
  /** Testimonials (31.2): the search it came from, when asked, when received, where used. */
  searchId: string | null
  requestedOn: string | null
  receivedOn: string | null
  usedWhere: string | null
  createdAt: string
}
export type ContentPatch = Partial<Pick<ContentItem, 'status' | 'topic' | 'hook' | 'body' | 'closeLine' | 'heldReason' | 'plannedFor' | 'postedOn' | 'postUrl' | 'impressions' | 'comments' | 'inboundMessages' | 'eventType' | 'eventTime' | 'requestedOn' | 'receivedOn' | 'usedWhere'>>
export type NewContent =
  | { kind: 'linkedin_post'; copy: string; plannedFor: string | null; status: ContentStatus }
  | { kind: 'event'; copy: string; topic: string; eventType: EventType; eventTime: string | null; plannedFor: string | null; status: ContentStatus }
  | { kind: 'testimonial'; copy: string; topic: string; plannedFor: string | null; status: ContentStatus }

/** A problem report (the bug handover of 14 November 2026): raised from any page, worked under Settings. */
export type ProblemSeverity = 'low' | 'medium' | 'high'
export type ProblemStatus = 'new' | 'in_progress' | 'resolved' | 'closed' | 'wont_fix'
export type Problem = {
  id: string
  /** Shown as BUG-12. */
  ref: number
  title: string | null
  description: string
  severity: ProblemSeverity
  status: ProblemStatus
  reporterName: string | null
  assignee: string | null
  route: string | null
  userAgent: string | null
  viewport: string | null
  appVersion: string | null
  resolution: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}
export type ProblemNote = { id: string; reportId: string; author: string | null; body: string; createdAt: string }
/** A picture pasted or attached to a report (0036): a shrunk image as a data URL, three at most. */
export type ProblemScreenshot = { id: string; reportId: string; data: string; createdAt: string }
export type ProblemReport = Pick<Problem, 'title' | 'description' | 'severity' | 'reporterName'> & { route: string; userAgent: string; viewport: string; appVersion: string }
export type ProblemPatch = Partial<Pick<Problem, 'status' | 'severity' | 'assignee' | 'resolution' | 'title'>>

export type FollowUp = {
  id: string
  personId: string | null
  personName: string
  company: string | null
  kind: string
  reason: string
  source: string
  direction: 'owed' | 'waiting'
  /** Plain date */
  dueOn: string
  status: FollowUpStatus
  snoozedUntil: string | null
  /** The paired message, where one exists (21.3): its channel, level and draft. */
  message: { id: string; channel: 'email' | 'linkedin'; level: 'automatic' | 'one_click' | 'draft_only'; body: string | null; state: string } | null
  /** ISO timestamp */
  createdAt: string
}

export type InboxActionExtra = {
  /** The draft as the owner left it, saved with the action (INBX-3). */
  draft?: string
  binReason?: string
  snoozedUntil?: string
  /** Pass on: who takes the wider lead and the agreed split (WID-1, WID-2). */
  colleague?: string
  split?: string
  /** Approve: the day a content draft is for. */
  on?: string
}

export type ConnectionProvider = 'outlook' | 'granola' | 'spott'
/** How a connection stands (24.9). not_connected when there is no row. */
export type ConnectionStatus = 'connected' | 'needs_sign_in' | 'failing' | 'not_connected'
export type Connection = {
  provider: ConnectionProvider
  status: ConnectionStatus
  accountLabel: string | null
  connectedAt: string | null
  lastOkAt: string | null
  lastError: string | null
}

export interface DataSource {
  needsYou(): Promise<number>
  followUpsDue(): Promise<FollowUpsDue>
  /** External calls still to come today, soonest first. */
  callsToday(): Promise<CalendarCall[]>
  /** The whole of today from the Outlook feed, internal meetings included, in time order (14 November 2026). */
  dayToday(): Promise<CalendarCall[]>
  /** Today and the next six days from the Outlook feed, internal meetings included, in time order (0045, 15 November 2026). */
  calendarWeek(): Promise<CalendarCall[]>
  weekTargets(): Promise<WeekTargets>

  /** Every job lead the owner holds. The page sorts and filters. */
  jobLeads(): Promise<JobLead[]>
  chasedThisWeek(): Promise<ChasedThisWeek>
  /**
   * Move a lead to a stage. Dead needs a reason (JOB-4). The KPI event for a
   * move to chased is written by the database trigger, never from here (KPI-2).
   */
  setLeadStage(id: string, stage: JobStage, deadReason?: string): Promise<void>
  /** JOBS-2: hand the lead to a colleague. It becomes a wider lead and closes here. */
  passLead(lead: JobLead, colleague: string): Promise<void>

  /** Everything new or stale that needs the owner, highest rank first. */
  inboxItems(): Promise<InboxItem[]>
  /** What the send engine sent on its own in the last 7 days (27.3). */
  sentForYou(): Promise<InboxItem[]>
  /**
   * Act on an item: the record behind it moves where a mapping exists (22.3,
   * INB-6), then the item's status changes. KPI events come from the database
   * triggers on the record, never from here.
   */
  actOnInbox(item: InboxItem, action: InboxAction, extra?: InboxActionExtra): Promise<void>
  /** Put an item back as it was, within the 8 seconds (INBX-2). */
  undoInbox(item: InboxItem, action: InboxAction): Promise<void>
  /** INBX-5: bin every stale item in one go. */
  binStale(ids: string[]): Promise<void>

  /** Every open or snoozed follow-up. The page orders them (21.4). */
  followUps(): Promise<FollowUp[]>
  /**
   * Move a follow-up along its lifecycle (21.2). Completion dates, the
   * on-time flag and the KPI event are set by the database (P1-30).
   */
  setFollowUpStatus(id: string, status: FollowUpStatus, extra?: { snoozedUntil?: string; draft?: string }): Promise<void>
  /** T-FUP-5: at 90 minutes the rest of the Monday block moves to a date. */
  redateFollowUps(ids: string[], dueOn: string): Promise<void>
  /** 21.5: how long the Monday block took, on this week's review row. */
  recordFollowUpBlock(minutes: number): Promise<void>

  /** Sessions this week and last, newest first (28.3). */
  coachingSessions(): Promise<CoachingSession[]>
  /** The coaching follow-up: until the send engine exists, this marks it followed up. */
  markCoachingFollowedUp(id: string): Promise<void>
  /** Referrals that are not closed, oldest first (28.4). */
  referrals(): Promise<Referral[]>
  /** REF-2: contacted raises the thank-you follow-up in the database. */
  setReferralStage(id: string, stage: ReferralStage): Promise<void>
  /** Spotted leads and passed leads awaiting an outcome (28.8). */
  widerLeads(): Promise<WiderLead[]>
  /** A wider lead raised by hand, such as introducing a colleague to an account. */
  addWiderLead(input: NewWiderLead): Promise<void>
  /** The outreach ladder on a job lead, by hand: the agent moves it through agent-write. */
  setOutreach(id: string, patch: OutreachPatch): Promise<void>
  /** The three call questions on a referral. */
  updateReferral(id: string, patch: ReferralPatch): Promise<void>
  /** Turn a company lead from a call into a job lead; returns the lead's id. */
  referralToJobLead(id: string): Promise<string>
  accounts(): Promise<Account[]>
  addAccount(input: NewAccount): Promise<void>
  updateAccount(id: string, patch: Partial<Pick<Account, 'introducedTo' | 'notes' | 'active' | 'colleague' | 'functions'>>): Promise<void>
  /** WID-1 and WID-2: pass on needs the colleague and the split. */
  passWiderLead(id: string, colleague: string, split: string): Promise<void>
  setWiderLeadStatus(id: string, status: WiderLeadStatus): Promise<void>

  /** The lists under People, in order. */
  lists(): Promise<PeopleList[]>
  createList(input: { name: string; key: string; position: number }): Promise<void>
  updateList(id: string, patch: Partial<Pick<PeopleList, 'name' | 'colour' | 'archived' | 'position'>>): Promise<void>
  setMemberGroup(memberId: string, group: string): Promise<void>
  /** Every active member on every list, with their cadence state. */
  members(): Promise<Member[]>
  /** The last touches with a person, newest first (29.1, History). */
  touches(personId: string, limit?: number): Promise<Touch[]>
  /** PEO-1: Logged a reply records a LinkedIn touch for today. The database resets the cadence. */
  logReply(personId: string): Promise<void>
  /** PEO-2: Move tier, with a reason in one line. The database writes the history row. */
  moveTier(memberId: string, tier: Tier, reason: string): Promise<void>
  removeFromList(memberId: string, reason: string): Promise<void>
  /** PEO-3: the database removes them from the list, cancels drafts and closes follow-ups. */
  setDoNotContact(personId: string): Promise<void>
  /** Notes for next contact, editable in place on the card. */
  saveNotes(personId: string, notes: string): Promise<void>
  /** The profile summary, written by hand; 600 characters at most. */
  saveProfileSummary(personId: string, text: string): Promise<void>
  /** Ask the signals agent to read the profile and write a summary back on its next run. */
  askProfilePull(personId: string): Promise<void>
  /** 29.4: by hand, from name, company, list and tier. A thin person row and a member row. */
  addPerson(input: { name: string; title: string; company: string; listId: string; tier: Tier; why: string }): Promise<void>

  /** New signals, strongest first (29.2). */
  /** Numbers, Quarter (32.2). */
  kpiQuarter(): Promise<KpiQuarter[]>
  followUpsQuarter(): Promise<FollowUpsDone>
  bdFunnel(): Promise<BdFunnel>
  /** Numbers, Review (32.3): the last 12 weeks, the outputs that moved and the owner's notes. */
  kpiWeeks(): Promise<KpiWeekRow[]>
  kpiOutputWeeks(): Promise<KpiOutputWeek[]>
  followUpsWeeks(): Promise<FollowUpsDone[]>
  weeklyReview(week: string): Promise<WeeklyReview | null>
  saveWeeklyReview(week: string, fields: ReviewFields): Promise<void>

  /** Settings, Agents (32.4). */
  agents(): Promise<Agent[]>
  setAgentEnabled(code: string, enabled: boolean): Promise<void>
  updateAgentSetup(code: string, patch: { connections?: string[]; criteria?: Record<string, unknown> }): Promise<void>
  agentRuns(code: string): Promise<AgentRun[]>
  agentPrompts(code: string): Promise<AgentPrompt[]>
  /** Save as new version: the next number, made active in one transaction (AGT-1). */
  saveAgentPrompt(code: string, body: string, note: string): Promise<number>
  activateAgentPrompt(code: string, version: number): Promise<void>
  /** Create new key (32.4): the plain key, shown once and never stored (34.3). */
  createAgentKey(code: string): Promise<string>
  revokeAgentKey(code: string): Promise<void>
  /** E9: ask for a manual run. The agent picks it up at the top of its schedule. */
  requestRun(code: string): Promise<void>

  // ---- Tasks (0049): everything the owner has to do, from every source.
  /** Raises the standing suggestions, then reads the queue. */
  tasks(): Promise<Task[]>
  /** The primary action for a task: done, with the record behind it moved where 22.3 says. */
  completeTask(task: Task, detail?: { searchId?: string }): Promise<void>
  binTask(task: Task, reason: string): Promise<void>
  snoozeTask(task: Task, until: string): Promise<void>
  /** Put a task back after an undo. */
  reopenTask(task: Task): Promise<void>
  /** The owner's own words and dates, kept beside the agent's. */
  saveTaskEdits(task: Task, edits: Partial<TaskEdits>): Promise<void>
  /** The owner's order within a column. Keys in the order they should show. */
  reorderTasks(keys: string[]): Promise<void>
  /** The draft the owner polished. Only while the message is still a draft (MSG-4). */
  saveDraft(task: Task, body: string, subject: string | null): Promise<void>
  /** Send through the engine (E5). Returns the engine's one-line answer. */
  sendTask(task: Task): Promise<string>
  /** Create the draft in Outlook and return its link. */
  openInOutlook(task: Task): Promise<string>
  /** A task with no agent draft gets its own message row, so Open in Outlook and Copy work. Returns the message id. */
  createTaskDraft(task: Task, subject: string, body: string): Promise<string>
  /** The chat on a task (0052): every line so far and the open or last job. */
  taskChat(taskKey: string): Promise<TaskChat>
  /** Ask the task assistant: is it still relevant, change what it is for, or do it. Returns the job id. */
  askTask(taskKey: string, kind: TaskJobKind, instruction?: string): Promise<string>
  /** Settings, Connections (24.9): status only. Secrets never reach the browser. */
  connections(): Promise<Connection[]>
  /** The address that starts the Outlook sign-in, carrying a one-time state made for the owner. */
  outlookStartUrl(): Promise<string>
  /** Check a Granola or Spott key with one read, keep it server side, return the new status. The key is not returned. */
  saveConnectionKey(provider: 'granola' | 'spott', key: string): Promise<Connection>
  disconnect(provider: ConnectionProvider): Promise<void>
  /** Settings, Send rules (20.9, 32.4). */
  sendingPaused(): Promise<boolean>
  setSendingPaused(paused: boolean): Promise<void>
  /** Messages held because sending was off. */
  heldMessages(): Promise<number>
  releaseHeld(to: 'send' | 'draft'): Promise<void>
  sendPolicies(): Promise<SendPolicy[]>
  updateSendPolicy(type: string, patch: SendPolicyPatch): Promise<void>
  /** Settings, Targets (13.2). The change starts next Monday; the date is returned. */
  targets(): Promise<Target[]>
  setTarget(kpi: string, period: Target['period'], target: number): Promise<string>

  /** Settings, Profile (32.4). */
  appSettings(): Promise<AppSettings>
  updateAppSettings(patch: Partial<AppSettings>): Promise<void>
  sharedBlocks(): Promise<SharedBlock[]>
  updateSharedBlock(code: string, body: string): Promise<void>
  /** Settings, Data (32.4, 15.7, 15.8). */
  doNotContact(): Promise<DoNotContact[]>
  addDoNotContact(input: { name: string; company: string; scope: 'person' | 'company'; reason: string }): Promise<void>
  auditLog(limit?: number): Promise<AuditEntry[]>
  personFind(query: string): Promise<FoundPerson[]>
  personExport(personId: string): Promise<unknown>
  /** Removes every row about the person and returns counts per table. The CRM is not touched. */
  personDelete(personId: string, confirm: string): Promise<Record<string, number | string>>
  /** Everything the owner can read, as one document, and an audit row. */
  exportEverything(): Promise<unknown>

  /** The weekly health line on Review (33.7). Empty for the reviewer. */
  systemWeeks(): Promise<SystemWeek[]>

  /** Quick capture and search (25.7). Capture returns where to go next. */
  capture(kind: CaptureKind, values: Record<string, string>): Promise<{ route?: string }>
  search(query: string): Promise<SearchHit[]>

  /** Numbers, This week (32.1). */
  kpiThisWeek(): Promise<KpiWeek[]>
  kpiStreaks(): Promise<KpiStreak[]>
  /** The rows behind one KPI this week, newest first. Owner only. */
  kpiEvents(kpi: string): Promise<KpiEvent[]>
  /** A manual correction: its own row with manual true and a reason (22.4). Never an edit. */
  correctKpi(kpi: string, amount: number, reason: string): Promise<void>

  /** Content (31.2): everything not binned, highest rank first. */
  contentItems(): Promise<ContentItem[]>
  updateContent(id: string, patch: ContentPatch): Promise<void>
  /** A post written by hand in the calendar's composer: a LinkedIn post from the owner, filed under its first line. */
  addContent(input: NewContent): Promise<ContentItem>

  /** Problem reports: every one, newest first; the queue narrows them. */
  problems(): Promise<Problem[]>
  reportProblem(input: ProblemReport): Promise<Problem>
  updateProblem(id: string, patch: ProblemPatch): Promise<void>
  problemNotes(id: string): Promise<ProblemNote[]>
  addProblemNote(id: string, body: string, author: string | null): Promise<ProblemNote>
  problemScreenshots(id: string): Promise<ProblemScreenshot[]>
  addProblemScreenshot(id: string, dataUrl: string): Promise<ProblemScreenshot>

  /** Searches and the candidates in play (30, 31.1). */
  searches(): Promise<Search[]>
  addSearch(input: NewSearch): Promise<Search>
  updateSearch(id: string, patch: SearchPatch): Promise<void>
  searchCandidates(): Promise<SearchCandidate[]>
  addCandidate(searchId: string, personId: string): Promise<void>
  updateCandidate(id: string, patch: CandidatePatch): Promise<void>
  searchNotes(searchId: string): Promise<SearchNote[]>
  saveSearchNote(searchId: string, tab: SearchNoteTab, content: string, structured: Record<string, unknown> | null): Promise<void>
  /** Calls of the last 60 days, newest first. */
  calls(): Promise<Call[]>
  updateCall(id: string, patch: CallPatch): Promise<void>
  aStarSuggestions(): Promise<AStarSuggestion[]>
  aStarVerdict(id: string, verdict: 'good' | 'not_good'): Promise<void>
  warmSpecs(): Promise<WarmSpec[]>
  setWarmSpec(personId: string, on: boolean): Promise<void>
  /** The library behind Spec: everyone with a call in the last 90 days, newest call first. */
  spokenTo(): Promise<SpokenPerson[]>
  /** The newest spec request per person. */
  specRequests(): Promise<SpecRequest[]>
  /** Ask the research agent for matches. Marks them a good candidate. */
  requestSpec(personId: string, ask: SpecAsk): Promise<void>
  campaigns(): Promise<Campaign[]>
  addCampaign(input: { name: string; tool: string; jobLeadId: string | null; candidatePersonId: string | null; steps?: CampaignStep[] }): Promise<void>
  updateCampaign(id: string, patch: CampaignPatch): Promise<void>

  /** Templates (12.5, 32.4) and the send engine's log and actions (8.4, 15.6). */
  templates(): Promise<Template[]>
  addTemplate(input: NewTemplate): Promise<void>
  /** Editing subject or body of an approved template makes version n+1, unapproved (TPL-1). */
  saveTemplate(id: string, patch: { subject: string | null; body: string }): Promise<void>
  /** Returns how many waiting messages were queued by the approval. */
  approveTemplate(id: string): Promise<number>
  seedTemplates(): Promise<number>
  /** Ten post drafts from the owner's calls and the agents' work (0035). Returns how many were added. */
  seedContentIdeas(): Promise<number>
  sendLog(limit?: number): Promise<SendLogRow[]>
  /** Through the send server function. Only the engine can queue, mark or cancel a message (MSG-4). */
  sendAction(messageId: string, action: SendAction): Promise<SendActionResult>
  /** A test email to the owner's own mailbox, queued for the next tick (0043). */
  sendTest(type: string): Promise<SendActionResult>

  signals(): Promise<Signal[]>
  setSignalStatus(id: string, status: SignalStatus): Promise<void>
  /**
   * Add to league from a signal (29.4): a thin person row where none exists,
   * a member row at League One with the signal as the reason, and the
   * signal marked added_to_league.
   */
  addSignalToList(signal: Signal, listId: string): Promise<void>
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/** Call an edge function and read its error in the owner's words (API-6) when it gives one. */
async function invokeFunction<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke(name, { body })
  if (error) {
    let message = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) {
        const b = (await ctx.json()) as { error?: { message?: string } }
        if (b?.error?.message) message = b.error.message
      }
    } catch {
      // keep the client's message
    }
    throw new Error(message)
  }
  return data as T
}

const live: DataSource = {
  // Section 14.1: new and stale items, not counting sent-for-you.
  async needsYou() {
    // Needs you is the Now column of the Tasks board: late, due today or urgent (16 November).
    const today = ukClock(new Date()).date
    const all = await live.tasks()
    return all.filter((t) => !t.waitingOn && band(t, today) === 'now').length
  },

  async followUpsDue() {
    const today = ukClock(new Date()).date
    const { data, error } = await supabase!
      .from('follow_ups')
      .select('due_on')
      .eq('status', 'open')
      .eq('direction', 'owed')
      .lte('due_on', today)
      .order('due_on', { ascending: true })
    fail(error)
    const rows = (data ?? []) as { due_on: string }[]
    const late = rows.filter((r) => r.due_on < today)
    return {
      due: rows.length,
      late: late.length,
      lateFromDay: late.length > 0 ? weekdayOf(late[0].due_on) : null,
    }
  },

  async dayToday() {
    const today = ukClock(new Date()).date
    const { data, error } = await supabase!
      .from('calendar_today')
      .select('id, starts_at, ends_at, title, call_type, person_name, is_external, person:people!person_id (crm_url)')
      .gte('starts_at', new Date(Date.now() - 18 * 3_600_000).toISOString())
      .order('starts_at', { ascending: true })
    fail(error)
    type Row = { id: string; starts_at: string; ends_at: string | null; title: string; call_type: string; person_name: string | null; is_external: boolean; person: { crm_url: string | null } | null }
    return ((data ?? []) as unknown as Row[])
      .filter((r) => ukClock(new Date(r.starts_at)).date === today)
      .map((r) => ({ id: r.id, startsAt: r.starts_at, endsAt: r.ends_at, title: r.title, callType: r.call_type, personName: r.person_name, crmUrl: r.person?.crm_url ?? null, isExternal: r.is_external }))
  },

  async calendarWeek() {
    // calendar_today holds seven days since 0045. Today 00:00 UK is at most a
    // day back, so read from a day ago and keep today to today+6 by UK date.
    const today = ukClock(new Date()).date
    const last = shiftDate(today, 6)
    const { data, error } = await supabase!
      .from('calendar_today')
      .select('id, starts_at, ends_at, title, call_type, person_name, is_external, person:people!person_id (crm_url)')
      .gte('starts_at', new Date(Date.now() - 24 * 3_600_000).toISOString())
      .lt('starts_at', new Date(Date.now() + 8 * 24 * 3_600_000).toISOString())
      .order('starts_at', { ascending: true })
    fail(error)
    type Row = { id: string; starts_at: string; ends_at: string | null; title: string; call_type: string; person_name: string | null; is_external: boolean; person: { crm_url: string | null } | null }
    return ((data ?? []) as unknown as Row[])
      .filter((r) => {
        const d = ukClock(new Date(r.starts_at)).date
        return d >= today && d <= last
      })
      .map((r) => ({ id: r.id, startsAt: r.starts_at, endsAt: r.ends_at, title: r.title, callType: r.call_type, personName: r.person_name, crmUrl: r.person?.crm_url ?? null, isExternal: r.is_external }))
  },

  async callsToday() {
    // Still to come today only: since 0045 the table also holds the next six days.
    const today = ukClock(new Date()).date
    const { data, error } = await supabase!
      .from('calendar_today')
      .select('id, starts_at, title, call_type, person_name, person:people!person_id (crm_url)')
      .eq('is_external', true)
      .gte('starts_at', new Date().toISOString())
      .lt('starts_at', new Date(Date.now() + 25 * 3_600_000).toISOString())
      .order('starts_at', { ascending: true })
    fail(error)
    type Row = { id: string; starts_at: string; title: string; call_type: string; person_name: string | null; person: { crm_url: string | null } | null }
    return ((data ?? []) as unknown as Row[]).filter((r) => ukClock(new Date(r.starts_at)).date === today).map((r) => ({
      id: r.id,
      startsAt: r.starts_at,
      title: r.title,
      callType: r.call_type,
      personName: r.person_name,
      crmUrl: r.person?.crm_url ?? null,
    }))
  },

  async weekTargets() {
    const { data, error } = await supabase!.from('kpi_this_week').select('pmm_hit')
    fail(error)
    const rows = (data ?? []) as { pmm_hit: boolean }[]
    return { hit: rows.filter((r) => r.pmm_hit).length, total: rows.length }
  },

  async jobLeads() {
    const { data, error } = await supabase!
      .from('job_leads')
      .select(
        'id, company, role, city, country, level, sources, source_urls, poster_name, poster_title, poster_profile_url, outreach_stage, outreach_connection_on, outreach_connected_on, outreach_messaged_on, outreach_replied_on, reply_outcome, connection_note, first_message, outreach_note, uk_to_us, ' +
          'fit_score, fit_reason, existing_client, stage, dead_reason, matched, first_seen_on, posted_on, chased_on, replied_on, ' +
          'meeting_on, won_on, spec_message:messages!spec_message_id (body)',
      )
      .order('fit_score', { ascending: false, nullsFirst: false })
    fail(error)
    type Row = {
      id: string
      company: string
      role: string
      city: string | null
      country: 'US' | 'UK' | 'other'
      level: string | null
      sources: string[]
      source_urls: string[]
      poster_name: string | null
      poster_title: string | null
      poster_profile_url: string | null
      fit_score: number | null
      fit_reason: string | null
      existing_client: boolean
      stage: JobStage
      dead_reason: string | null
      matched: { person_id?: string | null; name?: string; reason?: string }[]
      first_seen_on: string
      posted_on: string | null
      chased_on: string | null
      replied_on: string | null
      meeting_on: string | null
      won_on: string | null
      spec_message: { body: string | null } | null
      outreach_stage: OutreachStage
      outreach_connection_on: string | null
      outreach_connected_on: string | null
      outreach_messaged_on: string | null
      outreach_replied_on: string | null
      reply_outcome: ReplyOutcome | null
      connection_note: string | null
      first_message: string | null
      outreach_note?: string | null
      uk_to_us: boolean
    }
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      company: r.company,
      role: r.role,
      city: r.city,
      country: r.country,
      level: r.level,
      sources: r.sources ?? [],
      sourceUrls: r.source_urls ?? [],
      posterName: r.poster_name,
      posterTitle: r.poster_title,
      posterProfileUrl: r.poster_profile_url,
      fitScore: r.fit_score,
      fitReason: r.fit_reason,
      existingClient: r.existing_client,
      stage: r.stage,
      deadReason: r.dead_reason,
      outreachStage: r.outreach_stage ?? 'found',
      outreachConnectionOn: r.outreach_connection_on,
      outreachConnectedOn: r.outreach_connected_on,
      outreachMessagedOn: r.outreach_messaged_on,
      outreachRepliedOn: r.outreach_replied_on,
      replyOutcome: r.reply_outcome,
      connectionNote: r.connection_note,
      firstMessage: r.first_message,
      outreachNote: r.outreach_note ?? null,
      ukToUs: r.uk_to_us ?? false,
      matched: (Array.isArray(r.matched) ? r.matched : [])
        .filter((m) => typeof m.name === 'string')
        .map((m) => ({ personId: m.person_id ?? null, name: m.name!, reason: m.reason ?? '' })),
      draft: r.spec_message?.body ?? null,
      firstSeenOn: r.first_seen_on,
      postedOn: r.posted_on,
      chasedOn: r.chased_on,
      repliedOn: r.replied_on,
      meetingOn: r.meeting_on,
      wonOn: r.won_on,
    }))
  },

  async chasedThisWeek() {
    const { data, error } = await supabase!.from('kpi_this_week').select('total, target').eq('kpi', 'posts_chased')
    fail(error)
    const row = ((data ?? []) as { total: number; target: number }[])[0]
    return row ? { total: Number(row.total), target: Number(row.target) } : { total: 0, target: null }
  },

  async setLeadStage(id, stage, deadReason) {
    const change: { stage: JobStage; dead_reason?: string } = { stage }
    if (stage === 'dead') change.dead_reason = deadReason
    const { error } = await supabase!.from('job_leads').update(change).eq('id', id)
    fail(error)
  },

  async passLead(lead, colleague) {
    // Two writes: the wider lead first, so the job lead always points at a row.
    const { data, error } = await supabase!
      .from('wider_leads')
      .insert({
        company: lead.company,
        role: lead.role,
        function: 'pmm',
        country: lead.country,
        location: lead.city,
        source: 'job_post',
        job_lead_id: lead.id,
        existing_client: lead.existingClient,
        passed_to: colleague,
        passed_on: ukClock(new Date()).date,
        status: 'passed',
      })
      .select('id')
      .single()
    fail(error)
    const wider = (data as { id: string } | null)?.id
    const { error: e2 } = await supabase!.from('job_leads').update({ stage: 'passed', wider_lead_id: wider }).eq('id', lead.id)
    fail(e2)
  },

  async inboxItems() {
    const { data, error } = await supabase!
      .from('inbox_items')
      .select(INBOX_COLUMNS)
      .in('status', ['new', 'stale'])
      .neq('type', 'auto_sent')
      .order('rank', { ascending: false })
    fail(error)
    return ((data ?? []) as unknown as InboxRow[]).map(toInboxItem)
  },

  async sentForYou() {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const { data, error } = await supabase!
      .from('inbox_items')
      .select(INBOX_COLUMNS)
      .eq('type', 'auto_sent')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
    fail(error)
    return ((data ?? []) as unknown as InboxRow[]).map(toInboxItem)
  },

  async actOnInbox(item, action, extra = {}) {
    // The record first, so the item never says done while the record is unchanged.
    if (action === 'done' || action === 'pass') {
      if (item.refTable === 'job_leads' && item.refId) {
        const { error } = await supabase!.from('job_leads').update({ stage: 'chased' }).eq('id', item.refId).eq('stage', 'new')
        fail(error)
      } else if (item.refTable === 'referrals' && item.refId) {
        const { error } = await supabase!.from('referrals').update({ stage: 'contacted' }).eq('id', item.refId).eq('stage', 'new')
        fail(error)
      } else if (item.refTable === 'wider_leads' && item.refId && action === 'pass') {
        const { error } = await supabase!
          .from('wider_leads')
          .update({ status: 'passed', passed_to: extra.colleague, split_note: extra.split })
          .eq('id', item.refId)
        fail(error)
      }
    }
    const change: Record<string, unknown> = { status: inboxStatusAfter(action) }
    if (extra.draft !== undefined) change.draft = extra.draft
    if (action === 'bin') change.bin_reason = extra.binReason ?? 'Other'
    if (action === 'snooze') change.snoozed_until = extra.snoozedUntil
    if (action === 'approve' && extra.on) change.due_on = extra.on
    const { error } = await supabase!.from('inbox_items').update(change).eq('id', item.id)
    fail(error)
  },

  async undoInbox(item, action) {
    if (action === 'done' || action === 'pass') {
      if (item.refTable === 'job_leads' && item.refId) {
        const { error } = await supabase!.from('job_leads').update({ stage: 'new' }).eq('id', item.refId).eq('stage', 'chased')
        fail(error)
      } else if (item.refTable === 'referrals' && item.refId) {
        const { error } = await supabase!.from('referrals').update({ stage: 'new' }).eq('id', item.refId).eq('stage', 'contacted')
        fail(error)
      } else if (item.refTable === 'wider_leads' && item.refId && action === 'pass') {
        const { error } = await supabase!
          .from('wider_leads')
          .update({ status: 'spotted', passed_to: null, passed_on: null, split_note: null })
          .eq('id', item.refId)
        fail(error)
      }
    }
    const { error } = await supabase!
      .from('inbox_items')
      .update({ status: item.status, bin_reason: null, snoozed_until: null })
      .eq('id', item.id)
    fail(error)
  },

  async binStale(ids) {
    if (ids.length === 0) return
    const { error } = await supabase!.from('inbox_items').update({ status: 'binned', bin_reason: 'Old' }).in('id', ids)
    fail(error)
  },

  async followUps() {
    const { data, error } = await supabase!
      .from('follow_ups')
      .select(
        'id, person_id, person_name, company, kind, reason, source, direction, due_on, status, snoozed_until, created_at, ' +
          'message:messages!message_id (id, channel, level_at_creation, body, state)',
      )
      .in('status', ['open', 'snoozed'])
      .order('due_on', { ascending: true })
    fail(error)
    type Row = {
      id: string
      person_id: string | null
      person_name: string
      company: string | null
      kind: string
      reason: string
      source: string
      direction: 'owed' | 'waiting'
      due_on: string
      status: FollowUpStatus
      snoozed_until: string | null
      created_at: string
      message: { id: string; channel: 'email' | 'linkedin'; level_at_creation: 'automatic' | 'one_click' | 'draft_only'; body: string | null; state: string } | null
    }
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      personId: r.person_id,
      personName: r.person_name,
      company: r.company,
      kind: r.kind,
      reason: r.reason,
      source: r.source,
      direction: r.direction,
      dueOn: r.due_on,
      status: r.status,
      snoozedUntil: r.snoozed_until,
      message: r.message ? { id: r.message.id, channel: r.message.channel, level: r.message.level_at_creation, body: r.message.body, state: r.message.state } : null,
      createdAt: r.created_at,
    }))
  },

  async setFollowUpStatus(id, status, extra = {}) {
    if (extra.draft !== undefined) {
      // The edited draft lives on the paired message, which is still a draft.
      const { data } = await supabase!.from('follow_ups').select('message_id').eq('id', id).single()
      const messageId = (data as { message_id: string | null } | null)?.message_id
      if (messageId) {
        const { error } = await supabase!.from('messages').update({ body: extra.draft }).eq('id', messageId)
        fail(error)
      }
    }
    const change: Record<string, unknown> = { status }
    if (status === 'snoozed') change.snoozed_until = extra.snoozedUntil
    const { error } = await supabase!.from('follow_ups').update(change).eq('id', id)
    fail(error)
  },

  async redateFollowUps(ids, dueOn) {
    if (ids.length === 0) return
    const { error } = await supabase!.from('follow_ups').update({ due_on: dueOn }).in('id', ids)
    fail(error)
  },

  async recordFollowUpBlock(minutes) {
    const week = ukClock(new Date()).date
    const { data, error } = await supabase!.rpc('week_of', { ts: new Date().toISOString() })
    fail(error)
    const monday = (data as string | null) ?? week
    const { error: e2 } = await supabase!
      .from('weekly_reviews')
      .upsert({ week: monday, followup_block_minutes: minutes }, { onConflict: 'owner_id,week' })
    fail(e2)
  },

  async coachingSessions() {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
    const { data, error } = await supabase!
      .from('coaching_sessions')
      .select(
        'id, person_id, booked_for, held_at, source, status, q_interviewed_where, q_who_else_looking, q_how_they_hire, ' +
          'q_events_rated, advice_given, referrals_count, leads_count, followed_up, ' +
          'person:people!person_id (display_name, display_title, display_company)',
      )
      .or(`booked_for.gte.${since},held_at.gte.${since}`)
      .order('booked_for', { ascending: false, nullsFirst: false })
    fail(error)
    type Row = {
      id: string
      person_id: string
      booked_for: string | null
      held_at: string | null
      source: string | null
      status: CoachingSession['status']
      q_interviewed_where: string | null
      q_who_else_looking: string | null
      q_how_they_hire: string | null
      q_events_rated: string | null
      advice_given: string | null
      referrals_count: number
      leads_count: number
      followed_up: boolean
      person: { display_name: string; display_title: string | null; display_company: string | null } | null
    }
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      personId: r.person_id,
      personName: r.person?.display_name ?? 'Someone',
      personTitle: r.person?.display_title ?? null,
      personCompany: r.person?.display_company ?? null,
      bookedFor: r.booked_for,
      heldAt: r.held_at,
      source: r.source,
      status: r.status,
      answers: {
        interviewedWhere: r.q_interviewed_where,
        whoElseLooking: r.q_who_else_looking,
        howTheyHire: r.q_how_they_hire,
        eventsRated: r.q_events_rated,
      },
      adviceGiven: r.advice_given,
      referralsCount: r.referrals_count,
      leadsCount: r.leads_count,
      followedUp: r.followed_up,
    }))
  },

  async markCoachingFollowedUp(id) {
    const { error } = await supabase!.from('coaching_sessions').update({ followed_up: true }).eq('id', id)
    fail(error)
  },

  async referrals() {
    const { data, error } = await supabase!
      .from('referrals')
      .select('id, referred_name, referred_company, referred_title, referred_by_id, referred_by_name, context, kind, stage, thanked, received_on, contacted_on, hiring_manager_name, hiring_manager_url, sourced_via, job_open, job_lead_id')
      .in('stage', ['new', 'contacted', 'spoken'])
      .order('received_on', { ascending: true })
    fail(error)
    type Row = {
      id: string
      referred_name: string
      referred_company: string | null
      referred_title: string | null
      referred_by_id: string | null
      referred_by_name: string
      context: string | null
      kind: Referral['kind']
      stage: ReferralStage
      thanked: boolean
      received_on: string
      contacted_on: string | null
      hiring_manager_name: string | null
      hiring_manager_url: string | null
      sourced_via: Referral['sourcedVia']
      job_open: Referral['jobOpen']
      job_lead_id: string | null
    }
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      referredName: r.referred_name,
      referredCompany: r.referred_company,
      referredTitle: r.referred_title,
      referredById: r.referred_by_id,
      referredByName: r.referred_by_name,
      hiringManagerName: r.hiring_manager_name,
      hiringManagerUrl: r.hiring_manager_url,
      sourcedVia: r.sourced_via,
      jobOpen: r.job_open,
      jobLeadId: r.job_lead_id,
      context: r.context,
      kind: r.kind,
      stage: r.stage,
      thanked: r.thanked,
      receivedOn: r.received_on,
      contactedOn: r.contacted_on,
    }))
  },

  async setReferralStage(id, stage) {
    const { error } = await supabase!.from('referrals').update({ stage }).eq('id', id)
    fail(error)
  },

  async widerLeads() {
    const { data, error } = await supabase!
      .from('wider_leads')
      .select('id, company, role, function, country, location, source, mentioned_by_name, existing_client, passed_to, passed_on, split_note, status, notes, created_at')
      .in('status', ['spotted', 'passed', 'meeting_booked'])
      .order('created_at', { ascending: false })
    fail(error)
    type Row = {
      id: string
      company: string
      role: string | null
      function: string
      country: 'US' | 'UK' | 'other'
      location: string | null
      source: string
      mentioned_by_name: string | null
      existing_client: boolean
      passed_to: string | null
      passed_on: string | null
      split_note: string | null
      status: WiderLeadStatus
      notes: string | null
      created_at: string
    }
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      company: r.company,
      role: r.role,
      function: r.function,
      country: r.country,
      location: r.location,
      source: r.source,
      mentionedByName: r.mentioned_by_name,
      existingClient: r.existing_client,
      passedTo: r.passed_to,
      passedOn: r.passed_on,
      splitNote: r.split_note,
      status: r.status,
      notes: r.notes,
      createdAt: r.created_at,
    }))
  },

  async addWiderLead(input) {
    const { error } = await supabase!.from('wider_leads').insert({
      company: input.company, role: input.role, function: input.function, country: input.country, source: input.source,
      account_id: input.accountId, existing_client: input.existingClient, notes: input.notes, mentioned_by_name: input.mentionedByName,
    })
    fail(error)
  },

  async setOutreach(id, patch) {
    const row: Record<string, unknown> = {}
    if (patch.outreachStage !== undefined) row.outreach_stage = patch.outreachStage
    if (patch.replyOutcome !== undefined) row.reply_outcome = patch.replyOutcome
    if (patch.connectionNote !== undefined) row.connection_note = patch.connectionNote
    if (patch.firstMessage !== undefined) row.first_message = patch.firstMessage
    if (patch.outreachNote !== undefined) row.outreach_note = patch.outreachNote
    const { error } = await supabase!.from('job_leads').update(row).eq('id', id)
    fail(error)
  },

  async updateReferral(id, patch) {
    const row: Record<string, unknown> = {}
    if (patch.hiringManagerName !== undefined) row.hiring_manager_name = patch.hiringManagerName
    if (patch.hiringManagerUrl !== undefined) row.hiring_manager_url = patch.hiringManagerUrl
    if (patch.sourcedVia !== undefined) row.sourced_via = patch.sourcedVia
    if (patch.jobOpen !== undefined) row.job_open = patch.jobOpen
    const { error } = await supabase!.from('referrals').update(row).eq('id', id)
    fail(error)
  },

  async referralToJobLead(id) {
    const { data, error } = await supabase!.rpc('referral_to_job_lead', { p_id: id })
    fail(error)
    return data as string
  },

  async accounts() {
    const { data, error } = await supabase!.from('accounts').select('id, company, kind, colleague, contact_name, contact_title, functions, crm_url, notes, active, introduced_to').order('company')
    fail(error)
    type Row = { id: string; company: string; kind: AccountKind; colleague: string | null; contact_name: string | null; contact_title: string | null; functions: string[] | null; crm_url: string | null; notes: string | null; active: boolean; introduced_to: string | null }
    return ((data ?? []) as Row[]).map((r) => ({ id: r.id, company: r.company, kind: r.kind, colleague: r.colleague, contactName: r.contact_name, contactTitle: r.contact_title, functions: r.functions ?? [], crmUrl: r.crm_url, notes: r.notes, active: r.active, introducedTo: r.introduced_to }))
  },

  async addAccount(input) {
    const key = input.company.trim().toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    const { error } = await supabase!.from('accounts').insert({ company: input.company, company_key: key, kind: input.kind, colleague: input.colleague, contact_name: input.contactName, contact_title: input.contactTitle, functions: input.functions, crm_url: input.crmUrl })
    fail(error)
  },

  async updateAccount(id, patch) {
    const row: Record<string, unknown> = {}
    if (patch.introducedTo !== undefined) row.introduced_to = patch.introducedTo
    if (patch.notes !== undefined) row.notes = patch.notes
    if (patch.active !== undefined) row.active = patch.active
    if (patch.colleague !== undefined) row.colleague = patch.colleague
    if (patch.functions !== undefined) row.functions = patch.functions
    const { error } = await supabase!.from('accounts').update(row).eq('id', id)
    fail(error)
  },

  async passWiderLead(id, colleague, split) {
    const { error } = await supabase!
      .from('wider_leads')
      .update({ status: 'passed', passed_to: colleague, split_note: split })
      .eq('id', id)
    fail(error)
  },

  async setWiderLeadStatus(id, status) {
    const { error } = await supabase!.from('wider_leads').update({ status }).eq('id', id)
    fail(error)
  },

  async lists() {
    const { data, error } = await supabase!.from('lists').select('id, key, name, kind, seats, colour, archived, position').order('position')
    fail(error)
    return (data ?? []) as PeopleList[]
  },

  async createList({ name, key, position }) {
    const { error } = await supabase!.from('lists').insert({ name, key, kind: 'other', position })
    fail(error)
  },

  async updateList(id, patch) {
    const { error } = await supabase!.from('lists').update(patch).eq('id', id)
    fail(error)
  },

  async setMemberGroup(memberId, group) {
    const { error } = await supabase!.from('league_members').update({ group_name: group.trim() || null }).eq('id', memberId)
    fail(error)
  },

  async members() {
    const { data, error } = await supabase!
      .from('league_due_view')
      .select('id, person_id, display_name, display_title, display_company, list_id, tier, last_touch_on, next_due_on, days_late, state, missed_cycles, live_signal')
    fail(error)
    type View = {
      id: string
      person_id: string
      display_name: string
      display_title: string | null
      display_company: string | null
      list_id: string
      tier: Tier
      last_touch_on: string | null
      next_due_on: string
      days_late: number
      state: 'late' | 'due' | 'fine'
      missed_cycles: number
      live_signal: string | null
    }
    const views = (data ?? []) as View[]
    if (views.length === 0) return []
    const { data: extra, error: e2 } = await supabase!
      .from('league_members')
      .select('id, why, group_name, jobs_briefed, referrals_given, intros_made, person:people!person_id (city, crm_url, linkedin_url, notes_for_next_contact, profile_summary, profile_pulled_at)')
      .in('id', views.map((v) => v.id))
    fail(e2)
    type Extra = {
      id: string
      why: string | null
      group_name: string | null
      jobs_briefed: number
      referrals_given: number
      intros_made: number
      person: { city: string | null; crm_url: string | null; linkedin_url: string | null; notes_for_next_contact: string | null; profile_summary: string | null; profile_pulled_at: string | null } | null
    }
    const byId = new Map(((extra ?? []) as unknown as Extra[]).map((e) => [e.id, e]))
    return views.map((v) => {
      const e = byId.get(v.id)
      return {
        id: v.id,
        personId: v.person_id,
        name: v.display_name,
        title: v.display_title,
        company: v.display_company,
        city: e?.person?.city ?? null,
        crmUrl: e?.person?.crm_url ?? null,
        profileUrl: e?.person?.linkedin_url ?? null,
        listId: v.list_id,
        tier: v.tier,
        why: e?.why ?? null,
        groupName: e?.group_name ?? null,
        lastTouchOn: v.last_touch_on,
        nextDueOn: v.next_due_on,
        daysLate: Number(v.days_late),
        state: v.state,
        missedCycles: v.missed_cycles,
        liveSignal: v.live_signal,
        notesForNextContact: e?.person?.notes_for_next_contact ?? null,
        profileSummary: e?.person?.profile_summary ?? null,
        profilePulledAt: e?.person?.profile_pulled_at ?? null,
        jobsBriefed: e?.jobs_briefed ?? 0,
        referralsGiven: e?.referrals_given ?? 0,
        introsMade: e?.intros_made ?? 0,
      }
    })
  },

  async touches(personId, limit = 5) {
    const { data, error } = await supabase!
      .from('touches')
      .select('id, touched_on, channel, kind, note, source_url')
      .eq('person_id', personId)
      .order('touched_on', { ascending: false })
      .limit(limit)
    fail(error)
    type Row = { id: string; touched_on: string; channel: string; kind: string; note: string | null; source_url: string | null }
    return ((data ?? []) as Row[]).map((r) => ({ id: r.id, touchedOn: r.touched_on, channel: r.channel, kind: r.kind, note: r.note, sourceUrl: r.source_url }))
  },

  async logReply(personId) {
    const { error } = await supabase!.from('touches').insert({ person_id: personId, channel: 'linkedin', kind: 'message_replied', source: 'manual' })
    // A second reply on the same day is the same touch (TOU-4).
    if (error && !/touches_dedup_key_key|duplicate/i.test(error.message)) fail(error)
  },

  async moveTier(memberId, tier, reason) {
    const { error } = await supabase!.from('league_members').update({ tier, why: reason }).eq('id', memberId)
    fail(error)
  },

  async removeFromList(memberId, reason) {
    const { error } = await supabase!.from('league_members').update({ active: false, removed_reason: reason }).eq('id', memberId)
    fail(error)
  },

  async setDoNotContact(personId) {
    const { error } = await supabase!.from('people').update({ do_not_contact: true }).eq('id', personId)
    fail(error)
  },

  async saveNotes(personId, notes) {
    const { error } = await supabase!.from('people').update({ notes_for_next_contact: notes }).eq('id', personId)
    fail(error)
  },

  async saveProfileSummary(personId, text) {
    const { error } = await supabase!.from('people').update({ profile_summary: text.trim() || null }).eq('id', personId)
    fail(error)
  },

  async askProfilePull(personId) {
    const { error } = await supabase!.rpc('request_run', { p_agent: 'a4_signals', p_note: `profile:${personId}` })
    fail(error)
  },

  async addPerson({ name, title, company, listId, tier, why }) {
    const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
    const { data, error } = await supabase!
      .from('people')
      .insert({ display_name: name.trim(), name_key: key(name), display_title: title.trim() || null, display_company: company.trim() || null, company_key: company.trim() ? key(company) : null, kind: 'leader' })
      .select('id')
      .single()
    fail(error)
    const personId = (data as { id: string }).id
    const { error: e2 } = await supabase!.from('league_members').insert({ person_id: personId, list_id: listId, tier, why: why.trim() || null, added_from: 'manual' })
    fail(e2)
  },

  async appSettings() {
    const { data, error } = await supabase!.from('app_settings').select('*').single()
    fail(error)
    const r = data as Record<string, unknown>
    const icp = (r.icp_json ?? {}) as Record<string, unknown>
    const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : [])
    return {
      allSendingPaused: Boolean(r.all_sending_paused),
      icp: {
        sector: String(icp.sector ?? ''),
        companySize: String(icp.company_size ?? ''),
        buyer: String(icp.buyer ?? ''),
        locations: list(icp.locations),
        secondAngle: String(icp.second_angle ?? ''),
        excluded: list(icp.excluded),
      },
      coachingTitlePhrases: list(r.coaching_title_phrases),
      leagueDays: { premier: Number(r.league_days_premier), championship: Number(r.league_days_championship), leagueOne: Number(r.league_days_league_one) },
      health: {
        clientCooling: Number(r.health_client_cooling_days),
        clientCold: Number(r.health_client_cold_days),
        candidateCooling: Number(r.health_candidate_cooling_days),
        candidateCold: Number(r.health_candidate_cold_days),
      },
      feedback: { nudge: Number(r.feedback_nudge_days), cooling: Number(r.feedback_cooling_days), cold: Number(r.feedback_cold_days) },
      staleAfterDays: Number(r.stale_after_days),
      deckDefault: Boolean(r.deck_default),
      homeStats: list(r.home_stats),
      theme: r.theme === 'night' ? 'night' : 'paper',
      fontSans: String(r.font_sans),
      fontMono: String(r.font_mono),
      workingHours: (r.working_hours ?? {}) as Record<string, [string, string]>,
      reviewerEmail: (r.reviewer_email as string | null) ?? null,
    }
  },

  async updateAppSettings(patch) {
    const change: Record<string, unknown> = {}
    if (patch.icp) {
      change.icp_json = {
        sector: patch.icp.sector,
        company_size: patch.icp.companySize,
        buyer: patch.icp.buyer,
        locations: patch.icp.locations,
        second_angle: patch.icp.secondAngle,
        excluded: patch.icp.excluded,
      }
    }
    if (patch.coachingTitlePhrases) change.coaching_title_phrases = patch.coachingTitlePhrases
    if (patch.leagueDays) {
      change.league_days_premier = patch.leagueDays.premier
      change.league_days_championship = patch.leagueDays.championship
      change.league_days_league_one = patch.leagueDays.leagueOne
    }
    if (patch.health) {
      change.health_client_cooling_days = patch.health.clientCooling
      change.health_client_cold_days = patch.health.clientCold
      change.health_candidate_cooling_days = patch.health.candidateCooling
      change.health_candidate_cold_days = patch.health.candidateCold
    }
    if (patch.feedback) {
      change.feedback_nudge_days = patch.feedback.nudge
      change.feedback_cooling_days = patch.feedback.cooling
      change.feedback_cold_days = patch.feedback.cold
    }
    if (patch.staleAfterDays !== undefined) change.stale_after_days = patch.staleAfterDays
    if (patch.deckDefault !== undefined) change.deck_default = patch.deckDefault
    if (patch.homeStats) change.home_stats = patch.homeStats
    if (patch.theme) change.theme = patch.theme
    if (patch.fontSans) change.font_sans = patch.fontSans
    if (patch.fontMono) change.font_mono = patch.fontMono
    if (patch.workingHours) change.working_hours = patch.workingHours
    if (patch.reviewerEmail !== undefined) change.reviewer_email = patch.reviewerEmail ? patch.reviewerEmail.trim().toLowerCase() : null
    const { error } = await supabase!.from('app_settings').update(change).eq('id', true)
    fail(error)
  },

  async sharedBlocks() {
    const { data, error } = await supabase!.from('shared_blocks').select('code, title, body, updated_at').order('code')
    fail(error)
    type Row = { code: string; title: string; body: string; updated_at: string }
    return ((data ?? []) as Row[]).map((r) => ({ code: r.code, title: r.title, body: r.body, updatedAt: r.updated_at }))
  },

  async updateSharedBlock(code, body) {
    const { error } = await supabase!.from('shared_blocks').update({ body }).eq('code', code)
    fail(error)
  },

  async doNotContact() {
    const { data, error } = await supabase!.from('do_not_contact').select('id, name, company, scope, reason, created_at').order('created_at', { ascending: false })
    fail(error)
    type Row = { id: string; name: string | null; company: string | null; scope: 'person' | 'company'; reason: string | null; created_at: string }
    return ((data ?? []) as Row[]).map((r) => ({ id: r.id, name: r.name, company: r.company, scope: r.scope, reason: r.reason, createdAt: r.created_at }))
  },

  async addDoNotContact({ name, company, scope, reason }) {
    const { error } = await supabase!.from('do_not_contact').insert({ name: name.trim() || null, company: company.trim() || null, scope, reason: reason.trim() || null })
    fail(error)
  },

  async auditLog(limit = 50) {
    const { data, error } = await supabase!.from('audit_log').select('id, at, actor, action, target_table, detail').order('id', { ascending: false }).limit(limit)
    fail(error)
    type Row = { id: number; at: string; actor: string; action: string; target_table: string | null; detail: Record<string, unknown> | null }
    return ((data ?? []) as Row[]).map((r) => ({ id: r.id, at: r.at, actor: r.actor, action: r.action, targetTable: r.target_table, detail: r.detail }))
  },

  async personFind(query) {
    const { data, error } = await supabase!.rpc('person_find', { p_query: query })
    fail(error)
    type Row = { id: string; display_name: string; display_title: string | null; display_company: string | null; counts: Record<string, number> | null }
    return ((data ?? []) as Row[]).map((r) => ({ id: r.id, displayName: r.display_name, displayTitle: r.display_title, displayCompany: r.display_company, counts: r.counts ?? {} }))
  },

  async personExport(personId) {
    const { data, error } = await supabase!.rpc('person_export', { p_person: personId })
    fail(error)
    return data
  },

  async personDelete(personId, confirm) {
    const { data, error } = await supabase!.rpc('person_delete', { p_person: personId, p_confirm: confirm })
    fail(error)
    return (data ?? {}) as Record<string, number | string>
  },

  async exportEverything() {
    const tables = [
      'people', 'inbox_items', 'follow_ups', 'job_leads', 'wider_leads', 'referrals', 'coaching_sessions', 'campaigns', 'target_companies',
      'lists', 'league_members', 'league_history', 'touches', 'signals', 'kpi_events', 'targets', 'weekly_reviews', 'send_log', 'audit_log',
      'agents', 'agent_prompts', 'agent_runs', 'shared_blocks', 'send_policies', 'app_settings', 'do_not_contact', 'calendar_today',
    ]
    const out: Record<string, unknown> = { exported_at: new Date().toISOString() }
    for (const t of tables) {
      const { data, error } = await supabase!.from(t).select('*')
      fail(error)
      out[t] = data ?? []
    }
    // Message bodies and drafts are left out (15.8).
    const { data: messages, error } = await supabase!.from('messages').select('id, type, channel, person_id, to_name, state, hold_reason, created_by, level_at_creation, sent_at, created_at')
    fail(error)
    out.messages = messages ?? []
    const { error: e2 } = await supabase!.rpc('record_export', { p_kind: 'everything' })
    fail(e2)
    return out
  },

  async agents() {
    const { data, error } = await supabase!
      .from('agents')
      .select('code, name, schedule, enabled, model_tier, monthly_budget, key_created_at, consecutive_failures, connections, criteria')
      .order('code')
    fail(error)
    type Row = { code: string; name: string; schedule: string; enabled: boolean; model_tier: 'light' | 'standard'; monthly_budget: number | null; key_created_at: string | null; consecutive_failures: number; connections: string[] | null; criteria: Record<string, unknown> | null }
    const rows = (data ?? []) as Row[]
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    const { data: runs, error: e2 } = await supabase!
      .from('agent_runs')
      .select('agent, started_at, status, items_created, cost_estimate')
      .order('started_at', { ascending: false })
      .limit(400)
    fail(e2)
    type Run = { agent: string; started_at: string; status: AgentRunStatus; items_created: number; cost_estimate: number | null }
    const all = (runs ?? []) as Run[]
    return rows.map((r) => {
      const mine = all.filter((x) => x.agent === r.code)
      const last = mine[0]
      return {
        connections: r.connections ?? [],
        criteria: r.criteria ?? {},
        code: r.code,
        name: r.name,
        schedule: r.schedule,
        enabled: r.enabled,
        modelTier: r.model_tier,
        monthlyBudget: r.monthly_budget === null ? null : Number(r.monthly_budget),
        keyCreatedAt: r.key_created_at,
        consecutiveFailures: r.consecutive_failures,
        lastRun: last ? { startedAt: last.started_at, status: last.status, itemsCreated: last.items_created } : null,
        spentThisMonth: mine.filter((x) => x.started_at >= monthStart.toISOString()).reduce((n, x) => n + Number(x.cost_estimate ?? 0), 0),
      }
    })
  },

  async updateAgentSetup(code, patch) {
    const row: Record<string, unknown> = {}
    if (patch.connections !== undefined) row.connections = patch.connections
    if (patch.criteria !== undefined) row.criteria = patch.criteria
    const { error } = await supabase!.from('agents').update(row).eq('code', code)
    fail(error)
  },

  async setAgentEnabled(code, enabled) {
    const { error } = await supabase!.from('agents').update({ enabled }).eq('code', code)
    fail(error)
  },

  async agentRuns(code) {
    const { data, error } = await supabase!
      .from('agent_runs')
      .select('id, started_at, finished_at, status, items_created, items_merged, summary')
      .eq('agent', code)
      .order('started_at', { ascending: false })
      .limit(5)
    fail(error)
    type Row = { id: string; started_at: string; finished_at: string | null; status: AgentRunStatus; items_created: number; items_merged: number; summary: string | null }
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status,
      itemsCreated: r.items_created,
      itemsMerged: r.items_merged,
      summary: r.summary,
    }))
  },

  async agentPrompts(code) {
    const { data, error } = await supabase!.from('agent_prompts').select('version, body, active, note, created_at').eq('agent', code).order('version', { ascending: false })
    fail(error)
    type Row = { version: number; body: string; active: boolean; note: string | null; created_at: string }
    return ((data ?? []) as Row[]).map((r) => ({ version: r.version, body: r.body, active: r.active, note: r.note, createdAt: r.created_at }))
  },

  async saveAgentPrompt(code, body, note) {
    const { data, error } = await supabase!.rpc('save_agent_prompt', { p_agent: code, p_body: body, p_note: note || null })
    fail(error)
    return Number(data)
  },

  async activateAgentPrompt(code, version) {
    const { error } = await supabase!.rpc('activate_agent_prompt', { p_agent: code, p_version: version })
    fail(error)
  },

  async createAgentKey(code) {
    const { data, error } = await supabase!.rpc('agent_key_create', { p_agent: code })
    fail(error)
    return String(data)
  },

  async revokeAgentKey(code) {
    const { error } = await supabase!.rpc('agent_key_revoke', { p_agent: code })
    fail(error)
  },

  async requestRun(code) {
    const { error } = await supabase!.rpc('request_run', { p_agent: code })
    fail(error)
  },

  // ---- Tasks (0049)

  async tasks() {
    // The standing rules run when the page opens as well as nightly. They
    // never raise the same suggestion twice, so this is cheap.
    await supabase!.rpc('raise_suggestions')
    const { data, error } = await supabase!.from('tasks_view').select('*')
    fail(error)
    type Row = {
      task_key: string
      source: TaskSource
      source_id: string
      kind: TaskKind
      title: string
      why: string | null
      person_name: string | null
      company: string | null
      due_on: string | null
      rank: number | string
      waiting_on: string | null
      draft: string | null
      draft_original: string | null
      subject: string | null
      channel: 'email' | 'linkedin' | null
      message_id: string | null
      message_state: string | null
      links: TaskLink[] | null
      ref_table: string | null
      ref_id: string | null
      agent: string | null
      search_id: string | null
      created_at: string
      stale: boolean
      source_url: string | null
      o_title: string | null
      o_notes: string | null
      o_due_on: string | null
      o_sort_order: number | null
    }
    return ((data ?? []) as Row[]).map((r) => ({
      key: r.task_key,
      source: r.source,
      sourceId: r.source_id,
      kind: r.kind,
      title: r.title,
      why: r.why,
      personName: r.person_name,
      company: r.company,
      dueOn: r.due_on,
      rank: Number(r.rank),
      waitingOn: r.waiting_on,
      draft: r.draft,
      draftOriginal: r.draft_original,
      subject: r.subject,
      channel: r.channel,
      messageId: r.message_id,
      messageState: r.message_state,
      links: Array.isArray(r.links) ? r.links.filter((l) => l && l.url) : [],
      refTable: r.ref_table,
      refId: r.ref_id,
      agent: r.agent,
      searchId: r.search_id,
      createdAt: r.created_at,
      stale: r.stale,
      sourceUrl: r.source_url,
      edits: { title: r.o_title, notes: r.o_notes, dueOn: r.o_due_on, sortOrder: r.o_sort_order },
    }))
  },

  async completeTask(task, detail) {
    const today = ukClock(new Date()).date
    switch (task.source) {
      case 'inbox_items': {
        fail((await supabase!.from('inbox_items').update({ status: 'done', actioned_at: new Date().toISOString() }).eq('id', task.sourceId)).error)
        // 22.3: the record behind the item moves with it.
        if (task.refTable === 'job_leads' && task.refId && task.kind === 'job_lead') {
          fail((await supabase!.from('job_leads').update({ stage: 'chased' }).eq('id', task.refId).eq('stage', 'new')).error)
        }
        if (task.refTable === 'referrals' && task.refId && task.kind === 'referral') {
          fail((await supabase!.from('referrals').update({ stage: 'contacted' }).eq('id', task.refId)).error)
        }
        if (task.refTable === 'content_items' && task.refId && task.kind === 'content_draft') {
          fail((await supabase!.from('content_items').update({ status: 'approved' }).eq('id', task.refId)).error)
        }
        if (task.refTable === 'calls' && task.refId && task.kind === 'call_writeup' && detail?.searchId) {
          fail((await supabase!.from('calls').update({ search_id: detail.searchId, match_confidence: 'confirmed' }).eq('id', task.refId)).error)
        }
        return
      }
      case 'follow_ups':
        fail((await supabase!.from('follow_ups').update({ status: 'done' }).eq('id', task.sourceId)).error)
        return
      case 'calls':
        if (task.kind === 'cv_chase') {
          fail((await supabase!.from('calls').update({ w_cv: true }).eq('id', task.sourceId)).error)
          return
        }
        if (task.kind === 'call_confirm' && detail?.searchId) {
          fail((await supabase!.from('calls').update({ search_id: detail.searchId, match_confidence: 'confirmed' }).eq('id', task.sourceId)).error)
          return
        }
        break
      case 'content_items':
        if (task.kind === 'content_post') {
          fail((await supabase!.from('content_items').update({ status: 'posted', posted_on: today }).eq('id', task.sourceId)).error)
          return
        }
        if (task.kind === 'content_approve') {
          fail((await supabase!.from('content_items').update({ status: 'approved' }).eq('id', task.sourceId)).error)
          return
        }
        break
      case 'search_candidates':
        if (task.kind === 'feedback_chase') {
          const { data } = await supabase!.from('search_candidates').select('feedback_nudges').eq('id', task.sourceId).single()
          const n = Number((data as { feedback_nudges: number } | null)?.feedback_nudges ?? 0)
          fail((await supabase!.from('search_candidates').update({ feedback_nudges: n + 1 }).eq('id', task.sourceId)).error)
        }
        break
      default:
        break
    }
    // Derived tasks with no row of their own are closed through the override.
    fail((await supabase!.from('task_overrides').upsert({ task_key: task.key, status: 'done' }, { onConflict: 'task_key' })).error)
  },

  async binTask(task, reason) {
    if (task.source === 'inbox_items') {
      fail((await supabase!.from('inbox_items').update({ status: 'binned', bin_reason: reason }).eq('id', task.sourceId)).error)
      if (task.refTable === 'job_leads' && task.refId && task.kind === 'job_lead') {
        const code = reason === 'Filled' ? 'filled' : reason === 'Uses another agency' ? 'other_agency' : reason === 'Not ICP' || reason === 'Not a fit' ? 'not_icp' : 'other'
        fail((await supabase!.from('job_leads').update({ stage: 'dead', dead_reason: code }).eq('id', task.refId)).error)
      }
      return
    }
    if (task.source === 'follow_ups') {
      // FUP-1: a follow-up closes with a choice. Already handled means handled offline, never raised again.
      const status = reason === 'Already handled' ? 'handled_offline' : 'closed'
      fail((await supabase!.from('follow_ups').update({ status }).eq('id', task.sourceId)).error)
      return
    }
    fail((await supabase!.from('task_overrides').upsert({ task_key: task.key, status: 'binned', notes: reason }, { onConflict: 'task_key' })).error)
  },

  async snoozeTask(task, until) {
    if (task.source === 'inbox_items') {
      fail((await supabase!.from('inbox_items').update({ status: 'snoozed', snoozed_until: until }).eq('id', task.sourceId)).error)
      return
    }
    if (task.source === 'follow_ups') {
      fail((await supabase!.from('follow_ups').update({ status: 'snoozed', snoozed_until: until }).eq('id', task.sourceId)).error)
      return
    }
    fail((await supabase!.from('task_overrides').upsert({ task_key: task.key, status: 'snoozed', snoozed_until: until }, { onConflict: 'task_key' })).error)
  },

  async reopenTask(task) {
    if (task.source === 'inbox_items') {
      fail((await supabase!.from('inbox_items').update({ status: 'new', bin_reason: null, snoozed_until: null, actioned_at: null }).eq('id', task.sourceId)).error)
      if (task.refTable === 'job_leads' && task.refId && task.kind === 'job_lead') {
        fail((await supabase!.from('job_leads').update({ stage: 'new' }).eq('id', task.refId)).error)
      }
      return
    }
    if (task.source === 'follow_ups') {
      fail((await supabase!.from('follow_ups').update({ status: 'open', snoozed_until: null }).eq('id', task.sourceId)).error)
      return
    }
    if (task.kind === 'cv_chase') fail((await supabase!.from('calls').update({ w_cv: false }).eq('id', task.sourceId)).error)
    if (task.kind === 'content_post') fail((await supabase!.from('content_items').update({ status: 'planned', posted_on: null }).eq('id', task.sourceId)).error)
    if (task.kind === 'content_approve') fail((await supabase!.from('content_items').update({ status: 'draft' }).eq('id', task.sourceId)).error)
    fail((await supabase!.from('task_overrides').upsert({ task_key: task.key, status: 'open', snoozed_until: null }, { onConflict: 'task_key' })).error)
  },

  async saveTaskEdits(task, edits) {
    const row: Record<string, unknown> = { task_key: task.key }
    if ('title' in edits) row.title = edits.title
    if ('notes' in edits) row.notes = edits.notes
    if ('dueOn' in edits) row.due_on = edits.dueOn
    if ('sortOrder' in edits) row.sort_order = edits.sortOrder
    fail((await supabase!.from('task_overrides').upsert(row, { onConflict: 'task_key' })).error)
  },

  async reorderTasks(keys) {
    const rows = keys.map((task_key, i) => ({ task_key, sort_order: i + 1 }))
    fail((await supabase!.from('task_overrides').upsert(rows, { onConflict: 'task_key' })).error)
  },

  async saveDraft(task, body, subject) {
    if (task.messageId) {
      fail((await supabase!.from('messages').update({ body, subject }).eq('id', task.messageId).eq('state', 'draft')).error)
      return
    }
    if (task.source === 'inbox_items') {
      fail((await supabase!.from('inbox_items').update({ draft: body }).eq('id', task.sourceId)).error)
    }
  },

  async sendTask(task) {
    if (!task.messageId) throw new Error('Nothing to send')
    const out = await live.sendAction(task.messageId, 'approve')
    if (out.state === 'cancelled' || out.state === 'held') throw new Error(out.note ?? `Held by the send engine`)
    return out.note ?? (out.state === 'queued' ? 'Queued to send' : out.state)
  },

  async createTaskDraft(task, subject, body) {
    const { data, error } = await supabase!
      .from('messages')
      .insert({
        type: 'email_reply',
        channel: 'email',
        person_id: task.source === 'inbox_items' || task.source === 'follow_ups' ? undefined : undefined,
        to_name: task.personName ?? task.title,
        subject,
        body,
        search_id: task.searchId,
        created_by: 'owner',
        level_at_creation: 'draft_only',
        state: 'draft',
      })
      .select('id')
      .single()
    fail(error)
    const id = (data as { id: string }).id
    if (task.source === 'follow_ups') fail((await supabase!.from('follow_ups').update({ message_id: id }).eq('id', task.sourceId)).error)
    return id
  },

  async taskChat(taskKey) {
    const [c, j] = await Promise.all([
      supabase!.from('task_chat').select('id, author, kind, body, created_at').eq('task_key', taskKey).order('created_at'),
      supabase!.from('task_jobs').select('id, kind, instruction, status, note, requested_at, finished_at').eq('task_key', taskKey).order('requested_at', { ascending: false }).limit(1),
    ])
    fail(c.error)
    fail(j.error)
    type CRow = { id: string; author: 'owner' | 'agent'; kind: TaskChatLine['kind']; body: string; created_at: string }
    type JRow = { id: string; kind: TaskJobKind; instruction: string | null; status: TaskJob['status']; note: string | null; requested_at: string; finished_at: string | null }
    const job = ((j.data ?? []) as JRow[])[0]
    return {
      lines: ((c.data ?? []) as CRow[]).map((r) => ({ id: r.id, author: r.author, kind: r.kind, body: r.body, at: r.created_at })),
      job: job ? { id: job.id, kind: job.kind, instruction: job.instruction, status: job.status, note: job.note, requestedAt: job.requested_at, finishedAt: job.finished_at } : null,
    }
  },

  async askTask(taskKey, kind, instruction) {
    const { data, error } = await supabase!.rpc('request_task_job', { p_task_key: taskKey, p_kind: kind, p_instruction: instruction ?? null })
    fail(error)
    return data as string
  },

  async openInOutlook(task) {
    if (!task.messageId) throw new Error('Nothing to open')
    const out = await live.sendAction(task.messageId, 'open_draft')
    if (!out.outlook_draft_url) throw new Error(out.note ?? 'Outlook is not connected yet. Copy the draft for now')
    return out.outlook_draft_url
  },

  async connections() {
    const { data, error } = await supabase!.from('connections').select('provider, status, account_label, connected_at, last_ok_at, last_error')
    fail(error)
    type Row = { provider: ConnectionProvider; status: ConnectionStatus; account_label: string | null; connected_at: string | null; last_ok_at: string | null; last_error: string | null }
    return ((data ?? []) as Row[]).map((r) => ({ provider: r.provider, status: r.status, accountLabel: r.account_label, connectedAt: r.connected_at, lastOkAt: r.last_ok_at, lastError: r.last_error }))
  },

  async outlookStartUrl() {
    const { data, error } = await supabase!.rpc('connection_oauth_begin', { p_provider: 'outlook' })
    fail(error)
    const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/+$/, '')
    return `${base}/functions/v1/outlook/start?state=${encodeURIComponent(String(data))}`
  },

  async saveConnectionKey(provider, key) {
    const r = await invokeFunction<{ status: ConnectionStatus; account_label: string | null; connected_at: string | null; last_ok_at: string | null }>('connections/key', { provider, key })
    return { provider, status: r.status, accountLabel: r.account_label, connectedAt: r.connected_at, lastOkAt: r.last_ok_at, lastError: null }
  },

  async disconnect(provider) {
    await invokeFunction('connections/disconnect', { provider })
  },

  async sendingPaused() {
    const { data, error } = await supabase!.from('app_settings').select('all_sending_paused').single()
    fail(error)
    return Boolean((data as { all_sending_paused: boolean }).all_sending_paused)
  },

  async setSendingPaused(paused) {
    const { error } = await supabase!.from('app_settings').update({ all_sending_paused: paused }).eq('id', true)
    fail(error)
  },

  async heldMessages() {
    const { count, error } = await supabase!.from('messages').select('id', { count: 'exact', head: true }).eq('state', 'held').eq('hold_reason', 'Sending is off')
    fail(error)
    return count ?? 0
  },

  async releaseHeld(to) {
    const { error } = await supabase!
      .from('messages')
      .update(to === 'send' ? { state: 'queued', hold_reason: null } : { state: 'draft', hold_reason: null })
      .eq('state', 'held')
      .eq('hold_reason', 'Sending is off')
    fail(error)
  },

  async sendPolicies() {
    const { data, error } = await supabase!
      .from('send_policies')
      .select('type, label, channel, level, max_level, daily_cap, weekly_cap, per_run_cap, min_days_between_same_person, send_window_start, send_window_end, requires_template, paused, paused_reason')
      .order('label')
    fail(error)
    type Row = {
      type: string
      label: string
      channel: 'email' | 'linkedin' | 'either'
      level: SendLevel
      max_level: SendLevel
      daily_cap: number | null
      weekly_cap: number | null
      per_run_cap: number | null
      min_days_between_same_person: number
      send_window_start: string
      send_window_end: string
      requires_template: boolean
      paused: boolean
      paused_reason: string | null
    }
    return ((data ?? []) as Row[]).map((r) => ({
      type: r.type,
      label: r.label,
      channel: r.channel,
      level: r.level,
      maxLevel: r.max_level,
      dailyCap: r.daily_cap,
      weeklyCap: r.weekly_cap,
      perRunCap: r.per_run_cap,
      minDaysBetweenSamePerson: r.min_days_between_same_person,
      windowStart: r.send_window_start.slice(0, 5),
      windowEnd: r.send_window_end.slice(0, 5),
      requiresTemplate: r.requires_template,
      paused: r.paused,
      pausedReason: r.paused_reason,
    }))
  },

  async updateSendPolicy(type, patch) {
    const change: Record<string, unknown> = {}
    if (patch.level !== undefined) change.level = patch.level
    if (patch.dailyCap !== undefined) change.daily_cap = patch.dailyCap
    if (patch.weeklyCap !== undefined) change.weekly_cap = patch.weeklyCap
    if (patch.perRunCap !== undefined) change.per_run_cap = patch.perRunCap
    if (patch.windowStart !== undefined) change.send_window_start = patch.windowStart
    if (patch.windowEnd !== undefined) change.send_window_end = patch.windowEnd
    if (patch.paused !== undefined) {
      change.paused = patch.paused
      if (!patch.paused) change.paused_reason = null
    }
    const { error } = await supabase!.from('send_policies').update(change).eq('type', type)
    fail(error)
  },

  async targets() {
    const { data, error } = await supabase!.from('targets').select('id, kpi, period, target, valid_from, valid_to').order('valid_from')
    fail(error)
    type Row = { id: string; kpi: string; period: 'week' | 'quarter' | 'year'; target: number; valid_from: string; valid_to: string | null }
    return ((data ?? []) as Row[]).map((r) => ({ id: r.id, kpi: r.kpi, period: r.period, target: Number(r.target), validFrom: r.valid_from, validTo: r.valid_to }))
  },

  async setTarget(kpi, period, target) {
    const { data, error } = await supabase!.rpc('set_target', { p_kpi: kpi, p_period: period, p_target: target })
    fail(error)
    return String(data)
  },

  async systemWeeks() {
    const { data, error } = await supabase!.from('system_week_view').select('week, runs, failed, items, sent, failed_detail')
    fail(error)
    type Row = { week: string; runs: number; failed: number; items: number; sent: number; failed_detail: string | null }
    return ((data ?? []) as Row[]).map((r) => ({ week: r.week, runs: Number(r.runs), failed: Number(r.failed), items: Number(r.items), sent: Number(r.sent), failedDetail: r.failed_detail }))
  },

  async kpiQuarter() {
    const { data, error } = await supabase!.from('kpi_quarter_view').select('kpi, position, total, target, hit, pmm_total, pmm_hit, has_manual').order('position')
    fail(error)
    type Row = { kpi: string; position: number; total: number; target: number | null; hit: boolean | null; pmm_total: number; pmm_hit: boolean | null; has_manual: boolean }
    return ((data ?? []) as Row[]).map((r) => ({
      kpi: r.kpi,
      position: r.position,
      target: r.target === null ? null : Number(r.target),
      total: Number(r.total),
      pmmTotal: Number(r.pmm_total),
      hit: r.hit,
      pmmHit: r.pmm_hit,
      hasManual: r.has_manual,
    }))
  },

  async followUpsQuarter() {
    const { data, error } = await supabase!.from('followups_quarter_view').select('quarter, completed, on_time')
    fail(error)
    const row = ((data ?? []) as { quarter: string; completed: number; on_time: number }[])[0]
    return row ? { week: null, completed: Number(row.completed), onTime: Number(row.on_time) } : { week: null, completed: 0, onTime: 0 }
  },

  async bdFunnel() {
    const { data, error } = await supabase!.from('bd_funnel_view').select('found, chased, replied, meetings, won')
    fail(error)
    const r = ((data ?? []) as Record<keyof BdFunnel, number>[])[0]
    return r
      ? { found: Number(r.found), chased: Number(r.chased), replied: Number(r.replied), meetings: Number(r.meetings), won: Number(r.won) }
      : { found: 0, chased: 0, replied: 0, meetings: 0, won: 0 }
  },

  async kpiWeeks() {
    const { data, error } = await supabase!.from('kpi_week_view').select('kpi, week, total, target, hit, pmm_total, pmm_hit, has_manual').order('week')
    fail(error)
    type Row = { kpi: string; week: string; total: number; target: number; hit: boolean; pmm_total: number; pmm_hit: boolean; has_manual: boolean }
    return ((data ?? []) as Row[]).map((r) => ({
      kpi: r.kpi,
      week: r.week,
      target: Number(r.target),
      total: Number(r.total),
      hit: r.hit,
      pmmTotal: Number(r.pmm_total),
      pmmHit: r.pmm_hit,
      hasManual: r.has_manual,
    }))
  },

  async kpiOutputWeeks() {
    const { data, error } = await supabase!.from('kpi_output_week_view').select('kpi, week, total, pmm_total')
    fail(error)
    type Row = { kpi: string; week: string; total: number; pmm_total: number }
    return ((data ?? []) as Row[]).map((r) => ({ kpi: r.kpi, week: r.week, total: Number(r.total), pmmTotal: Number(r.pmm_total) }))
  },

  async followUpsWeeks() {
    const { data, error } = await supabase!.from('followups_week_view').select('week, completed, on_time')
    fail(error)
    type Row = { week: string; completed: number; on_time: number }
    return ((data ?? []) as Row[]).map((r) => ({ week: r.week, completed: Number(r.completed), onTime: Number(r.on_time) }))
  },

  async weeklyReview(week) {
    const { data, error } = await supabase!
      .from('weekly_reviews')
      .select('week, learned, changes, plan, quarterly_focus, followup_block_minutes, held_on')
      .eq('week', week)
      .maybeSingle()
    fail(error)
    if (!data) return null
    const r = data as { week: string; learned: string | null; changes: string | null; plan: string | null; quarterly_focus: string | null; followup_block_minutes: number | null; held_on: string | null }
    return {
      week: r.week,
      learned: r.learned ?? '',
      changes: r.changes ?? '',
      plan: r.plan ?? '',
      quarterlyFocus: r.quarterly_focus ?? '',
      followupBlockMinutes: r.followup_block_minutes,
      heldOn: r.held_on,
    }
  },

  async saveWeeklyReview(week, fields) {
    const blank = (t: string) => (t.trim() ? t : null)
    const { error } = await supabase!
      .from('weekly_reviews')
      .upsert(
        { week, learned: blank(fields.learned), changes: blank(fields.changes), plan: blank(fields.plan), quarterly_focus: blank(fields.quarterlyFocus) },
        { onConflict: 'owner_id,week' },
      )
    fail(error)
  },

  async capture(kind, values) {
    const v = (k: string) => (values[k] ?? '').trim()
    const today = ukClock(new Date()).date
    if (kind === 'referral') {
      const { error } = await supabase!.from('referrals').insert({
        referred_name: v('referredName'), referred_company: v('referredCompany') || null, referred_by_name: v('referredBy'), kind: 'person',
        dedup_key: `manual:referral:${v('referredName').toLowerCase()}:${v('referredBy').toLowerCase()}:${today}`,
      })
      fail(error)
      return { route: '/leads/referrals' }
    }
    if (kind === 'follow_up') {
      const { error } = await supabase!.from('follow_ups').insert({
        person_name: v('personName'), reason: v('reason'), kind: 'other', source: 'manual', direction: 'owed', due_on: v('dueOn'),
        dedup_key: `manual:follow_up:${v('personName').toLowerCase()}:${today}:${Date.now()}`,
      })
      fail(error)
      return { route: '/leads/follow-ups?view=list' }
    }
    if (kind === 'idea') {
      const { error } = await supabase!.from('inbox_items').insert({
        type: 'event_idea', agent: 'owner', title: v('title'), why: v('why') || null, source: 'quick capture', rank: 10,
        dedup_key: `event_idea:manual:${v('title').toLowerCase()}:${today}`,
      })
      fail(error)
      return { route: '/inbox?view=list' }
    }
    if (kind === 'job_lead') {
      const { data: ck, error: e1 } = await supabase!.rpc('norm_company', { p: v('company') })
      fail(e1)
      const { data: rk, error: e2 } = await supabase!.rpc('norm_role', { p: v('role') })
      fail(e2)
      const { error } = await supabase!.from('job_leads').insert({
        company: v('company'), company_key: ck ?? v('company').toLowerCase(), role: v('role'), role_key: rk ?? v('role').toLowerCase(),
        sources: ['manual'], source_urls: v('sourceUrl') ? [v('sourceUrl')] : [],
      })
      fail(error)
      return { route: '/leads/jobs' }
    }
    await this.correctKpi(v('kpi'), Number(v('amount')), v('reason'))
    return { route: '/numbers/this-week' }
  },

  async search(query) {
    const q = `%${query.trim()}%`
    const hits: SearchHit[] = []
    const [people, leads, refs, fus, lists, members] = await Promise.all([
      supabase!.from('people').select('id, display_name, display_title, display_company').ilike('display_name', q).limit(3),
      supabase!.from('job_leads').select('id, company, role').or(`company.ilike.${q},role.ilike.${q}`).limit(3),
      supabase!.from('referrals').select('id, referred_name, referred_company').ilike('referred_name', q).limit(3),
      supabase!.from('follow_ups').select('id, person_name, reason').ilike('person_name', q).eq('status', 'open').limit(3),
      supabase!.from('lists').select('id, key'),
      supabase!.from('people').select('id, league_members!person_id (list_id)').ilike('display_name', q).limit(3),
    ])
    for (const r of [people, leads, refs, fus, lists, members]) fail(r.error)
    const listKey = new Map(((lists.data ?? []) as { id: string; key: string }[]).map((l) => [l.id, l.key]))
    const listOf = new Map(((members.data ?? []) as unknown as { id: string; league_members: { list_id: string }[] }[]).map((p) => [p.id, p.league_members?.[0]?.list_id]))
    for (const p of (people.data ?? []) as { id: string; display_name: string; display_title: string | null; display_company: string | null }[]) {
      const key = listKey.get(listOf.get(p.id) ?? '')
      hits.push({ kind: 'person', id: p.id, title: p.display_name, detail: [p.display_title, p.display_company].filter(Boolean).join(', ') || null, route: key ? `/people/${key.replace(/_/g, '-')}?card=person:${p.id}` : '/settings/data' })
    }
    for (const l of (leads.data ?? []) as { id: string; company: string; role: string }[]) hits.push({ kind: 'job_lead', id: l.id, title: `${l.role} at ${l.company}`, detail: null, route: `/leads/jobs?card=job:${l.id}` })
    for (const r of (refs.data ?? []) as { id: string; referred_name: string; referred_company: string | null }[]) hits.push({ kind: 'referral', id: r.id, title: r.referred_name, detail: r.referred_company, route: `/leads/referrals?card=referral:${r.id}` })
    for (const f of (fus.data ?? []) as { id: string; person_name: string; reason: string }[]) hits.push({ kind: 'follow_up', id: f.id, title: f.person_name, detail: f.reason, route: `/leads/follow-ups?view=list&card=followup:${f.id}` })
    return hits
  },

  async kpiThisWeek() {
    const { data, error } = await supabase!.from('kpi_this_week').select('kpi, total, target, hit, pmm_total, pmm_hit, has_manual')
    fail(error)
    type Row = { kpi: string; total: number; target: number; hit: boolean; pmm_total: number; pmm_hit: boolean; has_manual: boolean }
    return ((data ?? []) as Row[]).map((r) => ({
      kpi: r.kpi,
      target: Number(r.target),
      total: Number(r.total),
      hit: r.hit,
      pmmTotal: Number(r.pmm_total),
      pmmHit: r.pmm_hit,
      hasManual: r.has_manual,
    }))
  },

  async kpiStreaks() {
    const { data, error } = await supabase!.from('kpi_streak_view').select('kpi, weeks_history, first_week, hit_last_4, pmm_hit_last_4, best_12, pmm_best_12')
    fail(error)
    type Row = { kpi: string; weeks_history: number; first_week: string | null; hit_last_4: number; pmm_hit_last_4: number; best_12: number | null; pmm_best_12: number | null }
    return ((data ?? []) as Row[]).map((r) => ({
      kpi: r.kpi,
      weeksHistory: r.weeks_history,
      firstWeek: r.first_week,
      hitLast4: r.hit_last_4,
      pmmHitLast4: r.pmm_hit_last_4,
      best12: Number(r.best_12 ?? 0),
      pmmBest12: Number(r.pmm_best_12 ?? 0),
    }))
  },

  async kpiEvents(kpi) {
    const { data, error } = await supabase!
      .from('kpi_events')
      .select('id, label, amount, manual, reason, is_pmm, happened_at')
      .eq('kpi', kpi)
      .eq('week', mondayOf(new Date()))
      .order('happened_at', { ascending: false })
    fail(error)
    type Row = { id: string; label: string | null; amount: number; manual: boolean; reason: string | null; is_pmm: boolean; happened_at: string }
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      label: r.label,
      amount: Number(r.amount),
      manual: r.manual,
      reason: r.reason,
      isPmm: r.is_pmm,
      happenedAt: r.happened_at,
    }))
  },

  async correctKpi(kpi, amount, reason) {
    const { error } = await supabase!.from('kpi_events').insert({ kpi, amount, manual: true, reason: reason.trim(), label: 'Correction' })
    fail(error)
  },

  async problems() {
    const { data, error } = await supabase!.from('problem_reports').select('*').order('created_at', { ascending: false })
    fail(error)
    return ((data ?? []) as ProblemRow[]).map(problemFrom)
  },

  async reportProblem(input) {
    const { data, error } = await supabase!
      .from('problem_reports')
      .insert({ title: input.title, description: input.description, severity: input.severity, reporter_name: input.reporterName, route: input.route, user_agent: input.userAgent, viewport: input.viewport, app_version: input.appVersion })
      .select('*')
      .single()
    fail(error)
    return problemFrom(data as ProblemRow)
  },

  async updateProblem(id, patch) {
    const row: Record<string, unknown> = {}
    if (patch.status !== undefined) row.status = patch.status
    if (patch.severity !== undefined) row.severity = patch.severity
    if (patch.assignee !== undefined) row.assignee = patch.assignee
    if (patch.resolution !== undefined) row.resolution = patch.resolution
    if (patch.title !== undefined) row.title = patch.title
    const { error } = await supabase!.from('problem_reports').update(row).eq('id', id)
    fail(error)
  },

  async problemNotes(id) {
    const { data, error } = await supabase!.from('problem_notes').select('id, report_id, author, body, created_at').eq('report_id', id).order('created_at')
    fail(error)
    return ((data ?? []) as { id: string; report_id: string; author: string | null; body: string; created_at: string }[]).map((n) => ({ id: n.id, reportId: n.report_id, author: n.author, body: n.body, createdAt: n.created_at }))
  },

  async addProblemNote(id, body, author) {
    const { data, error } = await supabase!.from('problem_notes').insert({ report_id: id, author, body }).select('id, report_id, author, body, created_at').single()
    fail(error)
    const n = data as { id: string; report_id: string; author: string | null; body: string; created_at: string }
    return { id: n.id, reportId: n.report_id, author: n.author, body: n.body, createdAt: n.created_at }
  },

  async problemScreenshots(id) {
    const { data, error } = await supabase!.from('problem_screenshots').select('id, report_id, data, created_at').eq('report_id', id).order('created_at')
    fail(error)
    return ((data ?? []) as { id: string; report_id: string; data: string; created_at: string }[]).map((s) => ({ id: s.id, reportId: s.report_id, data: s.data, createdAt: s.created_at }))
  },

  async addProblemScreenshot(id, dataUrl) {
    const { data, error } = await supabase!.from('problem_screenshots').insert({ report_id: id, data: dataUrl }).select('id, report_id, data, created_at').single()
    fail(error)
    const s = data as { id: string; report_id: string; data: string; created_at: string }
    return { id: s.id, reportId: s.report_id, data: s.data, createdAt: s.created_at }
  },

  async searches() {
    const { data, error } = await supabase!.from('searches').select('*').order('opened_on', { ascending: false })
    fail(error)
    return ((data ?? []) as SearchRow[]).map(searchFrom)
  },

  async addSearch(input) {
    const key = input.client.trim().toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    const { data, error } = await supabase!
      .from('searches')
      .insert({ client: input.client.trim(), client_key: key, role: input.role.trim(), function: input.function, crm_url: input.crmUrl, priority: input.priority, confidential: input.confidential ?? false, won_from_job_lead: input.wonFromJobLead ?? null, status: 'intake' })
      .select('*')
      .single()
    fail(error)
    return searchFrom(data as SearchRow)
  },

  async updateSearch(id, patch) {
    const row: Record<string, unknown> = {}
    const map: Record<string, string> = { priority: 'priority', status: 'status', waitingOn: 'waiting_on', nextStep: 'next_step', nextStepOn: 'next_step_on', health: 'health', healthReason: 'health_reason', nSourced: 'n_sourced', nSpoken: 'n_spoken', nSubmitted: 'n_submitted', nFirstStage: 'n_first_stage', nLaterStage: 'n_later_stage', nOffer: 'n_offer', confidential: 'confidential', crmUrl: 'crm_url', level: 'level', location: 'location', feeEstimate: 'fee_estimate', lastClientContactOn: 'last_client_contact_on' }
    for (const [k, v] of Object.entries(patch)) if (v !== undefined && map[k]) row[map[k]] = v
    const { error } = await supabase!.from('searches').update(row).eq('id', id)
    fail(error)
  },

  async searchCandidates() {
    const { data, error } = await supabase!.from('search_candidates').select('*, person:people!person_id (display_name, display_title, display_company, crm_url, linkedin_url)').order('stage_changed_on', { ascending: false })
    fail(error)
    return ((data ?? []) as unknown as CandidateRow[]).map(candidateFrom)
  },

  async addCandidate(searchId, personId) {
    const { error } = await supabase!.from('search_candidates').insert({ search_id: searchId, person_id: personId, stage: 'sourced' })
    fail(error)
  },

  async updateCandidate(id, patch) {
    const row: Record<string, unknown> = {}
    const map: Record<string, string> = { stage: 'stage', consentToSubmit: 'consent_to_submit', feedbackReceivedOn: 'feedback_received_on', feedbackNudges: 'feedback_nudges', nextInterviewAt: 'next_interview_at', prepSent: 'prep_sent', lastCandidateContactOn: 'last_candidate_contact_on', outcomeReason: 'outcome_reason', offerStatus: 'offer_status', decisionDueOn: 'decision_due_on', startOn: 'start_on', referencesTaken: 'references_taken', referencesNeeded: 'references_needed', competingProcess: 'competing_process', risks: 'risks', wouldSwing: 'would_swing' }
    for (const [k, v] of Object.entries(patch)) if (v !== undefined && map[k]) row[map[k]] = v
    const { error } = await supabase!.from('search_candidates').update(row).eq('id', id)
    fail(error)
  },

  async searchNotes(searchId) {
    const { data, error } = await supabase!.from('search_notes').select('id, search_id, tab, title, content, structured, version, updated_at').eq('search_id', searchId).order('version', { ascending: false })
    fail(error)
    type Row = { id: string; search_id: string; tab: SearchNoteTab; title: string | null; content: string; structured: Record<string, unknown> | null; version: number; updated_at: string }
    return ((data ?? []) as Row[]).map((n) => ({ id: n.id, searchId: n.search_id, tab: n.tab, title: n.title, content: n.content, structured: n.structured, version: n.version, updatedAt: n.updated_at }))
  },

  async saveSearchNote(searchId, tab, content, structured) {
    // The owner's edits overwrite the current version (11.2).
    const { data, error } = await supabase!.from('search_notes').select('id').eq('search_id', searchId).eq('tab', tab).order('version', { ascending: false }).limit(1)
    fail(error)
    const current = (data ?? [])[0] as { id: string } | undefined
    if (current) {
      const { error: e2 } = await supabase!.from('search_notes').update({ content, structured }).eq('id', current.id)
      fail(e2)
    } else {
      const { error: e3 } = await supabase!.from('search_notes').insert({ search_id: searchId, tab, content, structured })
      fail(e3)
    }
  },

  async calls() {
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString()
    const { data, error } = await supabase!.from('calls').select('*, person:people!person_id (display_name, crm_url)').gte('held_at', since).order('held_at', { ascending: false })
    fail(error)
    type Row = { id: string; granola_url: string | null; title: string | null; held_at: string; minutes: number | null; call_type: string; person_id: string | null; search_id: string | null; match_confidence: Call['matchConfidence']; w_record: boolean; w_cv: boolean; w_note: boolean; w_on_search: boolean; w_follow_up: boolean; cv_requested: boolean; is_new_a_star: boolean; skip_reason: string | null; person: { display_name: string; crm_url: string | null } | null }
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id, granolaUrl: r.granola_url, title: r.title, heldAt: r.held_at, minutes: r.minutes, callType: r.call_type, personId: r.person_id, personName: r.person?.display_name ?? null, crmUrl: r.person?.crm_url ?? null,
      searchId: r.search_id, matchConfidence: r.match_confidence, wRecord: r.w_record, wCv: r.w_cv, wNote: r.w_note, wOnSearch: r.w_on_search, wFollowUp: r.w_follow_up, cvRequested: r.cv_requested, isNewAStar: r.is_new_a_star, skipReason: r.skip_reason,
      summary: (r as unknown as { summary?: string | null }).summary ?? null,
    }))
  },

  async updateCall(id, patch) {
    const row: Record<string, unknown> = {}
    const map: Record<string, string> = { searchId: 'search_id', matchConfidence: 'match_confidence', wRecord: 'w_record', wCv: 'w_cv', wNote: 'w_note', wOnSearch: 'w_on_search', wFollowUp: 'w_follow_up', cvRequested: 'cv_requested', skipReason: 'skip_reason' }
    for (const [k, v] of Object.entries(patch)) if (v !== undefined && map[k]) row[map[k]] = v
    const { error } = await supabase!.from('calls').update(row).eq('id', id)
    fail(error)
  },

  async aStarSuggestions() {
    const { data, error } = await supabase!.from('a_star_suggestions').select('id, name, title, company, city, linkedin_url, why, week, verdict').eq('verdict', 'pending').order('week', { ascending: false })
    fail(error)
    type Row = { id: string; name: string; title: string | null; company: string | null; city: string | null; linkedin_url: string | null; why: string | null; week: string; verdict: AStarSuggestion['verdict'] }
    return ((data ?? []) as Row[]).map((r) => ({ id: r.id, name: r.name, title: r.title, company: r.company, city: r.city, linkedinUrl: r.linkedin_url, why: r.why, week: r.week, verdict: r.verdict }))
  },

  async aStarVerdict(id, verdict) {
    const { error } = await supabase!.rpc('a_star_verdict', { p_id: id, p_verdict: verdict })
    fail(error)
  },

  async warmSpecs() {
    const { data, error } = await supabase!.from('people').select('id, display_name, display_title, display_company, crm_url, linkedin_url').eq('warm_spec', true).order('display_name')
    fail(error)
    type Row = { id: string; display_name: string; display_title: string | null; display_company: string | null; crm_url: string | null; linkedin_url: string | null }
    const leads = await this.jobLeads()
    return ((data ?? []) as Row[]).map((p) => ({
      personId: p.id, name: p.display_name, title: p.display_title, company: p.display_company, crmUrl: p.crm_url, profileUrl: p.linkedin_url,
      matches: leads.filter((l) => l.stage !== 'dead' && l.stage !== 'passed' && l.matched.some((m) => m.personId === p.id || m.name === p.display_name)).map((l) => ({ leadId: l.id, company: l.company, role: l.role })),
    }))
  },

  async setWarmSpec(personId, on) {
    const { error } = await supabase!.from('people').update({ warm_spec: on }).eq('id', personId)
    fail(error)
  },

  async spokenTo() {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
    const { data, error } = await supabase!
      .from('calls')
      .select('id, held_at, call_type, granola_url, summary, search_id, is_new_a_star, person:people!person_id (id, display_name, display_title, display_company, city, crm_url, linkedin_url, warm_spec)')
      .gte('held_at', since)
      .not('person_id', 'is', null)
      .in('call_type', ['candidate_screen', 'coaching', 'interview_prep', 'debrief', 'reference', 'other', 'unknown'])
      .order('held_at', { ascending: false })
    fail(error)
    type Row = { id: string; held_at: string; call_type: string; granola_url: string | null; summary: string | null; search_id: string | null; is_new_a_star: boolean; person: { id: string; display_name: string; display_title: string | null; display_company: string | null; city: string | null; crm_url: string | null; linkedin_url: string | null; warm_spec: boolean } | null }
    const out = new Map<string, SpokenPerson>()
    for (const r of (data ?? []) as unknown as Row[]) {
      if (!r.person) continue
      const p = r.person
      const held = out.get(p.id) ?? { personId: p.id, name: p.display_name, title: p.display_title, company: p.display_company, city: p.city, crmUrl: p.crm_url, profileUrl: p.linkedin_url, good: p.warm_spec, suggested: false, lastCallOn: r.held_at.slice(0, 10), calls: [] }
      held.suggested = held.suggested || r.is_new_a_star
      held.calls.push({ id: r.id, heldAt: r.held_at, callType: r.call_type, granolaUrl: r.granola_url, summary: r.summary, searchId: r.search_id })
      out.set(p.id, held)
    }
    return [...out.values()]
  },

  async specRequests() {
    const { data, error } = await supabase!.from('spec_requests').select('id, person_id, linkedin_url, cv_where, status, note, result, requested_at, finished_at').order('requested_at', { ascending: false })
    fail(error)
    type Row = { id: string; person_id: string; linkedin_url: string | null; cv_where: SpecRequest['cvWhere']; status: SpecRequest['status']; note: string | null; result: SpecRequest['result']; requested_at: string; finished_at: string | null }
    const seen = new Set<string>()
    const out: SpecRequest[] = []
    for (const r of (data ?? []) as Row[]) {
      if (seen.has(r.person_id)) continue
      seen.add(r.person_id)
      out.push({ id: r.id, personId: r.person_id, linkedinUrl: r.linkedin_url, cvWhere: r.cv_where, status: r.status, note: r.note, result: r.result, requestedAt: r.requested_at, finishedAt: r.finished_at })
    }
    return out
  },

  async requestSpec(personId, ask) {
    const { error } = await supabase!.rpc('request_spec', { p_person: personId, p_linkedin_url: ask.linkedinUrl ?? null, p_cv_where: ask.cvWhere, p_cv_text: ask.cvText ?? null })
    fail(error)
  },

  async campaigns() {
    const { data, error } = await supabase!.from('campaigns').select('id, name, tool, job_lead_id, candidate_person_id, steps, contacted, replies, calls_booked, status, started_on, ended_on, created_at').order('created_at', { ascending: false })
    fail(error)
    type Row = { id: string; name: string; tool: string | null; job_lead_id: string | null; candidate_person_id: string | null; steps: CampaignStep[] | null; contacted: number; replies: number; calls_booked: number; status: Campaign['status']; started_on: string | null; ended_on: string | null; created_at: string }
    return ((data ?? []) as Row[]).map((r) => ({ id: r.id, name: r.name, tool: r.tool ?? 'other', jobLeadId: r.job_lead_id, candidatePersonId: r.candidate_person_id, steps: r.steps ?? [], contacted: r.contacted, replies: r.replies, callsBooked: r.calls_booked, status: r.status, startedOn: r.started_on, endedOn: r.ended_on, createdAt: r.created_at }))
  },

  async addCampaign(input) {
    const { error } = await supabase!.from('campaigns').insert({ name: input.name, tool: input.tool, job_lead_id: input.jobLeadId, candidate_person_id: input.candidatePersonId, steps: input.steps ?? [] })
    fail(error)
  },

  async updateCampaign(id, patch) {
    const row: Record<string, unknown> = {}
    const map: Record<string, string> = { name: 'name', tool: 'tool', contacted: 'contacted', replies: 'replies', callsBooked: 'calls_booked', status: 'status', steps: 'steps', startedOn: 'started_on', endedOn: 'ended_on', jobLeadId: 'job_lead_id', candidatePersonId: 'candidate_person_id' }
    for (const [k, v] of Object.entries(patch)) if (v !== undefined && map[k]) row[map[k]] = v
    const { error } = await supabase!.from('campaigns').update(row).eq('id', id)
    fail(error)
  },

  async templates() {
    const { data, error } = await supabase!
      .from('templates')
      .select('id, type, name, channel, subject, body, variables, version, approved, approved_at, active, updated_at')
      .order('type')
      .order('name')
      .order('version', { ascending: false })
    fail(error)
    type Row = { id: string; type: string; name: string; channel: 'email' | 'linkedin'; subject: string | null; body: string; variables: string[]; version: number; approved: boolean; approved_at: string | null; active: boolean; updated_at: string }
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id, type: r.type, name: r.name, channel: r.channel, subject: r.subject, body: r.body, variables: r.variables ?? [],
      version: r.version, approved: r.approved, approvedAt: r.approved_at, active: r.active, updatedAt: r.updated_at,
    }))
  },

  async addTemplate(input) {
    const { error } = await supabase!.from('templates').insert({ type: input.type, name: input.name, channel: input.channel, subject: input.subject, body: input.body })
    fail(error)
  },

  async saveTemplate(id, patch) {
    const { error } = await supabase!.from('templates').update({ subject: patch.subject, body: patch.body }).eq('id', id)
    fail(error)
  },

  async approveTemplate(id) {
    const { data, error } = await supabase!.rpc('template_approve', { p_id: id })
    fail(error)
    return Number(data ?? 0)
  },

  async seedContentIdeas() {
    const { data, error } = await supabase!.rpc('content_ideas_seed')
    fail(error)
    return Number(data ?? 0)
  },

  async seedTemplates() {
    const { data, error } = await supabase!.rpc('templates_seed')
    fail(error)
    return Number(data ?? 0)
  },

  async sendLog(limit = 30) {
    const { data, error } = await supabase!
      .from('send_log')
      .select('id, message_id, type, channel, to_name, level, outcome, detail, logged_at')
      .order('logged_at', { ascending: false })
      .limit(limit)
    fail(error)
    type Row = { id: string; message_id: string; type: string; channel: 'email' | 'linkedin'; to_name: string; level: SendLevel; outcome: SendLogRow['outcome']; detail: string | null; logged_at: string }
    return ((data ?? []) as Row[]).map((r) => ({ id: r.id, messageId: r.message_id, type: r.type, channel: r.channel, toName: r.to_name, level: r.level, outcome: r.outcome, detail: r.detail, loggedAt: r.logged_at }))
  },

  async sendTest(type) {
    const { data, error } = await supabase!.rpc('send_test', { p_type: type })
    fail(error)
    return data as SendActionResult
  },

  async sendAction(messageId, action) {
    const { data, error } = await supabase!.functions.invoke('send', { body: { message_id: messageId, action } })
    if (error) {
      // The function answers in the owner's words (API-6); read them when it can.
      let message = error.message
      try {
        const ctx = (error as { context?: Response }).context
        if (ctx) {
          const body = (await ctx.json()) as { error?: { message?: string } }
          if (body?.error?.message) message = body.error.message
        }
      } catch {
        // keep the client's message
      }
      throw new Error(message)
    }
    return data as SendActionResult
  },

  async contentItems() {
    const { data, error } = await supabase!
      .from('content_items')
      .select('id, kind, run_source, angle, topic, hook, body, close_line, hashtags, data_point, data_point_url, prompted_by, format_ok, format_reason, rank, status, held_reason, planned_for, posted_on, post_url, impressions, comments, inbound_messages, event_type, event_time, search_id, requested_on, received_on, used_where, created_at')
      .neq('status', 'binned')
      .order('rank', { ascending: false })
      .order('created_at', { ascending: false })
    fail(error)
    type Row = {
      id: string
      kind: ContentKind
      run_source: ContentSource | null
      angle: ContentItem['angle']
      topic: string
      hook: string | null
      body: string | null
      close_line: string | null
      hashtags: string[] | null
      data_point: string | null
      data_point_url: string | null
      prompted_by: string | null
      format_ok: boolean
      format_reason: string | null
      rank: number | string
      status: ContentStatus
      held_reason: string | null
      planned_for: string | null
      posted_on: string | null
      post_url: string | null
      impressions: number | null
      comments: number | null
      inbound_messages: number | null
      event_type: EventType | null
      event_time: string | null
      search_id: string | null
      requested_on: string | null
      received_on: string | null
      used_where: string | null
      created_at: string
    }
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      kind: r.kind,
      runSource: r.run_source,
      angle: r.angle,
      topic: r.topic,
      hook: r.hook,
      body: r.body,
      closeLine: r.close_line,
      hashtags: r.hashtags ?? [],
      dataPoint: r.data_point,
      dataPointUrl: r.data_point_url,
      promptedBy: r.prompted_by,
      formatOk: r.format_ok,
      formatReason: r.format_reason,
      rank: Number(r.rank),
      status: r.status,
      heldReason: r.held_reason,
      plannedFor: r.planned_for,
      postedOn: r.posted_on,
      postUrl: r.post_url,
      impressions: r.impressions,
      comments: r.comments,
      inboundMessages: r.inbound_messages,
      eventType: r.event_type,
      eventTime: r.event_time,
      searchId: r.search_id,
      requestedOn: r.requested_on,
      receivedOn: r.received_on,
      usedWhere: r.used_where,
      createdAt: r.created_at,
    }))
  },

  async addContent(input) {
    const { copy, plannedFor, status } = input
    const parts = input.kind !== 'linkedin_post' ? { hook: input.kind === 'testimonial' ? copy || null : null, body: input.kind === 'event' ? copy || null : null, closeLine: null } : splitCopy(copy)
    const topic = input.kind !== 'linkedin_post' ? input.topic : topicFrom(copy)
    const { data, error } = await supabase!
      .from('content_items')
      .insert({
        kind: input.kind, run_source: 'manual', topic, topic_key: topicKey(topic) || 'a post', hook: parts.hook, body: parts.body, close_line: parts.closeLine,
        draft_original: copy || null, word_count: copy.trim() ? copy.trim().split(/\s+/).length : null, format_ok: true, status, planned_for: plannedFor, posted_on: status === 'posted' ? plannedFor : null,
        event_type: input.kind === 'event' ? input.eventType : null, event_time: input.kind === 'event' ? input.eventTime : null,
      })
      .select('id')
      .single()
    fail(error)
    const id = (data as { id: string }).id
    const made = (await this.contentItems()).find((c) => c.id === id)
    if (!made) throw new Error('The post did not come back')
    return made
  },

  async updateContent(id, patch) {
    const row: Record<string, unknown> = {}
    if (patch.status !== undefined) row.status = patch.status
    if (patch.hook !== undefined) row.hook = patch.hook
    if (patch.body !== undefined) row.body = patch.body
    if (patch.closeLine !== undefined) row.close_line = patch.closeLine
    if (patch.heldReason !== undefined) row.held_reason = patch.heldReason
    if (patch.plannedFor !== undefined) row.planned_for = patch.plannedFor
    if (patch.postedOn !== undefined) row.posted_on = patch.postedOn
    if (patch.postUrl !== undefined) row.post_url = patch.postUrl
    if (patch.impressions !== undefined) row.impressions = patch.impressions
    if (patch.comments !== undefined) row.comments = patch.comments
    if (patch.inboundMessages !== undefined) row.inbound_messages = patch.inboundMessages
    if (patch.topic !== undefined) row.topic = patch.topic
    if (patch.eventType !== undefined) row.event_type = patch.eventType
    if (patch.eventTime !== undefined) row.event_time = patch.eventTime
    if (patch.requestedOn !== undefined) row.requested_on = patch.requestedOn
    if (patch.receivedOn !== undefined) row.received_on = patch.receivedOn
    if (patch.usedWhere !== undefined) row.used_where = patch.usedWhere
    const { error } = await supabase!.from('content_items').update(row).eq('id', id)
    fail(error)
  },

  async signals() {
    const { data, error } = await supabase!
      .from('signals')
      .select('id, person_id, person_name, company, title, city, signal_type, strength, detail, source, source_url, seen_on, status, uk_to_us')
      .eq('status', 'new')
      .order('strength', { ascending: false })
      .order('seen_on', { ascending: false })
    fail(error)
    type Row = {
      id: string
      person_id: string | null
      person_name: string | null
      company: string | null
      title: string | null
      city: string | null
      signal_type: string
      strength: number
      detail: string | null
      source: string
      source_url: string | null
      seen_on: string
      status: SignalStatus
    }
    const rows = (data ?? []) as Row[]
    const personIds = rows.map((r) => r.person_id).filter((id): id is string => id !== null)
    let onList = new Set<string>()
    if (personIds.length > 0) {
      const { data: members, error: e2 } = await supabase!.from('league_members').select('person_id').in('person_id', personIds).eq('active', true)
      fail(e2)
      onList = new Set(((members ?? []) as { person_id: string }[]).map((m) => m.person_id))
    }
    return rows.map((r) => ({
      id: r.id,
      personId: r.person_id,
      personName: r.person_name,
      company: r.company,
      title: r.title,
      city: r.city,
      signalType: r.signal_type,
      strength: r.strength,
      detail: r.detail,
      source: r.source,
      sourceUrl: r.source_url,
      ukToUs: (r as { uk_to_us?: boolean }).uk_to_us ?? false,
      seenOn: r.seen_on,
      status: r.status,
      onList: r.person_id !== null && onList.has(r.person_id),
    }))
  },

  async setSignalStatus(id, status) {
    const { error } = await supabase!.from('signals').update({ status }).eq('id', id)
    fail(error)
  },

  async addSignalToList(signal, listId) {
    const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
    let personId = signal.personId
    if (!personId) {
      const name = signal.personName ?? 'Unknown'
      const { data, error } = await supabase!
        .from('people')
        .insert({ display_name: name, name_key: key(name), display_title: signal.title, display_company: signal.company, company_key: signal.company ? key(signal.company) : null, city: signal.city, kind: 'leader' })
        .select('id')
        .single()
      fail(error)
      personId = (data as { id: string }).id
      const { error: e1 } = await supabase!.from('signals').update({ person_id: personId }).eq('id', signal.id)
      fail(e1)
    }
    const { error: e2 } = await supabase!
      .from('league_members')
      .insert({ person_id: personId, list_id: listId, tier: 'league_one', why: `Signal: ${signal.signalType.replace('_', ' ')}`, added_from: 'signal' })
    fail(e2)
    const { error: e3 } = await supabase!.from('signals').update({ status: 'added_to_league' }).eq('id', signal.id)
    fail(e3)
  },
}

const INBOX_COLUMNS =
  'id, type, agent, title, person_id, company, role, location, why, suggested_action, draft, draft_original, ' +
  'source, source_url, links, ref_table, ref_id, rank, status, bin_reason, snoozed_until, due_on, created_at'

type InboxRow = {
  id: string
  type: InboxType
  agent: string
  title: string
  person_id: string | null
  company: string | null
  role: string | null
  location: string | null
  why: string | null
  suggested_action: string | null
  draft: string | null
  draft_original: string | null
  source: string | null
  source_url: string | null
  links: { label?: string; url?: string }[] | null
  ref_table: string | null
  ref_id: string | null
  rank: number | string
  status: InboxStatus
  bin_reason: string | null
  snoozed_until: string | null
  due_on: string | null
  created_at: string
}

function toInboxItem(r: InboxRow): InboxItem {
  return {
    id: r.id,
    type: r.type,
    agent: r.agent,
    title: r.title,
    personId: r.person_id,
    company: r.company,
    role: r.role,
    location: r.location,
    why: r.why,
    suggestedAction: r.suggested_action,
    draft: r.draft,
    draftOriginal: r.draft_original,
    source: r.source,
    sourceUrl: r.source_url,
    links: (Array.isArray(r.links) ? r.links : [])
      .filter((l) => typeof l.label === 'string' && typeof l.url === 'string')
      .map((l) => ({ label: l.label!, url: l.url! })),
    refTable: r.ref_table,
    refId: r.ref_id,
    rank: Number(r.rank),
    status: r.status,
    binReason: r.bin_reason,
    snoozedUntil: r.snoozed_until,
    dueOn: r.due_on,
    createdAt: r.created_at,
  }
}

/** The item status each action leaves (7.4): done, approved, binned, snoozed. */
export function inboxStatusAfter(action: InboxAction): InboxStatus {
  switch (action) {
    case 'approve':
      return 'approved'
    case 'bin':
      return 'binned'
    case 'snooze':
      return 'snoozed'
    default:
      return 'done'
  }
}

type SearchRow = {
  id: string; client: string; role: string; function: string; level: string | null; location: string | null; city: string | null; country: string; confidential: boolean; crm_url: string | null; crm_job_ref: string | null
  priority: SearchPriority; status: SearchStatus; opened_on: string; first_submission_on: string | null; placed_on: string | null; last_client_contact_on: string | null; waiting_on: Search['waitingOn']; next_step: string | null; next_step_on: string | null
  health: SearchHealth; health_reason: string | null; n_sourced: number; n_spoken: number; n_submitted: number; n_first_stage: number; n_later_stage: number; n_offer: number; fee_estimate: number | string | null; won_from_job_lead: string | null; created_at: string
}
function searchFrom(r: SearchRow): Search {
  return {
    id: r.id, client: r.client, role: r.role, function: r.function, level: r.level, location: r.location, city: r.city, country: r.country, confidential: r.confidential, crmUrl: r.crm_url, crmJobRef: r.crm_job_ref,
    priority: r.priority, status: r.status, openedOn: r.opened_on, firstSubmissionOn: r.first_submission_on, placedOn: r.placed_on, lastClientContactOn: r.last_client_contact_on, waitingOn: r.waiting_on, nextStep: r.next_step, nextStepOn: r.next_step_on,
    health: r.health, healthReason: r.health_reason, nSourced: r.n_sourced, nSpoken: r.n_spoken, nSubmitted: r.n_submitted, nFirstStage: r.n_first_stage, nLaterStage: r.n_later_stage, nOffer: r.n_offer,
    feeEstimate: r.fee_estimate === null ? null : Number(r.fee_estimate), wonFromJobLead: r.won_from_job_lead, createdAt: r.created_at,
  }
}
type CandidateRow = {
  id: string; search_id: string; person_id: string; stage: CandidateStage; stage_changed_on: string; submitted_on: string | null; feedback_received_on: string | null; feedback_nudges: number; consent_to_submit: boolean; next_interview_at: string | null; prep_sent: boolean
  last_candidate_contact_on: string | null; outcome_reason: string | null; offer_status: OfferStatus | null; decision_due_on: string | null; start_on: string | null; references_taken: number; references_needed: number; competing_process: boolean; risks: string | null; would_swing: string | null; aftercare_on: string | null
  person: { display_name: string; display_title: string | null; display_company: string | null; crm_url: string | null; linkedin_url: string | null } | null
}
function candidateFrom(r: CandidateRow): SearchCandidate {
  return {
    id: r.id, searchId: r.search_id, personId: r.person_id, name: r.person?.display_name ?? 'Someone', title: r.person?.display_title ?? null, company: r.person?.display_company ?? null, crmUrl: r.person?.crm_url ?? null, profileUrl: r.person?.linkedin_url ?? null,
    stage: r.stage, stageChangedOn: r.stage_changed_on, submittedOn: r.submitted_on, feedbackReceivedOn: r.feedback_received_on, feedbackNudges: r.feedback_nudges, consentToSubmit: r.consent_to_submit, nextInterviewAt: r.next_interview_at, prepSent: r.prep_sent,
    lastCandidateContactOn: r.last_candidate_contact_on, outcomeReason: r.outcome_reason, offerStatus: r.offer_status, decisionDueOn: r.decision_due_on, startOn: r.start_on, referencesTaken: r.references_taken, referencesNeeded: r.references_needed, competingProcess: r.competing_process, risks: r.risks, wouldSwing: r.would_swing, aftercareOn: r.aftercare_on,
  }
}

type ProblemRow = {
  id: string
  ref: number
  title: string | null
  description: string
  severity: ProblemSeverity
  status: ProblemStatus
  reporter_name: string | null
  assignee: string | null
  route: string | null
  user_agent: string | null
  viewport: string | null
  app_version: string | null
  resolution: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}
function problemFrom(r: ProblemRow): Problem {
  return {
    id: r.id, ref: r.ref, title: r.title, description: r.description, severity: r.severity, status: r.status, reporterName: r.reporter_name, assignee: r.assignee,
    route: r.route, userAgent: r.user_agent, viewport: r.viewport, appVersion: r.app_version, resolution: r.resolution, createdAt: r.created_at, updatedAt: r.updated_at, resolvedAt: r.resolved_at,
  }
}

export const data: DataSource = supabase ? live : sampleSource
