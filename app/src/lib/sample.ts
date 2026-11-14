// Invented sample data for building screens with no database (section 4.3,
// Local). Every name here is made up. Nothing in this file is real.

import type { CoachingSession, DataSource, FollowUp, InboxAction, InboxItem, JobLead, Member, PeopleList, Referral, Touch, WiderLead } from './data'
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

export const sampleLists: PeopleList[] = [
  { id: 'list-senior', key: 'senior_network', name: 'Senior network', kind: 'leader', seats: 50 },
  { id: 'list-top', key: 'top_candidates', name: 'Top candidates', kind: 'a_star', seats: 50 },
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
let sampleTouches: Record<string, Touch[]> = {
  'p-ben': [
    { id: 't1', touchedOn: daysAgo(4), channel: 'phone', kind: 'call', note: 'Talked about the Boston role' },
    { id: 't2', touchedOn: daysAgo(40), channel: 'linkedin', kind: 'message_replied', note: null },
  ],
  'p-cara': [{ id: 't3', touchedOn: daysAgo(45), channel: 'meeting', kind: 'meeting', note: 'Quarterly catch-up' }],
}

export function resetSampleMembers() {
  sampleMembers = freshSampleMembers()
  sampleTouches = { 'p-ben': sampleTouches['p-ben'].slice(0, 2) }
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
}

/** Tests only. */
export function sampleFollowUpBlockMinutes(): number | null {
  return sampleBlockMinutes
}
