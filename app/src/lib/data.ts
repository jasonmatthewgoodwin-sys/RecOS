// The small data layer (CLAUDE.md: "Fetch data with the Supabase client and a
// small data layer in app/src/lib"). Screens ask this file for what they need
// and never build queries themselves.

import { sampleSource } from './sample'
import { supabase } from './supabase'
import { ukClock, weekdayOf } from './time'

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
    const { data, error } = await supabase!.from('kpi_this_week').select('hit')
    fail(error)
    const rows = (data ?? []) as { hit: boolean }[]
    return { hit: rows.filter((r) => r.hit).length, total: rows.length }
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
