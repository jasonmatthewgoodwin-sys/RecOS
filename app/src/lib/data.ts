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
}

export const data: DataSource = supabase ? live : sampleSource
