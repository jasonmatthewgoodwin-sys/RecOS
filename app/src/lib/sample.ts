// Invented sample data for building screens with no database (section 4.3,
// Local). Every name here is made up. Nothing in this file is real.

import type { DataSource, InboxAction, InboxItem, JobLead } from './data'
import { inboxStatusAfter } from './data'
import { ukClock } from './time'

function todayAt(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString()
}

function daysAgo(n: number): string {
  return ukClock(new Date(Date.now() - n * 86_400_000)).date
}

/** The Monday of this week, as a plain date. */
function thisMonday(): string {
  const c = ukClock(new Date())
  return daysAgo(c.isoDay - 1)
}

function lead(over: Partial<JobLead> & Pick<JobLead, 'id' | 'company' | 'role' | 'firstSeenOn'>): JobLead {
  return {
    city: null,
    country: 'US',
    level: null,
    sources: [],
    sourceUrls: [],
    posterName: null,
    posterTitle: null,
    posterProfileUrl: null,
    fitScore: null,
    fitReason: null,
    existingClient: false,
    stage: 'new',
    deadReason: null,
    matched: [],
    draft: null,
    chasedOn: null,
    repliedOn: null,
    meetingOn: null,
    wonOn: null,
    ...over,
  }
}

const chase =
  'Hi, I saw the Senior PMM role. I work only on product marketing hires into the US and have two people worth a look. Would a short call this week suit?'

// The sample week's job leads, mirroring db/seed/sample_week.sql with a few
// more so the list runs past seven rows. Held in memory so that a change made
// on one page shows on the next, as it would with a database.
export function freshSampleLeads(): JobLead[] {
  const monday = thisMonday()
  return [
    lead({
      id: 'job-northwind',
      company: 'Northwind Sample Co',
      role: 'Senior PMM',
      level: 'senior',
      city: 'new_york',
      sources: ['linkedin_post'],
      sourceUrls: ['https://example.com/post/northwind'],
      posterName: 'Grace Fictional',
      posterTitle: 'VP Marketing',
      posterProfileUrl: 'https://example.com/in/grace-fictional',
      fitScore: 88,
      fitReason: 'B2B SaaS, about 400 people, New York',
      matched: [{ personId: 'person-ada', name: 'Ada Example', reason: 'Senior PMM in New York, open to a move' }],
      draft: chase,
      firstSeenOn: daysAgo(2),
    }),
    lead({
      id: 'job-contoso',
      company: 'Contoso Demo Inc',
      role: 'Director of PMM',
      level: 'director',
      city: 'boston',
      sources: ['alex_leads', 'linkedin_advert'],
      sourceUrls: ['', 'https://example.com/advert/contoso'],
      fitScore: 82,
      fitReason: 'Fits the ICP. The hiring leader is on the league',
      matched: [
        { personId: 'person-ben', name: 'Ben Sample', reason: 'Director level, Boston, launched two platforms' },
        { personId: 'person-cara', name: 'Cara Placeholder', reason: 'Knows the hiring leader' },
      ],
      draft: 'Hi, I saw you are hiring a Director of PMM. I have two directors in Boston worth a look. Open to a short call?',
      firstSeenOn: daysAgo(1),
    }),
    lead({
      id: 'job-globex',
      company: 'Globex Fiction',
      role: 'Product Marketing Manager',
      level: 'manager',
      city: 'remote_us',
      sources: ['linkedin_post'],
      sourceUrls: ['https://example.com/post/globex'],
      fitScore: 70,
      fitReason: 'Remote US. Second PMM hire this quarter',
      draft: 'Hi, I saw the PMM role at Globex Fiction. I work only on product marketing hires and may be able to help.',
      firstSeenOn: daysAgo(3),
    }),
    lead({
      id: 'job-acme',
      company: 'Acme Pretend Ltd',
      role: 'Head of Product Marketing',
      level: 'head',
      city: 'austin',
      sources: ['alex_leads'],
      sourceUrls: [''],
      fitScore: 79,
      fitReason: 'Series B, Austin, first PMM leader',
      existingClient: true,
      draft:
        'Hi, Acme Pretend Ltd are hiring a Head of Product Marketing. As you hold the account, would you like me to send over two names?',
      firstSeenOn: daysAgo(4),
    }),
    lead({
      id: 'job-vandelay',
      company: 'Vandelay Imports',
      role: 'Principal PMM',
      level: 'principal',
      city: 'chicago',
      sources: ['linkedin_advert'],
      sourceUrls: ['https://example.com/advert/vandelay'],
      fitScore: 64,
      fitReason: 'Principal level, Chicago, B2B payments',
      firstSeenOn: daysAgo(5),
    }),
    lead({
      id: 'job-stark',
      company: 'Stark Make-believe',
      role: 'Senior Director, PMM',
      level: 'senior_director',
      city: 'seattle',
      sources: ['linkedin_post'],
      sourceUrls: ['https://example.com/post/stark'],
      fitScore: 61,
      fitReason: 'Senior director, Seattle, enterprise software',
      firstSeenOn: daysAgo(6),
    }),
    lead({
      id: 'job-hooli',
      company: 'Hooli Invented',
      role: 'PMM, Developer Tools',
      level: 'ic',
      city: 'san_francisco',
      sources: ['linkedin_post'],
      sourceUrls: ['https://example.com/post/hooli'],
      fitScore: 52,
      fitReason: 'IC level, San Francisco, developer tools',
      firstSeenOn: daysAgo(6),
    }),
    lead({
      id: 'job-pied',
      company: 'Pied Piper Sample',
      role: 'Product Marketing Lead',
      level: 'manager',
      city: 'denver',
      sources: ['alex_leads'],
      sourceUrls: [''],
      fitScore: 45,
      fitReason: 'Manager level, Denver, early stage',
      firstSeenOn: daysAgo(7),
    }),
    lead({
      id: 'job-dunder',
      company: 'Dunder Mock Paper',
      role: 'Marketing Manager',
      level: 'manager',
      city: 'scranton',
      sources: ['linkedin_advert'],
      sourceUrls: ['https://example.com/advert/dunder'],
      fitScore: 31,
      fitReason: 'General marketing, not PMM. Paper, not software',
      firstSeenOn: daysAgo(8),
    }),
    lead({
      id: 'job-initech',
      company: 'Initech Mock',
      role: 'Head of Product Marketing',
      level: 'head',
      city: 'san_francisco',
      sources: ['linkedin_post', 'manual'],
      sourceUrls: ['https://example.com/post/initech', ''],
      fitScore: 76,
      fitReason: 'Head level, San Francisco, B2B software',
      stage: 'chased',
      chasedOn: monday,
      firstSeenOn: daysAgo(ukClock(new Date()).isoDay + 3),
    }),
    lead({
      id: 'job-umbrella',
      company: 'Umbrella Sample',
      role: 'VP Product Marketing',
      level: 'vp',
      city: 'new_york',
      sources: ['alex_leads'],
      sourceUrls: [''],
      fitScore: 91,
      fitReason: 'VP level, New York, B2B software at scale',
      stage: 'replied',
      chasedOn: daysAgo(14),
      repliedOn: daysAgo(9),
      firstSeenOn: daysAgo(17),
    }),
    lead({
      id: 'job-wonka',
      company: 'Wonka Imaginary Ltd',
      role: 'PMM Lead',
      level: 'manager',
      country: 'UK',
      city: 'london',
      sources: ['linkedin_advert'],
      sourceUrls: ['https://example.com/advert/wonka'],
      fitScore: 40,
      stage: 'dead',
      deadReason: 'not_icp',
      firstSeenOn: daysAgo(27),
    }),
  ]
}

let sampleLeads = freshSampleLeads()

/** Tests only. */
export function resetSampleLeads() {
  sampleLeads = freshSampleLeads()
}

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3_600_000).toISOString()
}

function item(over: Partial<InboxItem> & Pick<InboxItem, 'id' | 'type' | 'agent' | 'title' | 'rank' | 'createdAt'>): InboxItem {
  return {
    personId: null,
    company: null,
    role: null,
    location: null,
    why: null,
    suggestedAction: null,
    draft: null,
    draftOriginal: null,
    source: 'sample week',
    sourceUrl: null,
    links: [],
    refTable: null,
    refId: null,
    status: 'new',
    binReason: null,
    snoozedUntil: null,
    dueOn: null,
    ...over,
  }
}

const congratulations = 'Congratulations on the move to VP, Ben. Well earned.'
const specDraft = 'Hi, I saw the Senior PMM role. I work only on product marketing hires and have two people worth a look.'

// The sample week's inbox: twelve things that need the owner, one sent for
// them and one already done, mirroring db/seed/sample_week.sql with a few
// more so the deck is worth working. Held in memory like the leads.
export function freshSampleInbox(): InboxItem[] {
  return [
    item({ id: 'in-1', type: 'system_notice', agent: 'system', title: 'Outlook needs signing in again', why: 'Mail has not been read since Tuesday.', suggestedAction: 'Fix', rank: 100, createdAt: hoursAgo(3) }),
    item({ id: 'in-2', type: 'job_lead', agent: 'a3_jobs', title: 'Senior PMM at Northwind Sample Co', company: 'Northwind Sample Co', role: 'Senior PMM', location: 'New York', why: 'B2B SaaS, about 400 people, New York. Posted two days ago.', suggestedAction: 'Chase', draft: specDraft, draftOriginal: specDraft, sourceUrl: 'https://example.com/post/1', refTable: 'job_leads', refId: 'job-northwind', rank: 90, createdAt: hoursAgo(20) }),
    item({ id: 'in-3', type: 'job_lead', agent: 'a3_jobs', title: 'Director of PMM at Contoso Demo Inc', company: 'Contoso Demo Inc', role: 'Director of PMM', location: 'Boston', why: 'Fits the ICP. The hiring leader is on the league.', suggestedAction: 'Chase', refTable: 'job_leads', refId: 'job-contoso', rank: 85, createdAt: hoursAgo(26) }),
    item({ id: 'in-4', type: 'job_lead', agent: 'a3_jobs', title: 'PMM at Globex Fiction', company: 'Globex Fiction', role: 'Product Marketing Manager', location: 'Remote US', why: 'Remote US. Second PMM hire this quarter.', suggestedAction: 'Chase', refTable: 'job_leads', refId: 'job-globex', rank: 70, createdAt: hoursAgo(30) }),
    item({ id: 'in-5', type: 'signal', agent: 'a4_signals', title: 'Ben Sample was promoted', company: 'Contoso Demo Inc', why: 'Now VP. Likely to build a team.', suggestedAction: 'Send congratulations', draft: congratulations, draftOriginal: congratulations, rank: 60, createdAt: hoursAgo(8) }),
    item({ id: 'in-6', type: 'referral', agent: 'a6_calls', title: 'Eve Invented named someone to speak to', company: 'Initech Mock', why: 'Mentioned on a call this week.', suggestedAction: 'Follow up', rank: 55, createdAt: hoursAgo(50) }),
    item({ id: 'in-7', type: 'wider_lead', agent: 'a3_jobs', title: 'Sales role at Fabrikam Test Ltd', company: 'Fabrikam Test Ltd', role: 'Account Executive', location: 'Austin', why: 'Not PMM. May suit the sales team.', suggestedAction: 'Pass on', refTable: 'wider_leads', refId: 'wider-fabrikam', rank: 40, createdAt: hoursAgo(28) }),
    item({ id: 'in-8', type: 'content_draft', agent: 'a2_content', title: 'Post: what a PMM interview loop gets wrong', why: 'Three calls this week raised it.', suggestedAction: 'Approve', draft: 'Most PMM loops test presentation, not judgement. Here is what to ask instead.', draftOriginal: 'Most PMM loops test presentation, not judgement. Here is what to ask instead.', rank: 38, createdAt: hoursAgo(40) }),
    item({ id: 'in-9', type: 'client_nudge', agent: 'a5_followups', title: 'Cara Placeholder owes feedback on two CVs', company: 'Fabrikam Test Ltd', why: 'Sent on Monday. Nothing back.', suggestedAction: 'Send a nudge', draft: 'Hi Cara, a quick nudge on the two profiles from Monday. Any first thoughts?', draftOriginal: 'Hi Cara, a quick nudge on the two profiles from Monday. Any first thoughts?', dueOn: daysAgo(1), rank: 45, createdAt: hoursAgo(70) }),
    item({ id: 'in-10', type: 'event_idea', agent: 'a7_events', title: 'Breakfast on pricing pages', why: 'Came up on five calls this month.', suggestedAction: 'Plan', rank: 20, createdAt: hoursAgo(90) }),
    item({ id: 'in-11', type: 'call_writeup', agent: 'a6_calls', title: 'Call with Ada Example needs a look', company: 'Northwind Sample Co', why: 'One field could not be filled from the notes.', suggestedAction: 'Confirm', rank: 50, status: 'stale', createdAt: hoursAgo(15 * 24) }),
    item({ id: 'in-12', type: 'follow_up', agent: 'a5_followups', title: 'Dev Madeup is waiting on feedback', company: 'Globex Fiction', why: 'Promised on the first call.', suggestedAction: 'Done', rank: 30, status: 'stale', createdAt: hoursAgo(16 * 24) }),
    item({ id: 'in-13', type: 'auto_sent', agent: 'system', title: 'Thank-you sent to Dev Madeup', why: 'Sent for you under the rules.', status: 'done', rank: 0, createdAt: hoursAgo(5) }),
    item({ id: 'in-14', type: 'event_idea', agent: 'a7_events', title: 'Lunch on launch stories', why: 'Already planned.', status: 'done', rank: 10, createdAt: hoursAgo(80) }),
  ]
}

let sampleInbox = freshSampleInbox()

export function resetSampleInbox() {
  sampleInbox = freshSampleInbox()
}

// Chased this week in the sample is eleven from earlier in the week plus the
// sample leads chased since Monday, so a Chased on the page moves the number.
const CHASED_BEFORE = 11
const CHASED_TARGET = 20

export const sampleSource: DataSource = {
  async needsYou() {
    return sampleInbox.filter((i) => (i.status === 'new' || i.status === 'stale') && i.type !== 'auto_sent').length
  },
  async followUpsDue() {
    return { due: 3, late: 3, lateFromDay: 'Monday' }
  },
  async callsToday() {
    return [
      { id: 'sample-1', startsAt: todayAt(1), title: 'Candidate screen', callType: 'candidate_screen', personName: 'Ada Example' },
      { id: 'sample-2', startsAt: todayAt(2), title: 'Coaching', callType: 'coaching', personName: 'Ben Sample' },
      { id: 'sample-3', startsAt: todayAt(3), title: 'Client update', callType: 'client_update', personName: 'Cara Placeholder' },
      { id: 'sample-4', startsAt: todayAt(4), title: 'Candidate screen', callType: 'candidate_screen', personName: 'Dev Madeup' },
      { id: 'sample-5', startsAt: todayAt(5), title: 'Reference', callType: 'reference', personName: 'Eve Invented' },
      { id: 'sample-6', startsAt: todayAt(6), title: 'Candidate screen', callType: 'candidate_screen', personName: 'Finn Fictional' },
    ]
  },
  async weekTargets() {
    return { hit: 2, total: 4 }
  },

  async jobLeads() {
    return sampleLeads.map((l) => ({ ...l, matched: l.matched.map((m) => ({ ...m })) }))
  },
  async chasedThisWeek() {
    const monday = thisMonday()
    const thisWeek = sampleLeads.filter((l) => l.chasedOn !== null && l.chasedOn >= monday).length
    return { total: CHASED_BEFORE + thisWeek, target: CHASED_TARGET }
  },
  async setLeadStage(id, stage, deadReason) {
    const today = ukClock(new Date()).date
    const found = sampleLeads.find((l) => l.id === id)
    if (!found) throw new Error('No such lead')
    if (stage === 'dead' && !deadReason) throw new Error('A dead lead needs a reason')
    if (stage === 'job_won') throw new Error('A won job needs a search')
    // What the database triggers do: stage dates set once, dead reason cleared on the way back.
    found.stage = stage
    if (stage === 'chased') found.chasedOn ??= today
    if (stage === 'replied') found.repliedOn ??= today
    if (stage === 'meeting_booked') found.meetingOn ??= today
    found.deadReason = stage === 'dead' ? (deadReason ?? null) : null
  },
  async passLead(lead, colleague) {
    const found = sampleLeads.find((l) => l.id === lead.id)
    if (!found) throw new Error('No such lead')
    if (!colleague.trim()) throw new Error('Passing needs someone to pass to')
    found.stage = 'passed'
  },

  async inboxItems() {
    return sampleInbox.filter((i) => (i.status === 'new' || i.status === 'stale') && i.type !== 'auto_sent').map((i) => ({ ...i }))
  },
  async sentForYou() {
    return sampleInbox.filter((i) => i.type === 'auto_sent').map((i) => ({ ...i }))
  },
  async actOnInbox(item, action, extra = {}) {
    const found = sampleInbox.find((i) => i.id === item.id)
    if (!found) throw new Error('No such item')
    // What INB-6 does on the server: the record moves where a mapping exists.
    if ((action === 'done' || action === 'pass') && found.refTable === 'job_leads') {
      const lead = sampleLeads.find((l) => l.id === found.refId)
      if (lead && lead.stage === 'new') {
        lead.stage = 'chased'
        lead.chasedOn ??= ukClock(new Date()).date
      }
    }
    found.status = inboxStatusAfter(action)
    if (extra.draft !== undefined) found.draft = extra.draft
    if (action === 'bin') found.binReason = extra.binReason ?? 'Other'
    if (action === 'snooze') found.snoozedUntil = extra.snoozedUntil ?? null
    if (action === 'approve' && extra.on) found.dueOn = extra.on
  },
  async undoInbox(item, action: InboxAction) {
    const found = sampleInbox.find((i) => i.id === item.id)
    if (!found) throw new Error('No such item')
    if ((action === 'done' || action === 'pass') && found.refTable === 'job_leads') {
      const lead = sampleLeads.find((l) => l.id === found.refId)
      if (lead && lead.stage === 'chased') lead.stage = 'new'
    }
    found.status = item.status
    found.binReason = null
    found.snoozedUntil = null
  },
  async binStale(ids) {
    for (const i of sampleInbox) {
      if (ids.includes(i.id)) {
        i.status = 'binned'
        i.binReason = 'Old'
      }
    }
  },
}
