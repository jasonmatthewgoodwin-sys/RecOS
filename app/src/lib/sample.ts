// Invented sample data for building screens with no database (section 4.3,
// Local). Every name here is made up. Nothing in this file is real.

import type { Agent, AgentPrompt, AgentRun, AppSettings, AuditEntry, CoachingSession, DataSource, DoNotContact, FoundPerson, SharedBlock, FollowUp, InboxAction, InboxItem, JobLead, KpiEvent, KpiOutputWeek, KpiQuarter, KpiWeek, KpiWeekRow, Member, PeopleList, Referral, ReviewFields, SendPolicy, Signal, Target, Touch, WeeklyReview, WiderLead } from './data'
import { inboxStatusAfter } from './data'
import type { SearchHit } from './capture'
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

function fu(over: Partial<FollowUp> & Pick<FollowUp, 'id' | 'personName' | 'kind' | 'reason' | 'dueOn'>): FollowUp {
  return {
    personId: null,
    company: null,
    source: 'call',
    direction: 'owed',
    status: 'open',
    snoozedUntil: null,
    message: null,
    createdAt: hoursAgo(30),
    ...over,
  }
}

// The sample week's follow-ups, mirroring db/seed/sample_week.sql with more
// so the deck is worth working: three late, three due today, two later this
// week, two the owner is waiting on, and one snoozed.
export function freshSampleFollowUps(): FollowUp[] {
  const monday = thisMonday()
  const lastWeek = (d: number) => new Date(Date.parse(`${monday}T10:00:00Z`) - d * 86_400_000).toISOString()
  return [
    fu({ id: 'fu-ada', personName: 'Ada Example', company: 'Northwind Sample Co', kind: 'after_candidate_call', reason: 'Send the role outline you promised', dueOn: daysAgo(8), createdAt: lastWeek(4), message: { id: 'm-ada', channel: 'email', level: 'one_click', body: 'Hi Ada, good to speak. Here is the outline I promised.' } }),
    fu({ id: 'fu-dev', personName: 'Dev Madeup', company: 'Globex Fiction', kind: 'after_candidate_call', reason: 'Share feedback from the first call', dueOn: daysAgo(7), createdAt: lastWeek(3) }),
    fu({ id: 'fu-ben', personName: 'Ben Sample', company: 'Contoso Demo Inc', kind: 'after_coaching', reason: 'Send the two examples discussed', dueOn: daysAgo(6), createdAt: lastWeek(2), message: { id: 'm-ben', channel: 'email', level: 'one_click', body: 'Ben, the two examples we talked about are attached.' } }),
    fu({ id: 'fu-gia', personName: 'Gia Imaginary', company: 'Initech Mock', kind: 'after_client_meeting', reason: 'Summarise what was agreed on fees', dueOn: daysAgo(0), createdAt: lastWeek(1), message: { id: 'm-gia', channel: 'email', level: 'draft_only', body: 'Gia, as agreed today: 22% on a retained basis, first shortlist in ten working days.' } }),
    fu({ id: 'fu-hal', personName: 'Hal Hypothetical', company: 'Northwind Sample Co', kind: 'referral_thanks', reason: 'Thank them for the introduction to Eve', dueOn: daysAgo(0), createdAt: hoursAgo(50) }),
    fu({ id: 'fu-ivy', personName: 'Ivy Invented', company: 'Umbrella Sample', kind: 'league_cadence', reason: 'Six weeks since you last spoke', dueOn: daysAgo(0), source: 'rule', createdAt: hoursAgo(10), message: { id: 'm-ivy', channel: 'linkedin', level: 'draft_only', body: 'Ivy, it has been a while. How is the new team settling in?' } }),
    fu({ id: 'fu-finn', personName: 'Finn Fictional', company: 'Umbrella Sample', kind: 'after_submission', reason: 'Check in after the client reply', dueOn: plusDays(daysAgo(0), 3), source: 'rule' }),
    fu({ id: 'fu-jo', personName: 'Jo Placeholder', company: 'Wonka Imaginary Ltd', kind: 'after_interview', reason: 'Call after the second interview', dueOn: plusDays(daysAgo(0), 1), createdAt: hoursAgo(5) }),
    fu({ id: 'fu-cara', personName: 'Cara Placeholder', company: 'Fabrikam Test Ltd', kind: 'chase', reason: 'Waiting for feedback on two CVs', dueOn: daysAgo(1), source: 'email', direction: 'waiting', createdAt: hoursAgo(80) }),
    fu({ id: 'fu-kit', personName: 'Kit Sample', company: 'Contoso Demo Inc', kind: 'chase', reason: 'Asked about the start date', dueOn: daysAgo(0), source: 'email', direction: 'waiting', createdAt: hoursAgo(40) }),
    fu({ id: 'fu-lee', personName: 'Lee Example', company: 'Globex Fiction', kind: 'email_owed', reason: 'Reply about the salary band', dueOn: daysAgo(2), source: 'email', createdAt: hoursAgo(60), message: { id: 'm-lee', channel: 'email', level: 'draft_only', body: 'Lee, thanks for your patience. The band is as we discussed, with room above it for the right person.' } }),
    fu({ id: 'fu-max', personName: 'Max Madeup', company: 'Initech Mock', kind: 'other', reason: 'Send the reading list', dueOn: plusDays(daysAgo(0), 7), status: 'snoozed', snoozedUntil: plusDays(daysAgo(0), 7), source: 'manual', createdAt: hoursAgo(100) }),
  ]
}

function plusDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

let sampleFollowUps = freshSampleFollowUps()

export function resetSampleFollowUps() {
  sampleFollowUps = freshSampleFollowUps()
}

let sampleBlockMinutes: number | null = null

// Coaching sessions this week and last (28.3). Two held, two still to come,
// one held with two questions not asked (T-LEAD-5).
export function freshSampleCoaching(): CoachingSession[] {
  const none = { interviewedWhere: null, whoElseLooking: null, howTheyHire: null, eventsRated: null }
  return [
    { id: 'co-ben', personId: 'p-ben', personName: 'Ben Sample', personTitle: 'VP Product Marketing', personCompany: 'Contoso Demo Inc', bookedFor: todayAt(2), heldAt: null, source: 'league', status: 'booked', answers: none, adviceGiven: null, referralsCount: 0, leadsCount: 0, followedUp: false },
    { id: 'co-nia', personId: 'p-nia', personName: 'Nia Pretend', personTitle: 'Senior PMM', personCompany: 'Stark Sample', bookedFor: todayAt(26), heldAt: null, source: 'inbound', status: 'booked', answers: none, adviceGiven: null, referralsCount: 0, leadsCount: 0, followedUp: false },
    { id: 'co-eve', personId: 'p-eve', personName: 'Eve Invented', personTitle: 'Director of PMM', personCompany: 'Initech Mock', bookedFor: todayAt(-48), heldAt: todayAt(-48), source: 'inbound', status: 'held', answers: { interviewedWhere: 'Two Series B companies in the Bay Area', whoElseLooking: 'A former colleague now at Northwind Sample Co', howTheyHire: null, eventsRated: null }, adviceGiven: 'Lead with the launch story, not the title', referralsCount: 1, leadsCount: 0, followedUp: false },
    { id: 'co-oli', personId: 'p-oli', personName: 'Oli Fictional', personTitle: 'Product Marketing Manager', personCompany: 'Hooli Pretend', bookedFor: todayAt(-9 * 24), heldAt: todayAt(-9 * 24), source: 'open_to_work', status: 'held', answers: { interviewedWhere: 'Nowhere yet', whoElseLooking: 'Nobody she would name', howTheyHire: 'Take-home task, then a panel', eventsRated: 'The pricing breakfast, highly' }, adviceGiven: 'Ask for the panel in advance', referralsCount: 0, leadsCount: 1, followedUp: true },
  ]
}

export function freshSampleReferrals(): Referral[] {
  return [
    { id: 'rf-hal', referredName: 'Hal Hypothetical', referredCompany: 'Northwind Sample Co', referredTitle: 'Group PMM', referredById: 'p-eve', referredByName: 'Eve Invented', context: 'Worked together before. Said to be looking.', kind: 'person', stage: 'new', thanked: false, receivedOn: daysAgo(3), contactedOn: null },
    { id: 'rf-pat', referredName: 'Pat Example', referredCompany: 'Globex Fiction', referredTitle: 'Head of Marketing', referredById: 'p-dev', referredByName: 'Dev Madeup', context: 'Hiring two PMMs in the new year.', kind: 'person', stage: 'new', thanked: false, receivedOn: daysAgo(1), contactedOn: null },
    { id: 'rf-quin', referredName: 'Quin Sample', referredCompany: 'Umbrella Sample', referredTitle: null, referredById: 'p-finn', referredByName: 'Finn Fictional', context: 'Mentioned in passing.', kind: 'person', stage: 'contacted', thanked: true, receivedOn: daysAgo(9), contactedOn: daysAgo(6) },
  ]
}

export function freshSampleWiderLeads(): WiderLead[] {
  const monday = thisMonday()
  return [
    { id: 'wider-fabrikam', company: 'Fabrikam Test Ltd', role: 'Account Executive', function: 'sales', country: 'US', location: 'Austin', source: 'job_post', mentionedByName: 'Cara Placeholder', existingClient: false, passedTo: null, passedOn: null, splitNote: null, status: 'spotted', notes: 'Not PMM. May suit the sales team.', createdAt: hoursAgo(28) },
    { id: 'wider-initech', company: 'Initech Mock', role: null, function: 'customer_success', country: 'US', location: null, source: 'coaching', mentionedByName: 'Eve Invented', existingClient: true, passedTo: null, passedOn: null, splitNote: null, status: 'spotted', notes: null, createdAt: hoursAgo(70) },
    { id: 'wider-globex', company: 'Globex Fiction', role: 'RevOps Manager', function: 'revops', country: 'US', location: null, source: 'coaching', mentionedByName: 'Dev Madeup', existingClient: false, passedTo: 'Sam Colleague', passedOn: plusDays(monday, -8), splitNote: 'Half each, agreed on the call', status: 'passed', notes: null, createdAt: hoursAgo(200) },
  ]
}

let sampleCoaching = freshSampleCoaching()
let sampleReferrals = freshSampleReferrals()
let sampleWider = freshSampleWiderLeads()

export function resetSampleBd() {
  sampleCoaching = freshSampleCoaching()
  sampleReferrals = freshSampleReferrals()
  sampleWider = freshSampleWiderLeads()
}

export let sampleLists: PeopleList[] = [
  { id: 'list-senior', key: 'senior_network', name: 'Senior network', kind: 'leader', seats: 50, colour: 'clear', archived: false, position: 1 },
  { id: 'list-top', key: 'top_candidates', name: 'Top candidates', kind: 'a_star', seats: 50, colour: 'new', archived: false, position: 2 },
]

const cadence = { premier: 18, championship: 30, league_one: 49 } as const

function member(over: Partial<Member> & Pick<Member, 'id' | 'personId' | 'name' | 'listId' | 'tier' | 'lastTouchOn'> & { addedOn?: string }): Member {
  const today = ukClock(new Date()).date
  const nextDue = over.nextDueOn ?? (over.lastTouchOn ? plusDays(over.lastTouchOn, cadence[over.tier]) : plusDays(over.addedOn ?? today, 7))
  const daysLate = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${nextDue}T00:00:00Z`)) / 86_400_000)
  return {
    title: null,
    company: null,
    city: null,
    crmUrl: null,
    profileUrl: null,
    why: null,
    groupName: null,
    daysLate,
    state: daysLate >= 0 ? 'late' : daysLate >= -7 ? 'due' : 'fine',
    missedCycles: 0,
    liveSignal: null,
    notesForNextContact: null,
    jobsBriefed: 0,
    referralsGiven: 0,
    introsMade: 0,
    ...over,
    nextDueOn: nextDue,
  }
}

// The sample league, mirroring db/seed/sample_league.sql with more names so
// each list runs past seven rows: on cadence, due this week, late.
export function freshSampleMembers(): Member[] {
  return [
    member({ id: 'm-ben', personId: 'p-ben', name: 'Ben Sample', title: 'VP Product Marketing', company: 'Contoso Demo Inc', city: 'boston', listId: 'list-senior', tier: 'premier', why: 'VP who has briefed two roles', lastTouchOn: daysAgo(4), liveSignal: 'promoted', jobsBriefed: 2, crmUrl: 'https://example.com/crm/ben' }),
    member({ id: 'm-cara', personId: 'p-cara', name: 'Cara Placeholder', title: 'Head of Marketing', company: 'Fabrikam Test Ltd', city: 'austin', listId: 'list-senior', tier: 'championship', why: 'Client contact, warm', lastTouchOn: daysAgo(45), notesForNextContact: 'Ask about the Austin office' }),
    member({ id: 'm-eve', personId: 'p-eve', name: 'Eve Invented', title: 'Director of PMM', company: 'Initech Mock', city: 'san_francisco', listId: 'list-senior', tier: 'league_one', why: 'Director who gives referrals', lastTouchOn: daysAgo(44), referralsGiven: 1 }),
    member({ id: 'm-gia', personId: 'p-gia', name: 'Gia Imaginary', title: 'Head of Marketing', company: 'Initech Mock', listId: 'list-senior', tier: 'premier', why: 'New in post, building a team', lastTouchOn: daysAgo(20), liveSignal: 'new_role' }),
    member({ id: 'm-kit', personId: 'p-kit', name: 'Kit Sample', title: 'CMO', company: 'Contoso Demo Inc', listId: 'list-senior', tier: 'premier', why: 'Signs off the budget', lastTouchOn: daysAgo(10) }),
    member({ id: 'm-lee', personId: 'p-lee', name: 'Lee Example', title: 'VP Marketing', company: 'Globex Fiction', listId: 'list-senior', tier: 'championship', why: 'Hiring again in the new year', lastTouchOn: daysAgo(25) }),
    member({ id: 'm-max', personId: 'p-max', name: 'Max Madeup', title: 'Head of Growth', company: 'Stark Sample', listId: 'list-senior', tier: 'championship', why: 'Met at the pricing breakfast', lastTouchOn: daysAgo(29) }),
    member({ id: 'm-nia', personId: 'p-nia', name: 'Nia Pretend', title: 'Director of Marketing', company: 'Hooli Pretend', listId: 'list-senior', tier: 'league_one', why: 'Former client', lastTouchOn: daysAgo(60), missedCycles: 1 }),
    member({ id: 'm-ada', personId: 'p-ada', name: 'Ada Example', title: 'Senior PMM', company: 'Northwind Sample Co', city: 'new_york', listId: 'list-top', tier: 'premier', why: 'Senior PMM, open to a move', lastTouchOn: daysAgo(2), profileUrl: 'https://example.com/in/ada' }),
    member({ id: 'm-dev', personId: 'p-dev', name: 'Dev Madeup', title: 'Product Marketing Manager', company: 'Globex Fiction', city: 'remote_us', listId: 'list-top', tier: 'championship', why: 'Strong on launches', lastTouchOn: daysAgo(31) }),
    member({ id: 'm-finn', personId: 'p-finn', name: 'Finn Fictional', title: 'PMM Lead', company: 'Umbrella Sample', city: 'new_york', listId: 'list-top', tier: 'league_one', why: 'Placed once, keeps in touch', lastTouchOn: null, addedOn: daysAgo(120), missedCycles: 2 }),
    member({ id: 'm-oli', personId: 'p-oli', name: 'Oli Fictional', title: 'Product Marketing Manager', company: 'Hooli Pretend', listId: 'list-top', tier: 'championship', why: 'Coached, very sharp', lastTouchOn: daysAgo(9) }),
    member({ id: 'm-pat', personId: 'p-pat', name: 'Pat Example', title: 'Head of PMM', company: 'Globex Fiction', listId: 'list-top', tier: 'premier', why: 'Could run a team anywhere', lastTouchOn: daysAgo(16) }),
    member({ id: 'm-quin', personId: 'p-quin', name: 'Quin Sample', title: 'Senior PMM', company: 'Umbrella Sample', listId: 'list-top', tier: 'premier', why: 'Two offers last time', lastTouchOn: daysAgo(5) }),
    member({ id: 'm-rae', personId: 'p-rae', name: 'Rae Placeholder', title: 'PMM', company: 'Wonka Imaginary Ltd', listId: 'list-top', tier: 'league_one', why: 'Rising', lastTouchOn: daysAgo(50) }),
  ]
}

let sampleMembers = freshSampleMembers()
function freshSampleTouches(): Record<string, Touch[]> {
  return {
    'p-ben': [
      { id: 't1', touchedOn: daysAgo(4), channel: 'phone', kind: 'call', note: 'Talked about the Boston role' },
      { id: 't2', touchedOn: daysAgo(40), channel: 'linkedin', kind: 'message_replied', note: null },
    ],
    'p-cara': [{ id: 't3', touchedOn: daysAgo(45), channel: 'meeting', kind: 'meeting', note: 'Quarterly catch-up' }],
  }
}

let sampleTouches = freshSampleTouches()

export function resetSampleMembers() {
  sampleMembers = freshSampleMembers()
  sampleTouches = freshSampleTouches()
}

// The week's signals (29.2), mirroring db/seed/sample_league.sql. Ben is
// already on a list, so his card offers no Add to league (T-PEO-6).
export function freshSampleSignals(): Signal[] {
  return [
    { id: 'sig-ben', personId: 'p-ben', personName: 'Ben Sample', company: 'Contoso Demo Inc', title: 'VP Product Marketing', city: 'boston', signalType: 'promoted', strength: 3, detail: 'Now VP. Likely to build a team.', source: 'linkedin_alert', sourceUrl: 'https://example.com/in/ben', seenOn: daysAgo(1), status: 'new', onList: true },
    { id: 'sig-gia', personId: null, personName: 'Gia Imaginary', company: 'Initech Mock', title: 'Head of Marketing', city: 'san_francisco', signalType: 'new_role', strength: 3, detail: 'Started as Head of Marketing this month.', source: 'linkedin_alert', sourceUrl: 'https://example.com/in/gia', seenOn: daysAgo(3), status: 'new', onList: false },
    { id: 'sig-sol', personId: null, personName: 'Sol Example', company: 'Stark Sample', title: 'CMO', city: null, signalType: 'company_raised', strength: 3, detail: 'Series C announced on Tuesday.', source: 'alex_leads', sourceUrl: null, seenOn: daysAgo(2), status: 'new', onList: false },
    { id: 'sig-hal', personId: null, personName: 'Hal Hypothetical', company: 'Northwind Sample Co', title: 'Group PMM', city: 'new_york', signalType: 'open_to_work', strength: 2, detail: 'Open to work badge.', source: 'linkedin_alert', sourceUrl: null, seenOn: daysAgo(5), status: 'new', onList: false },
    { id: 'sig-tam', personId: null, personName: 'Tam Placeholder', company: 'Wonka Imaginary Ltd', title: 'Director of PMM', city: 'london', signalType: 'left_company', strength: 2, detail: 'Left after four years.', source: 'linkedin_alert', sourceUrl: null, seenOn: daysAgo(9), status: 'new', onList: false },
  ]
}

let sampleSignals = freshSampleSignals()

// This week's numbers (32.1), mirroring db/seed/sample_week.sql: posts chased
// and coaching hit, LinkedIn posts and new A-star not. Targets started on
// 9 November 2026, so every sentence is still Tracking since.
function freshSampleKpiEvents(): Record<string, KpiEvent[]> {
  const ev = (kpi: string, n: number, label: string): KpiEvent[] =>
    Array.from({ length: n }, (_, i) => ({ id: `${kpi}-${i + 1}`, label, amount: 1, manual: false, reason: null, isPmm: true, happenedAt: `${daysAgo(i % 5)}T10:00:00Z` }))
  const chased = [
    'Senior PMM at Contoso Demo Inc', 'Director of PMM at Fabrikam Test Ltd', 'Head of Product Marketing at Initech Mock', 'PMM Lead at Northwind Sample Co',
    'VP Product Marketing at Stark Sample', 'Group PMM at Wonka Imaginary Ltd', 'Senior PMM at Acme Fictional', 'PMM Manager at Globex Pretend',
    'Head of PMM at Umbrella Made-up', 'Product Marketing Lead at Hooli Sample', 'Senior PMM at Vandelay Example', 'Director of PMM at Dunder Mock',
    'PMM at Soylent Sample', 'Senior PMM at Oscorp Placeholder', 'Head of PMM at Tyrell Imaginary', 'PMM Lead at Cyberdyne Test',
    'Principal PMM at Gringotts Demo', 'Senior PMM at Pied Piper Sample', 'Director of PMM at Aperture Mock', 'PMM at Massive Dynamic Example',
  ]
  return {
    posts_chased: chased.map((c, i) => ({ id: `posts-${i + 1}`, label: `Chased: ${c}`, amount: 1, manual: false, reason: null, isPmm: true, happenedAt: `${daysAgo(i % 5)}T10:00:00Z` })),
    coaching_calls: ev('coaching_calls', 5, 'Coaching call held'),
    linkedin_posts: ev('linkedin_posts', 1, 'Post published'),
    new_a_star: ev('new_a_star', 3, 'New A-star candidate'),
  }
}

const KPI_TARGETS: Record<string, number> = { posts_chased: 20, coaching_calls: 5, linkedin_posts: 2, new_a_star: 5 }

/** What quick capture saved, for tests. */
export const captured: { kind: string; values: Record<string, string> }[] = []

let sampleKpiEvents = freshSampleKpiEvents()

export function resetSampleKpis() {
  sampleKpiEvents = freshSampleKpiEvents()
}

// The quarter (32.2): no event held yet, one blog, two testimonials; the
// outputs so far. Last week every weekly target was hit.
function freshSampleQuarter(): KpiQuarter[] {
  const q = (kpi: string, position: number, total: number, target: number | null): KpiQuarter => ({ kpi, position, target, total, pmmTotal: total, hit: target === null ? null : total >= target, pmmHit: target === null ? null : total >= target, hasManual: false })
  return [
    q('events_held', 1, 0, 1), q('blogs_published', 2, 1, 3), q('testimonials', 3, 2, 3),
    q('client_meetings', 4, 4, null), q('jobs_won', 5, 1, null), q('shortlists', 6, 2, null), q('first_interviews', 7, 3, null),
    q('offers', 8, 1, null), q('placements', 9, 0, null), q('referrals_received', 10, 1, null), q('leads_passed', 11, 1, null),
  ]
}

const LAST_WEEK: Record<string, number> = { posts_chased: 22, coaching_calls: 5, linkedin_posts: 2, new_a_star: 6 }

/** The Monday of last week, as a plain date. */
function lastMondaySample(): string {
  return daysAgo(ukClock(new Date()).isoDay - 1 + 7)
}

let sampleReviews: Record<string, WeeklyReview> = {}

export function resetSampleReviews() {
  sampleReviews = {}
}

// Settings (32.4): the seven agents as seeded, a few runs, the send policies
// from 20.2, the seven targets from 9 November 2026. No keys, ever.
function hoursAgoIso(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString()
}

function freshSampleAgents(): Agent[] {
  const a = (code: string, name: string, schedule: string, over: Partial<Agent> = {}): Agent => ({
    code, name, schedule, enabled: true, modelTier: 'standard', monthlyBudget: 50, keyCreatedAt: daysAgo(10) + 'T09:00:00Z', consecutiveFailures: 0, lastRun: null, spentThisMonth: 0, ...over,
  })
  return [
    a('a1_review', 'Weekly review', 'Monday 08:17', { lastRun: { startedAt: hoursAgoIso(30), status: 'ok', itemsCreated: 1 }, spentThisMonth: 1.2 }),
    a('a2_content', 'Content engine', 'Monday 08:58 and 09:15, Thursday 09:30', { lastRun: { startedAt: hoursAgoIso(26), status: 'ok', itemsCreated: 3 }, spentThisMonth: 6.4 }),
    a('a3_jobs', 'Jobs pipeline', 'Collect Tuesday and Friday 13:00. Match Wednesday 07:41', { lastRun: { startedAt: hoursAgoIso(5), status: 'ok', itemsCreated: 4 }, spentThisMonth: 12.4 }),
    a('a4_signals', 'Relationship signals', 'Friday 12:47', { modelTier: 'light', monthlyBudget: 20, lastRun: { startedAt: hoursAgoIso(50), status: 'failed', itemsCreated: 0 }, consecutiveFailures: 1, spentThisMonth: 2.1 }),
    a('a5_followups', 'Follow-up queue', 'Monday 07:30, Thursday 07:30, weekdays 08:45 for the calendar', { lastRun: { startedAt: hoursAgoIso(2), status: 'ok', itemsCreated: 2 }, spentThisMonth: 4.8 }),
    a('a6_calls', 'Call-to-CRM', 'Monday to Thursday 19:30, Friday 16:30', { lastRun: { startedAt: hoursAgoIso(18), status: 'partial', itemsCreated: 1 }, spentThisMonth: 9.9 }),
    a('a7_events', 'Event ideas', '1st of the month', { enabled: false, monthlyBudget: null, keyCreatedAt: null }),
  ]
}

function freshSampleRuns(): Record<string, AgentRun[]> {
  const r = (id: string, h: number, status: AgentRun['status'], itemsCreated: number, summary: string | null): AgentRun => ({ id, startedAt: hoursAgoIso(h), finishedAt: status === 'running' ? null : hoursAgoIso(h - 0.2), status, itemsCreated, itemsMerged: 0, summary })
  return {
    a3_jobs: [r('r1', 5, 'ok', 4, 'Sample week'), r('r2', 29, 'ok', 2, null), r('r3', 77, 'ok', 5, null), r('r4', 101, 'partial', 1, 'One source timed out'), r('r5', 149, 'ok', 3, null)],
    a4_signals: [r('r6', 50, 'failed', 0, 'LinkedIn alerts not found'), r('r7', 218, 'ok', 5, null)],
    a1_review: [r('r8', 30, 'ok', 1, null)],
  }
}

function freshSamplePrompts(): Record<string, AgentPrompt[]> {
  return {
    a3_jobs: [
      { version: 2, body: 'Find product marketing job posts in the US that fit the ICP. Score each for fit and name the poster.', active: true, note: 'US only', createdAt: daysAgo(3) + 'T10:00:00Z' },
      { version: 1, body: 'Find product marketing job posts that fit the ICP.', active: false, note: null, createdAt: daysAgo(20) + 'T10:00:00Z' },
    ],
  }
}

function freshSamplePolicies(): SendPolicy[] {
  const p = (type: string, label: string, channel: SendPolicy['channel'], level: SendPolicy['level'], maxLevel: SendPolicy['maxLevel'], dailyCap: number | null, weeklyCap: number | null, perRunCap: number | null, requiresTemplate: boolean, over: Partial<SendPolicy> = {}): SendPolicy => ({
    type, label, channel, level, maxLevel, dailyCap, weeklyCap, perRunCap, minDaysBetweenSamePerson: 7, windowStart: '09:00', windowEnd: '17:30', requiresTemplate, paused: false, pausedReason: null, ...over,
  })
  return [
    p('thanks_after_call', 'Thank-you after a call', 'email', 'automatic', 'automatic', 15, 60, null, true),
    p('cv_request', 'CV request', 'email', 'automatic', 'automatic', 10, 40, null, true),
    p('submitted_confirmation', 'Submitted confirmation', 'email', 'automatic', 'automatic', 10, 30, null, true),
    p('interview_confirmation', 'Interview confirmation', 'email', 'one_click', 'automatic', 10, 30, null, true),
    p('prep_pack', 'Prep pack', 'email', 'one_click', 'automatic', 10, 30, null, true),
    p('aftercare_checkin', 'Aftercare check-in', 'email', 'one_click', 'one_click', 5, 10, null, true),
    p('kpi_summary', 'Monday KPI summary', 'email', 'one_click', 'automatic', 1, 1, null, true),
    p('coaching_followup', 'Coaching follow-up', 'email', 'one_click', 'one_click', 5, 15, null, true),
    p('referral_thanks', 'Referral thanks', 'email', 'one_click', 'one_click', 5, 15, null, true),
    p('client_nudge', 'Client nudge', 'email', 'one_click', 'one_click', 5, 10, null, true),
    p('event_followup', 'Event follow-up', 'email', 'one_click', 'one_click', 30, 60, null, true),
    p('intro_to_colleague', 'Intro to a colleague', 'email', 'one_click', 'one_click', 5, 10, null, false),
    p('email_reply', 'Email reply', 'email', 'draft_only', 'draft_only', null, null, null, false),
    p('league_cadence', 'League catch-up', 'email', 'draft_only', 'draft_only', null, null, null, false),
    p('signal_congrats', 'Congratulations', 'either', 'draft_only', 'draft_only', null, null, null, false),
    p('coaching_offer', 'Coaching offer', 'either', 'draft_only', 'draft_only', null, null, null, false),
    p('speaker_invite', 'Speaker invite', 'email', 'draft_only', 'draft_only', null, null, null, false),
    p('spec', 'Spec message', 'either', 'draft_only', 'draft_only', null, null, null, false),
    p('job_chase', 'Job chase', 'either', 'draft_only', 'draft_only', null, null, null, false),
    p('rejection', 'Rejection', 'email', 'draft_only', 'draft_only', null, null, null, false),
    p('linkedin_connect', 'LinkedIn connection note', 'linkedin', 'automatic', 'automatic', 10, 20, 10, true, { paused: true, pausedReason: 'LinkedIn showed a warning on Tuesday' }),
    p('linkedin_message', 'LinkedIn message', 'linkedin', 'draft_only', 'draft_only', null, null, null, false),
    p('linkedin_post', 'LinkedIn post', 'linkedin', 'draft_only', 'draft_only', null, null, null, false),
  ].sort((a, b) => a.label.localeCompare(b.label))
}

function freshSampleTargets(): Target[] {
  const t = (kpi: string, period: Target['period'], target: number): Target => ({ id: `t-${kpi}`, kpi, period, target, validFrom: '2026-11-09', validTo: null })
  return [t('posts_chased', 'week', 20), t('coaching_calls', 'week', 5), t('linkedin_posts', 'week', 2), t('new_a_star', 'week', 5), t('events_held', 'quarter', 1), t('blogs_published', 'quarter', 3), t('testimonials', 'quarter', 3)]
}

let sampleAgents = freshSampleAgents()
let sampleRuns = freshSampleRuns()
let samplePrompts = freshSamplePrompts()
let samplePolicies = freshSamplePolicies()
let sampleTargets = freshSampleTargets()
let samplePaused = false
let sampleHeld = 0

export function resetSampleSettings() {
  sampleAgents = freshSampleAgents()
  sampleRuns = freshSampleRuns()
  samplePrompts = freshSamplePrompts()
  samplePolicies = freshSamplePolicies()
  sampleTargets = freshSampleTargets()
  samplePaused = false
  sampleHeld = 0
}

/** For tests: pretend the send engine left some messages queued. */
export function setSampleHeld(n: number) {
  sampleHeld = n
}

/** The Monday after today, as a plain date. */
function nextMonday(): string {
  const c = ukClock(new Date())
  const d = new Date(`${c.date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + (8 - c.isoDay))
  return d.toISOString().slice(0, 10)
}

// Profile and Data (32.4): the seeded settings, the shared blocks, a short
// do-not-contact list and an audit trail. Find a person searches the sample
// members by name.
function freshSampleSettings(): AppSettings {
  return {
    allSendingPaused: false,
    icp: {
      sector: 'B2B SaaS',
      companySize: 'Up to about 1,000 people',
      buyer: 'VP or senior director of product marketing with 2 or 3 reports',
      locations: ['new_york', 'austin', 'boston', 'san_francisco', 'remote_us'],
      secondAngle: 'UK or European company with a US presence, global marketing head in the UK, hiring PMMs in the US',
      excluded: ['Very large companies', 'Agencies posting on behalf of clients', 'Non-US roles'],
    },
    coachingTitlePhrases: ['coaching', 'LinkedIn audit', 'resume review', 'CV review'],
    leagueDays: { premier: 18, championship: 30, leagueOne: 49 },
    health: { clientCooling: 5, clientCold: 7, candidateCooling: 3, candidateCold: 5 },
    feedback: { nudge: 2, cooling: 4, cold: 7 },
    staleAfterDays: 14,
    deckDefault: true,
    homeStats: ['needs_you', 'follow_ups', 'calls_today', 'this_week'],
    theme: 'paper',
    fontSans: 'Space Grotesk',
    fontMono: 'Space Mono',
    workingHours: { mon: ['09:00', '20:00'], tue: ['09:00', '20:00'], wed: ['09:00', '20:00'], thu: ['09:00', '20:00'], fri: ['09:00', '17:00'] },
    reviewerEmail: null,
  }
}

function freshSampleBlocks(): SharedBlock[] {
  const b = (code: string, title: string, body: string): SharedBlock => ({ code, title, body, updatedAt: daysAgo(30) + 'T09:00:00Z' })
  return [
    b('icp', 'Ideal client profile', 'Sector: B2B SaaS. Company size: up to about 1,000 people.'),
    b('voice', 'Voice rules', 'Short words. No exclamation marks. Say the thing once.'),
    b('post_format', 'Post format', 'One idea. Three short paragraphs. A question at the end.'),
    b('note_format', 'Candidate note format', 'Not written yet.'),
    b('service_standards', 'Service standards', 'Not written yet.'),
    b('confidentiality', 'Confidentiality', 'Not written yet.'),
    b('commercial_questions', 'Commercial questions', 'Not written yet.'),
  ]
}

function freshSampleBlocked(): DoNotContact[] {
  return [
    { id: 'dnc-1', name: 'Ray Pretend', company: 'Globex Fiction', scope: 'person', reason: 'Asked not to be contacted', createdAt: daysAgo(12) + 'T11:00:00Z' },
    { id: 'dnc-2', name: null, company: 'Hooli Sample', scope: 'company', reason: 'Client asked for a pause', createdAt: daysAgo(40) + 'T11:00:00Z' },
  ]
}

function freshSampleAudit(): AuditEntry[] {
  const e = (id: number, h: number, action: string, targetTable: string | null, detail: Record<string, unknown> | null): AuditEntry => ({ id, at: hoursAgoIso(h), actor: 'owner@example.com', action, targetTable, detail })
  return [
    e(9, 1, 'sign-in', null, null),
    e(8, 5, 'manual KPI correction', 'kpi_events', { kpi: 'posts_chased', amount: -1, reason: 'Counted twice' }),
    e(7, 26, 'send level change', 'send_policies', { type: 'prep_pack', from: 'one_click', to: 'automatic' }),
    e(6, 30, 'target changed', 'targets', { kpi: 'posts_chased', target: 22 }),
    e(5, 52, 'sign-in', null, null),
    e(4, 80, 'stop switch off', 'app_settings', null),
    e(3, 81, 'stop switch on', 'app_settings', null),
    e(2, 100, 'export', null, { kind: 'everything' }),
    e(1, 120, 'sign-in', null, null),
  ]
}

let sampleSettings = freshSampleSettings()
let sampleBlocks = freshSampleBlocks()
let sampleBlocked = freshSampleBlocked()
let sampleAudit = freshSampleAudit()
let sampleDeleted = new Set<string>()

export function resetSampleProfile() {
  sampleSettings = freshSampleSettings()
  sampleBlocks = freshSampleBlocks()
  sampleBlocked = freshSampleBlocked()
  sampleAudit = freshSampleAudit()
  sampleDeleted = new Set()
}

function audit(action: string, targetTable: string | null, detail: Record<string, unknown> | null) {
  sampleAudit.unshift({ id: (sampleAudit[0]?.id ?? 0) + 1, at: new Date().toISOString(), actor: 'owner@example.com', action, targetTable, detail })
}

function sampleKpiWeeks(): KpiWeek[] {
  return Object.entries(KPI_TARGETS).map(([kpi, target]) => {
    const rows = sampleKpiEvents[kpi] ?? []
    const total = rows.reduce((n, r) => n + r.amount, 0)
    const pmmTotal = rows.filter((r) => r.isPmm).reduce((n, r) => n + r.amount, 0)
    return { kpi, target, total, hit: total >= target, pmmTotal, pmmHit: pmmTotal >= target, hasManual: rows.some((r) => r.manual) }
  })
}

export function resetSampleSignals() {
  sampleSignals = freshSampleSignals()
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
    const today = ukClock(new Date()).date
    const due = sampleFollowUps.filter((f) => f.status === 'open' && f.direction === 'owed' && f.dueOn <= today)
    const late = due.filter((f) => f.dueOn < today).sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    return {
      due: due.length,
      late: late.length,
      lateFromDay: late.length > 0 ? days[new Date(`${late[0].dueOn}T12:00:00Z`).getUTCDay()] : null,
    }
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
    const weeks = sampleKpiWeeks()
    return { hit: weeks.filter((w) => w.pmmHit).length, total: weeks.length }
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

  async followUps() {
    return sampleFollowUps.filter((f) => f.status === 'open' || f.status === 'snoozed').map((f) => ({ ...f, message: f.message ? { ...f.message } : null }))
  },
  async setFollowUpStatus(id, status, extra = {}) {
    const found = sampleFollowUps.find((f) => f.id === id)
    if (!found) throw new Error('No such follow-up')
    if (status === 'snoozed' && !extra.snoozedUntil) throw new Error('A snooze needs a date')
    found.status = status
    found.snoozedUntil = status === 'snoozed' ? (extra.snoozedUntil ?? null) : null
    if (extra.draft !== undefined && found.message) found.message.body = extra.draft
  },
  async redateFollowUps(ids, dueOn) {
    for (const f of sampleFollowUps) if (ids.includes(f.id)) f.dueOn = dueOn
  },
  async recordFollowUpBlock(minutes) {
    sampleBlockMinutes = minutes
  },

  async coachingSessions() {
    return sampleCoaching.map((s) => ({ ...s, answers: { ...s.answers } }))
  },
  async markCoachingFollowedUp(id) {
    const found = sampleCoaching.find((s) => s.id === id)
    if (!found) throw new Error('No such session')
    found.followedUp = true
  },
  async referrals() {
    return sampleReferrals.filter((r) => r.stage !== 'not_relevant' && r.stage !== 'added_to_league').map((r) => ({ ...r }))
  },
  async setReferralStage(id, stage) {
    const found = sampleReferrals.find((r) => r.id === id)
    if (!found) throw new Error('No such referral')
    found.stage = stage
    if (stage === 'contacted') found.contactedOn ??= ukClock(new Date()).date
  },
  async widerLeads() {
    return sampleWider.filter((w) => ['spotted', 'passed', 'meeting_booked'].includes(w.status)).map((w) => ({ ...w }))
  },
  async passWiderLead(id, colleague, split) {
    const found = sampleWider.find((w) => w.id === id)
    if (!found) throw new Error('No such lead')
    if (!colleague.trim() || !split.trim()) throw new Error('Passing needs a colleague and a split')
    found.status = 'passed'
    found.passedTo = colleague
    found.splitNote = split
    found.passedOn = ukClock(new Date()).date
  },
  async setWiderLeadStatus(id, status) {
    const found = sampleWider.find((w) => w.id === id)
    if (!found) throw new Error('No such lead')
    found.status = status
  },

  async lists() {
    return sampleLists.map((l) => ({ ...l }))
  },
  async createList({ name, key, position }) {
    if (sampleLists.some((l) => l.key === key)) throw new Error('That list exists')
    sampleLists.push({ id: `list-${key}`, key, name, kind: 'other', seats: 50, colour: 'mist', archived: false, position })
  },
  async updateList(id, patch) {
    const l = sampleLists.find((x) => x.id === id)
    if (!l) throw new Error('No such list')
    Object.assign(l, patch)
  },
  async setMemberGroup(memberId, group) {
    const m = sampleMembers.find((x) => x.id === memberId)
    if (!m) throw new Error('No such member')
    m.groupName = group.trim() || null
  },
  async members() {
    return sampleMembers.map((m) => ({ ...m }))
  },
  async touches(personId, limit = 5) {
    return (sampleTouches[personId] ?? []).slice(0, limit).map((t) => ({ ...t }))
  },
  async logReply(personId) {
    const today = ukClock(new Date()).date
    const list = (sampleTouches[personId] ??= [])
    if (!list.some((t) => t.touchedOn === today && t.kind === 'message_replied')) {
      list.unshift({ id: `t-${personId}-${today}`, touchedOn: today, channel: 'linkedin', kind: 'message_replied', note: null })
    }
    // What LEA-2 does on the server.
    const m = sampleMembers.find((x) => x.personId === personId)
    if (m) {
      m.lastTouchOn = today
      m.nextDueOn = plusDays(today, cadence[m.tier])
      m.daysLate = -cadence[m.tier]
      m.state = 'fine'
      m.missedCycles = 0
    }
  },
  async moveTier(memberId, tier, reason) {
    const m = sampleMembers.find((x) => x.id === memberId)
    if (!m) throw new Error('No such member')
    m.tier = tier
    m.why = reason
    if (m.lastTouchOn) m.nextDueOn = plusDays(m.lastTouchOn, cadence[tier])
  },
  async removeFromList(memberId) {
    const at = sampleMembers.findIndex((x) => x.id === memberId)
    if (at < 0) throw new Error('No such member')
    sampleMembers.splice(at, 1)
  },
  async setDoNotContact(personId) {
    sampleMembers = sampleMembers.filter((m) => m.personId !== personId)
    for (const f of sampleFollowUps) if (f.personId === personId && (f.status === 'open' || f.status === 'snoozed')) f.status = 'closed'
  },
  async saveNotes(personId, notes) {
    const m = sampleMembers.find((x) => x.personId === personId)
    if (m) m.notesForNextContact = notes
  },
  async addPerson({ name, title, company, listId, tier, why }) {
    const id = `p-${name.toLowerCase().replace(/\s+/g, '-')}`
    sampleMembers.push(member({ id: `m-${id}`, personId: id, name: name.trim(), title: title.trim() || null, company: company.trim() || null, listId, tier, why: why.trim() || null, lastTouchOn: null }))
  },

  async appSettings() {
    return { ...sampleSettings, icp: { ...sampleSettings.icp }, homeStats: [...sampleSettings.homeStats] }
  },
  async updateAppSettings(patch) {
    sampleSettings = { ...sampleSettings, ...patch }
    if (patch.reviewerEmail !== undefined) sampleSettings.reviewerEmail = patch.reviewerEmail ? patch.reviewerEmail.trim().toLowerCase() : null
  },
  async sharedBlocks() {
    return sampleBlocks.map((b) => ({ ...b }))
  },
  async updateSharedBlock(code, body) {
    const b = sampleBlocks.find((x) => x.code === code)
    if (!b) throw new Error('No such block')
    b.body = body
    b.updatedAt = new Date().toISOString()
  },
  async doNotContact() {
    return sampleBlocked.map((b) => ({ ...b }))
  },
  async addDoNotContact({ name, company, scope, reason }) {
    sampleBlocked.unshift({ id: `dnc-${sampleBlocked.length + 1}`, name: name.trim() || null, company: company.trim() || null, scope, reason: reason.trim() || null, createdAt: new Date().toISOString() })
  },
  async auditLog(limit = 50) {
    return sampleAudit.slice(0, limit).map((e) => ({ ...e }))
  },
  async personFind(query) {
    const q = query.trim().toLowerCase()
    if (q.length < 2) throw new Error('Type at least two characters')
    audit('person search', 'people', { query_length: q.length })
    const seen = new Set<string>()
    const found: FoundPerson[] = []
    for (const m of sampleMembers) {
      if (sampleDeleted.has(m.personId) || seen.has(m.personId) || !m.name.toLowerCase().includes(q)) continue
      seen.add(m.personId)
      const touches = (sampleTouches[m.personId] ?? []).length
      found.push({ id: m.personId, displayName: m.name, displayTitle: m.title, displayCompany: m.company, counts: { league_members: 1, ...(touches ? { touches } : {}) } })
    }
    return found
  },
  async personExport(personId) {
    const member = sampleMembers.find((m) => m.personId === personId)
    if (!member) throw new Error('No such person')
    audit('export', 'people', { kind: 'person' })
    return { exported_at: new Date().toISOString(), person: { id: personId, display_name: member.name }, league_members: [member], touches: sampleTouches[personId] ?? [] }
  },
  async personDelete(personId, confirm) {
    if (confirm !== 'DELETE') throw new Error('Type DELETE to confirm')
    const mine = sampleMembers.filter((m) => m.personId === personId)
    if (mine.length === 0) throw new Error('No such person')
    const counts = { league_members: mine.length, touches: (sampleTouches[personId] ?? []).length, people: 1 }
    sampleMembers = sampleMembers.filter((m) => m.personId !== personId)
    delete sampleTouches[personId]
    sampleDeleted.add(personId)
    audit('person delete', 'people', counts)
    return { ...counts, crm: 'The CRM record was not touched' }
  },
  async exportEverything() {
    audit('export', null, { kind: 'everything' })
    return { exported_at: new Date().toISOString(), people: sampleMembers.map((m) => ({ id: m.personId, display_name: m.name })), targets: sampleTargets, settings: sampleSettings }
  },
  async agents() {
    return sampleAgents.map((a) => ({ ...a, lastRun: a.lastRun ? { ...a.lastRun } : null }))
  },
  async setAgentEnabled(code, enabled) {
    const a = sampleAgents.find((x) => x.code === code)
    if (!a) throw new Error('No such agent')
    a.enabled = enabled
  },
  async agentRuns(code) {
    return (sampleRuns[code] ?? []).map((r) => ({ ...r }))
  },
  async agentPrompts(code) {
    return (samplePrompts[code] ?? []).map((p) => ({ ...p }))
  },
  async saveAgentPrompt(code, body, note) {
    if (!body.trim()) throw new Error('A prompt needs some text')
    const mine = (samplePrompts[code] ??= [])
    const version = (mine[0]?.version ?? 0) + 1
    for (const p of mine) p.active = false
    mine.unshift({ version, body, active: true, note: note.trim() || null, createdAt: new Date().toISOString() })
    return version
  },
  async activateAgentPrompt(code, version) {
    const mine = samplePrompts[code] ?? []
    if (!mine.some((p) => p.version === version)) throw new Error('No such version')
    for (const p of mine) p.active = p.version === version
  },
  async createAgentKey(code) {
    const a = sampleAgents.find((x) => x.code === code)
    if (!a) throw new Error('No such agent')
    a.keyCreatedAt = new Date().toISOString()
    return 'sample' + 'f'.repeat(58)
  },
  async revokeAgentKey(code) {
    const a = sampleAgents.find((x) => x.code === code)
    if (!a) throw new Error('No such agent')
    a.keyCreatedAt = null
  },
  async requestRun(code) {
    if (!sampleAgents.some((x) => x.code === code)) throw new Error('No such agent')
  },
  async sendingPaused() {
    return samplePaused
  },
  async setSendingPaused(paused) {
    samplePaused = paused
  },
  async heldMessages() {
    return sampleHeld
  },
  async releaseHeld() {
    sampleHeld = 0
  },
  async sendPolicies() {
    return samplePolicies.map((p) => ({ ...p }))
  },
  async updateSendPolicy(type, patch) {
    const p = samplePolicies.find((x) => x.type === type)
    if (!p) throw new Error('No such type')
    if (patch.level !== undefined) p.level = patch.level
    if (patch.dailyCap !== undefined) p.dailyCap = patch.dailyCap
    if (patch.weeklyCap !== undefined) p.weeklyCap = patch.weeklyCap
    if (patch.perRunCap !== undefined) p.perRunCap = patch.perRunCap
    if (patch.windowStart !== undefined) p.windowStart = patch.windowStart
    if (patch.windowEnd !== undefined) p.windowEnd = patch.windowEnd
    if (patch.paused !== undefined) {
      p.paused = patch.paused
      if (!patch.paused) p.pausedReason = null
    }
  },
  async targets() {
    return sampleTargets.map((t) => ({ ...t }))
  },
  async setTarget(kpi, period, target) {
    const from = nextMonday()
    const dayBefore = (() => {
      const d = new Date(`${from}T12:00:00Z`)
      d.setUTCDate(d.getUTCDate() - 1)
      return d.toISOString().slice(0, 10)
    })()
    for (const t of sampleTargets) {
      if (t.kpi === kpi && t.period === period && t.validFrom < from && (t.validTo === null || t.validTo >= from)) t.validTo = dayBefore
    }
    const waiting = sampleTargets.find((t) => t.kpi === kpi && t.period === period && t.validFrom === from)
    if (waiting) waiting.target = target
    else sampleTargets.push({ id: `t-${kpi}-${from}`, kpi, period, target, validFrom: from, validTo: null })
    return from
  },
  async systemWeeks() {
    return [
      { week: lastMondaySample(), runs: 11, failed: 0, items: 63, sent: 14, failedDetail: null },
      { week: thisMonday(), runs: 6, failed: 1, items: 12, sent: 3, failedDetail: 'Relationship signals on Friday' },
    ]
  },
  async kpiQuarter() {
    return freshSampleQuarter()
  },
  async followUpsQuarter() {
    return { week: null, completed: 6, onTime: 5 }
  },
  async bdFunnel() {
    const since = daysAgo(56)
    const after = (d: string | null) => d !== null && d >= since
    return {
      found: sampleLeads.filter((l) => after(l.firstSeenOn)).length,
      chased: sampleLeads.filter((l) => after(l.chasedOn)).length,
      replied: sampleLeads.filter((l) => after(l.repliedOn)).length,
      meetings: sampleLeads.filter((l) => after(l.meetingOn)).length,
      won: sampleLeads.filter((l) => after(l.wonOn)).length,
    }
  },
  async kpiWeeks() {
    const monday = thisMonday()
    const lastMonday = lastMondaySample()
    const last: KpiWeekRow[] = Object.entries(LAST_WEEK).map(([kpi, total]) => {
      const target = KPI_TARGETS[kpi]
      return { kpi, week: lastMonday, target, total, hit: total >= target, pmmTotal: total, pmmHit: total >= target, hasManual: false }
    })
    return [...last, ...sampleKpiWeeks().map((w) => ({ ...w, week: monday }))]
  },
  async kpiOutputWeeks() {
    const rows: KpiOutputWeek[] = [
      { kpi: 'shortlists', week: lastMondaySample(), total: 1, pmmTotal: 1 },
      { kpi: 'first_interviews', week: lastMondaySample(), total: 2, pmmTotal: 2 },
      { kpi: 'leads_passed', week: thisMonday(), total: 1, pmmTotal: 0 },
    ]
    return rows
  },
  async followUpsWeeks() {
    return [{ week: lastMondaySample(), completed: 6, onTime: 5 }]
  },
  async weeklyReview(week) {
    const r = sampleReviews[week]
    return r ? { ...r } : null
  },
  async saveWeeklyReview(week, fields: ReviewFields) {
    const before = sampleReviews[week]
    sampleReviews[week] = { week, followupBlockMinutes: before?.followupBlockMinutes ?? null, heldOn: before?.heldOn ?? null, ...fields }
  },
  async capture(kind, values) {
    const v = (k: string) => (values[k] ?? '').trim()
    if (kind === 'number') {
      await this.correctKpi(v('kpi'), Number(v('amount')), v('reason'))
      return { route: '/numbers/this-week' }
    }
    if (kind === 'follow_up') {
      sampleFollowUps.unshift({ ...sampleFollowUps[0], id: `fu-${Date.now()}`, personName: v('personName'), company: null, reason: v('reason'), dueOn: v('dueOn'), status: 'open', direction: 'owed', kind: 'other', message: null })
      return { route: '/leads/follow-ups?view=list' }
    }
    captured.push({ kind, values: { ...values } })
    return { route: kind === 'referral' ? '/leads/referrals' : kind === 'idea' ? '/inbox?view=list' : '/leads/jobs' }
  },
  async search(query) {
    const q = query.trim().toLowerCase()
    const hits: SearchHit[] = []
    for (const m of sampleMembers.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 3)) {
      const list = sampleLists.find((l) => l.id === m.listId)
      hits.push({ kind: 'person', id: m.personId, title: m.name, detail: [m.title, m.company].filter(Boolean).join(', ') || null, route: `/people/${(list?.key ?? 'senior_network').replace(/_/g, '-')}?card=person:${m.personId}` })
    }
    for (const l of sampleLeads.filter((x) => `${x.role} ${x.company}`.toLowerCase().includes(q)).slice(0, 3)) hits.push({ kind: 'job_lead', id: l.id, title: `${l.role} at ${l.company}`, detail: null, route: `/leads/jobs?card=job:${l.id}` })
    for (const f of sampleFollowUps.filter((x) => x.status === 'open' && x.personName.toLowerCase().includes(q)).slice(0, 3)) hits.push({ kind: 'follow_up', id: f.id, title: f.personName, detail: f.reason, route: `/leads/follow-ups?view=list&card=followup:${f.id}` })
    return hits
  },
  async kpiThisWeek() {
    return sampleKpiWeeks()
  },
  async kpiStreaks() {
    const monday = thisMonday()
    return Object.keys(KPI_TARGETS).map((kpi) => ({ kpi, weeksHistory: 0, firstWeek: monday, hitLast4: 0, pmmHitLast4: 0, best12: 0, pmmBest12: 0 }))
  },
  async kpiEvents(kpi) {
    return (sampleKpiEvents[kpi] ?? []).map((r) => ({ ...r })).reverse()
  },
  async correctKpi(kpi, amount, reason) {
    if (!reason.trim()) throw new Error('A correction needs a reason')
    const rows = (sampleKpiEvents[kpi] ??= [])
    rows.push({ id: `${kpi}-m${rows.length + 1}`, label: 'Correction', amount, manual: true, reason: reason.trim(), isPmm: true, happenedAt: new Date().toISOString() })
  },

  async signals() {
    return sampleSignals.filter((s) => s.status === 'new').map((s) => ({ ...s }))
  },
  async setSignalStatus(id, status) {
    const found = sampleSignals.find((s) => s.id === id)
    if (!found) throw new Error('No such signal')
    found.status = status
  },
  async addSignalToList(signal, listId) {
    const found = sampleSignals.find((s) => s.id === signal.id)
    if (!found) throw new Error('No such signal')
    const personId = signal.personId ?? `p-${(signal.personName ?? 'unknown').toLowerCase().replace(/\s+/g, '-')}`
    sampleMembers.push(member({ id: `m-${personId}`, personId, name: signal.personName ?? 'Unknown', title: signal.title, company: signal.company, city: signal.city, listId, tier: 'league_one', why: `Signal: ${signal.signalType.replace('_', ' ')}`, lastTouchOn: null, liveSignal: signal.signalType }))
    found.status = 'added_to_league'
    found.personId = personId
    found.onList = true
  },
}

/** Tests only. */
export function sampleFollowUpBlockMinutes(): number | null {
  return sampleBlockMinutes
}
