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
      .select('id, starts_at, title, call_type, person_name')
      .eq('is_external', true)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
    fail(error)
    type Row = { id: string; starts_at: string; title: string; call_type: string; person_name: string | null }
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      startsAt: r.starts_at,
      title: r.title,
      callType: r.call_type,
      personName: r.person_name,
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
