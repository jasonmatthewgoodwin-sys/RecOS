// The small data layer (CLAUDE.md: "Fetch data with the Supabase client and a
// small data layer in app/src/lib"). Screens ask this file for what they need
// and never build queries themselves.

import { sampleSource } from './sample'
import { supabase } from './supabase'
import { mondayOf, ukClock, weekdayOf } from './time'

export type CalendarCall = {
  id: string
  /** ISO timestamp */
  startsAt: string
  title: string
  callType: string
  personName: string | null
  /** The person's CRM page, for the prep card's one link (26.4). */
  crmUrl?: string | null
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
  chasedOn: string | null
  repliedOn: string | null
  meetingOn: string | null
  wonOn: string | null
}

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
}

export type WiderLeadStatus = 'spotted' | 'passed' | 'meeting_booked' | 'job_won' | 'placed' | 'not_pursued'

export type Tier = 'premier' | 'championship' | 'league_one'

/** A named list under People (docs/decisions.md, 14 November 2026). */
export type PeopleList = { id: string; key: string; name: string; kind: 'leader' | 'a_star' | 'other'; seats: number }

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
  /** Plain dates */
  lastTouchOn: string | null
  nextDueOn: string
  daysLate: number
  state: 'late' | 'due' | 'fine'
  missedCycles: number
  liveSignal: string | null
  notesForNextContact: string | null
  jobsBriefed: number
  referralsGiven: number
  introsMade: number
}

export type Touch = { id: string; touchedOn: string; channel: string; kind: string; note: string | null }

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
}

/** One next action owed to a person, or awaited from them (section 8.2). */
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
  message: { id: string; channel: 'email' | 'linkedin'; level: 'automatic' | 'one_click' | 'draft_only'; body: string | null } | null
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

export interface DataSource {
  needsYou(): Promise<number>
  followUpsDue(): Promise<FollowUpsDue>
  /** External calls still to come today, soonest first. */
  callsToday(): Promise<CalendarCall[]>
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
  /** WID-1 and WID-2: pass on needs the colleague and the split. */
  passWiderLead(id: string, colleague: string, split: string): Promise<void>
  setWiderLeadStatus(id: string, status: WiderLeadStatus): Promise<void>

  /** The lists under People, in order. */
  lists(): Promise<PeopleList[]>
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
  agentRuns(code: string): Promise<AgentRun[]>
  agentPrompts(code: string): Promise<AgentPrompt[]>
  /** Save as new version: the next number, made active in one transaction (AGT-1). */
  saveAgentPrompt(code: string, body: string, note: string): Promise<number>
  activateAgentPrompt(code: string, version: number): Promise<void>
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

  /** Numbers, This week (32.1). */
  kpiThisWeek(): Promise<KpiWeek[]>
  kpiStreaks(): Promise<KpiStreak[]>
  /** The rows behind one KPI this week, newest first. Owner only. */
  kpiEvents(kpi: string): Promise<KpiEvent[]>
  /** A manual correction: its own row with manual true and a reason (22.4). Never an edit. */
  correctKpi(kpi: string, amount: number, reason: string): Promise<void>

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

const live: DataSource = {
  // Section 14.1: new and stale items, not counting sent-for-you.
  async needsYou() {
    const { count, error } = await supabase!
      .from('inbox_items')
      .select('id', { count: 'exact', head: true })
      .in('status', ['new', 'stale'])
      .neq('type', 'auto_sent')
    fail(error)
    return count ?? 0
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

  async callsToday() {
    const { data, error } = await supabase!
      .from('calendar_today')
      .select('id, starts_at, title, call_type, person_name, person:people!person_id (crm_url)')
      .eq('is_external', true)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
    fail(error)
    type Row = { id: string; starts_at: string; title: string; call_type: string; person_name: string | null; person: { crm_url: string | null } | null }
    return ((data ?? []) as unknown as Row[]).map((r) => ({
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
        'id, company, role, city, country, level, sources, source_urls, poster_name, poster_title, poster_profile_url, ' +
          'fit_score, fit_reason, existing_client, stage, dead_reason, matched, first_seen_on, chased_on, replied_on, ' +
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
      chased_on: string | null
      replied_on: string | null
      meeting_on: string | null
      won_on: string | null
      spec_message: { body: string | null } | null
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
      matched: (Array.isArray(r.matched) ? r.matched : [])
        .filter((m) => typeof m.name === 'string')
        .map((m) => ({ personId: m.person_id ?? null, name: m.name!, reason: m.reason ?? '' })),
      draft: r.spec_message?.body ?? null,
      firstSeenOn: r.first_seen_on,
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
          'message:messages!message_id (id, channel, level_at_creation, body)',
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
      message: { id: string; channel: 'email' | 'linkedin'; level_at_creation: 'automatic' | 'one_click' | 'draft_only'; body: string | null } | null
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
      message: r.message ? { id: r.message.id, channel: r.message.channel, level: r.message.level_at_creation, body: r.message.body } : null,
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
      .select('id, referred_name, referred_company, referred_title, referred_by_id, referred_by_name, context, kind, stage, thanked, received_on, contacted_on')
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
    }
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      referredName: r.referred_name,
      referredCompany: r.referred_company,
      referredTitle: r.referred_title,
      referredById: r.referred_by_id,
      referredByName: r.referred_by_name,
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
    const { data, error } = await supabase!.from('lists').select('id, key, name, kind, seats').order('position')
    fail(error)
    return (data ?? []) as PeopleList[]
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
      .select('id, why, jobs_briefed, referrals_given, intros_made, person:people!person_id (city, crm_url, linkedin_url, notes_for_next_contact)')
      .in('id', views.map((v) => v.id))
    fail(e2)
    type Extra = {
      id: string
      why: string | null
      jobs_briefed: number
      referrals_given: number
      intros_made: number
      person: { city: string | null; crm_url: string | null; linkedin_url: string | null; notes_for_next_contact: string | null } | null
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
        lastTouchOn: v.last_touch_on,
        nextDueOn: v.next_due_on,
        daysLate: Number(v.days_late),
        state: v.state,
        missedCycles: v.missed_cycles,
        liveSignal: v.live_signal,
        notesForNextContact: e?.person?.notes_for_next_contact ?? null,
        jobsBriefed: e?.jobs_briefed ?? 0,
        referralsGiven: e?.referrals_given ?? 0,
        introsMade: e?.intros_made ?? 0,
      }
    })
  },

  async touches(personId, limit = 5) {
    const { data, error } = await supabase!
      .from('touches')
      .select('id, touched_on, channel, kind, note')
      .eq('person_id', personId)
      .order('touched_on', { ascending: false })
      .limit(limit)
    fail(error)
    type Row = { id: string; touched_on: string; channel: string; kind: string; note: string | null }
    return ((data ?? []) as Row[]).map((r) => ({ id: r.id, touchedOn: r.touched_on, channel: r.channel, kind: r.kind, note: r.note }))
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
      .select('code, name, schedule, enabled, model_tier, monthly_budget, key_created_at, consecutive_failures')
      .order('code')
    fail(error)
    type Row = { code: string; name: string; schedule: string; enabled: boolean; model_tier: 'light' | 'standard'; monthly_budget: number | null; key_created_at: string | null; consecutive_failures: number }
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

  async signals() {
    const { data, error } = await supabase!
      .from('signals')
      .select('id, person_id, person_name, company, title, city, signal_type, strength, detail, source, source_url, seen_on, status')
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

export const data: DataSource = supabase ? live : sampleSource
