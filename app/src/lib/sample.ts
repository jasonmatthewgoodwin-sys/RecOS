// Invented sample data for building screens with no database (section 4.3,
// Local). Every name here is made up. Nothing in this file is real.

import { composeLink } from './send'
import { needsYouCount, type Task, type TaskChat, type TaskEdits } from './tasks'
import type {
  SpokenPerson, SpecRequest, BehalfRow,
  SendLogRow, Template,
  Account,
  AStarSuggestion,
  Call,
  Campaign,
  ContentItem,
  Search,
  SearchCandidate,
  SearchNote,
  Problem,
  ProblemNote,
  ProblemScreenshot, Agent, Connection, ConnectionProvider, AgentPrompt, AgentRun, AppSettings, AuditEntry, CoachingSession, DataSource, DoNotContact, FoundPerson, SharedBlock, FollowUp, InboxAction, InboxFolder, InboxItem, JobLead, KpiEvent, KpiOutputWeek, KpiQuarter, KpiWeek, KpiWeekRow, Member, PeopleList, Referral, ReviewFields, SendPolicy, Signal, Target, Touch, WeeklyReview, WiderLead } from './data'
import { inboxStatusAfter } from './data'
import { splitCopy, topicFrom } from './calendar'
import type { SearchHit } from './capture'
import { shiftDate, ukClock } from './time'

function todayAt(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString()
}

/** A UK clock time on a plain date, as an ISO timestamp (9.5 is 09:30). */
function ukAt(date: string, hour: number): string {
  const offset = ukClock(new Date(`${date}T12:00:00Z`)).hour - 12
  return new Date(Date.parse(`${date}T00:00:00Z`) + (hour - offset) * 3_600_000).toISOString()
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
    outreachStage: 'found',
    outreachConnectionOn: null,
    outreachConnectedOn: null,
    outreachMessagedOn: null,
    outreachRepliedOn: null,
    replyOutcome: null,
    connectionNote: null,
    outreachNote: null,
    firstMessage: null,
    ukToUs: false,
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
      outreachStage: 'connection_sent',
      outreachConnectionOn: daysAgo(1),
      connectionNote: "I'm the only product marketing headhunter in the world. Let's connect.",
      ukToUs: true,
    }),
    lead({
      id: 'job-contoso',
      company: 'Contoso Demo Inc',
      role: 'Director of PMM',
      level: 'director',
      city: 'boston',
      sources: ['alex_leads'],
      sourceUrls: ['', 'https://example.com/advert/contoso'],
      fitScore: 82,
      fitReason: 'Fits the ICP. The hiring leader is on the league',
      matched: [
        { personId: 'person-ben', name: 'Ben Sample', reason: 'Director level, Boston, launched two platforms' },
        { personId: 'person-cara', name: 'Cara Placeholder', reason: 'Knows the hiring leader' },
      ],
      draft: 'Hi, I saw you are hiring a Director of PMM. I have two directors in Boston worth a look. Open to a short call?',
      firstSeenOn: daysAgo(1),
      posterName: 'Hal Sample',
      posterTitle: 'CMO',
      outreachStage: 'connected',
      outreachConnectionOn: daysAgo(1),
      outreachConnectedOn: daysAgo(0),
      connectMessageId: 'm-connect-contoso',
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
      connectMessageId: 'm-connect-globex',
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
      sources: ['alex_leads'],
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
      sources: ['alex_leads'],
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
      sources: ['alex_leads'],
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
  sampleFolders = freshSampleFolders()
}

// The owner's own Inbox folders (migration 0058). One to start, empty.
export function freshSampleFolders(): InboxFolder[] {
  return [{ id: 'folder-1', name: 'Hold for later', position: 0 }]
}

let sampleFolders = freshSampleFolders()
let sampleFolderSeq = 1

function folderNameTaken(name: string, except?: string): boolean {
  const key = name.trim().toLowerCase()
  return sampleFolders.some((f) => f.id !== except && f.name.trim().toLowerCase() === key)
}

function checkFolderName(name: string, except?: string) {
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > 40) throw new Error('A name is 1 to 40 characters')
  if (folderNameTaken(trimmed, except)) throw new Error('That name is taken')
}

type SampleMessage = Omit<NonNullable<FollowUp['message']>, 'state'> & { state?: string }
function fu(over: Partial<Omit<FollowUp, 'message'>> & { message?: SampleMessage | null } & Pick<FollowUp, 'id' | 'personName' | 'kind' | 'reason' | 'dueOn'>): FollowUp {
  const { message, ...rest } = over
  return {
    personId: null,
    company: null,
    source: 'call',
    direction: 'owed',
    status: 'open',
    snoozedUntil: null,
    createdAt: hoursAgo(30),
    ...rest,
    message: message ? { ...message, state: message.state ?? 'draft' } : null,
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
    { id: 'rf-hal', referredName: 'Hal Hypothetical', referredCompany: 'Northwind Sample Co', referredTitle: 'Group PMM', referredById: 'p-eve', referredByName: 'Eve Invented', context: 'Worked together before. Said to be looking.', kind: 'person', stage: 'new', thanked: false, receivedOn: daysAgo(3), contactedOn: null, hiringManagerName: null, hiringManagerUrl: null, sourcedVia: null, jobOpen: null, jobLeadId: null },
    { id: 'rf-pat', referredName: 'Pat Example', referredCompany: 'Globex Fiction', referredTitle: 'Head of Marketing', referredById: 'p-dev', referredByName: 'Dev Madeup', context: 'Hiring two PMMs in the new year.', kind: 'company', stage: 'new', thanked: false, receivedOn: daysAgo(1), contactedOn: null, hiringManagerName: null, hiringManagerUrl: null, sourcedVia: null, jobOpen: null, jobLeadId: null },
    { id: 'rf-quin', referredName: 'Quin Sample', referredCompany: 'Umbrella Sample', referredTitle: null, referredById: 'p-finn', referredByName: 'Finn Fictional', context: 'Mentioned in passing.', kind: 'person', stage: 'contacted', thanked: true, receivedOn: daysAgo(9), contactedOn: daysAgo(6), hiringManagerName: null, hiringManagerUrl: null, sourcedVia: null, jobOpen: null, jobLeadId: null },
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
    profileSummary: null,
    profilePulledAt: null,
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
    member({ id: 'm-ada', personId: 'p-ada', name: 'Ada Example', title: 'Senior PMM', company: 'Northwind Sample Co', city: 'new_york', listId: 'list-top', tier: 'premier', why: 'Senior PMM, open to a move', lastTouchOn: daysAgo(2), profileUrl: 'https://example.com/in/ada', profileSummary: 'Senior PMM at Northwind Sample Co, New York. Eight years in B2B SaaS, launches and pricing. Posts about positioning.', profilePulledAt: `${daysAgo(3)}T07:00:00Z` }),
    member({ id: 'm-dev', personId: 'p-dev', name: 'Dev Madeup', title: 'Product Marketing Manager', company: 'Globex Fiction', city: 'remote_us', listId: 'list-top', tier: 'championship', why: 'Strong on launches', lastTouchOn: daysAgo(31) }),
    member({ id: 'm-finn', personId: 'p-finn', name: 'Finn Fictional', title: 'PMM Lead', company: 'Umbrella Sample', city: 'new_york', listId: 'list-top', tier: 'league_one', why: 'Placed once, keeps in touch', lastTouchOn: null, addedOn: daysAgo(120), missedCycles: 2 }),
    member({ id: 'm-oli', personId: 'p-oli', name: 'Oli Fictional', title: 'Product Marketing Manager', company: 'Hooli Pretend', listId: 'list-top', tier: 'championship', why: 'Coached, very sharp', lastTouchOn: daysAgo(9) }),
    member({ id: 'm-pat', personId: 'p-pat', name: 'Pat Example', title: 'Head of PMM', company: 'Globex Fiction', listId: 'list-top', tier: 'premier', why: 'Could run a team anywhere', lastTouchOn: daysAgo(16) }),
    member({ id: 'm-quin', personId: 'p-quin', name: 'Quin Sample', title: 'Senior PMM', company: 'Umbrella Sample', listId: 'list-top', tier: 'premier', why: 'Two offers last time', lastTouchOn: daysAgo(5) }),
    member({ id: 'm-rae', personId: 'p-rae', name: 'Rae Placeholder', title: 'PMM', company: 'Wonka Imaginary Ltd', listId: 'list-top', tier: 'league_one', why: 'Rising', lastTouchOn: daysAgo(50) }),
  ]
}

let sampleMembers = freshSampleMembers()
/** Profile pulls asked for, for tests. */
export const pullsAsked: string[] = []
function freshSampleTouches(): Record<string, Touch[]> {
  return {
    'p-ben': [
      { id: 't1', touchedOn: daysAgo(4), channel: 'phone', kind: 'call', note: 'Talked about the Boston role', sourceUrl: 'https://notes.granola.ai/d/sample-ben-call' },
      { id: 't0', touchedOn: daysAgo(6), channel: 'email', kind: 'message_replied', note: 'Replied about Thursday', sourceUrl: 'https://outlook.office.com/mail/inbox/id/SAMPLE-BEN-REPLY' },
      { id: 't2', touchedOn: daysAgo(40), channel: 'linkedin', kind: 'message_replied', note: null, sourceUrl: 'https://www.linkedin.com/messaging/thread/sample-ben/' },
    ],
    'p-cara': [{ id: 't3', touchedOn: daysAgo(45), channel: 'meeting', kind: 'meeting', note: 'Quarterly catch-up', sourceUrl: null }],
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
    { id: 'sig-ben', personId: 'p-ben', personName: 'Ben Sample', company: 'Contoso Demo Inc', title: 'VP Product Marketing', city: 'boston', signalType: 'promoted', strength: 3, detail: 'Now VP. Likely to build a team.', source: 'linkedin_alert', sourceUrl: 'https://example.com/in/ben', seenOn: daysAgo(1), status: 'new', onList: true, ukToUs: false },
    { id: 'sig-gia', personId: null, personName: 'Gia Imaginary', company: 'Initech Mock', title: 'Head of Marketing', city: 'san_francisco', signalType: 'new_role', strength: 3, detail: 'Started as Head of Marketing this month.', source: 'linkedin_alert', sourceUrl: 'https://example.com/in/gia', seenOn: daysAgo(3), status: 'new', onList: false, ukToUs: false },
    { id: 'sig-sol', personId: null, personName: 'Sol Example', company: 'Stark Sample', title: 'CMO', city: null, signalType: 'company_raised', strength: 3, detail: 'Series C announced on Tuesday.', source: 'alex_leads', sourceUrl: null, seenOn: daysAgo(2), status: 'new', onList: false, ukToUs: false },
    { id: 'sig-hal', personId: null, personName: 'Hal Hypothetical', company: 'Northwind Sample Co', title: 'Group PMM', city: 'new_york', signalType: 'open_to_work', strength: 2, detail: 'Open to work badge.', source: 'linkedin_alert', sourceUrl: null, seenOn: daysAgo(5), status: 'new', onList: false, ukToUs: false },
    { id: 'sig-tam', personId: null, personName: 'Tam Placeholder', company: 'Wonka Imaginary Ltd', title: 'Director of PMM', city: 'london', signalType: 'left_company', strength: 2, detail: 'Left after four years.', source: 'linkedin_alert', sourceUrl: null, seenOn: daysAgo(9), status: 'new', onList: false, ukToUs: true },
  ]
}

let sampleSignals = freshSampleSignals()

// Content (31.2): three unreviewed drafts, one approved, one posted, one idea.
const sampleBody = 'The brief says senior. The interview loop says junior. The hiring manager wants both and the budget says neither.\nFix the brief before the first call and the rest of the search takes half the time.\nThe best briefs I see answer three questions: what the first ninety days look like, who the person reports to, and what good looks like at month six.'
export function freshSampleContent(): ContentItem[] {
  const base: ContentItem = {
    id: '', kind: 'linkedin_post', runSource: 'calls', angle: 'hiring_manager', topic: '', hook: null, body: sampleBody, closeLine: 'Fix the brief first.', hashtags: ['productmarketing'],
    dataPoint: null, dataPointUrl: null, promptedBy: null, formatOk: true, formatReason: null, rank: 0, status: 'draft', heldReason: null,
    plannedFor: null, postedOn: null, postUrl: null, impressions: null, comments: null, inboundMessages: null, eventType: null, eventTime: null, searchId: null, requestedOn: null, receivedOn: null, usedWhere: null, createdAt: `${daysAgo(1)}T07:00:00Z`,
  }
  return [
    { ...base, id: 'c1', runSource: 'recruiting_news', angle: 'talent_market', topic: 'PMM job posts asking for AI tooling', hook: 'Four in ten PMM job posts now ask for AI tooling.', dataPoint: '41% of PMM roles now ask for AI tooling', dataPointUrl: 'https://example.com/report', rank: 75, hashtags: ['productmarketing', 'hiring'] },
    { ...base, id: 'c2', topic: 'Why PMM hires stall at the brief', hook: 'Most PMM hires stall before the first interview.', promptedBy: 'A call on Tuesday', rank: 65 },
    { ...base, id: 'c3', runSource: 'pmm_community', angle: 'candidate', topic: 'What a PMM portfolio should show', hook: 'Your portfolio should show the decision, not the deck.', body: 'Show the decision you shaped, the evidence you used and what happened next. A deck is the artefact. The decision is the work.', closeLine: 'Lead with the decision.', dataPoint: 'Two in three PMM hiring managers ask for a portfolio', dataPointUrl: 'https://example.com/survey', formatOk: false, formatReason: 'body 32 words, under 40', rank: 40, createdAt: `${daysAgo(2)}T07:00:00Z` },
    { ...base, id: 'c4', topic: 'Three questions a CMO should ask before hiring a PMM', hook: 'Three questions a CMO should ask before hiring a PMM.', status: 'approved', rank: 60, createdAt: `${daysAgo(5)}T07:00:00Z` },
    { ...base, id: 'c5', topic: 'The best PMM hires this year', hook: 'The best PMM hires I see this year have one thing in common.', status: 'posted', postedOn: daysAgo(2), postUrl: 'https://example.com/post', impressions: 1200, comments: 14, inboundMessages: 3, rank: 70, createdAt: `${daysAgo(9)}T07:00:00Z` },
    { ...base, id: 'c7', topic: 'Three questions a CMO should ask before hiring a PMM', hook: 'Three questions a CMO should ask before hiring a PMM.', status: 'planned', plannedFor: daysAgo(-1), rank: 55, createdAt: `${daysAgo(4)}T07:00:00Z` },
    { ...base, id: 'c8', kind: 'event', runSource: 'manual', angle: null, topic: 'PMM breakfast on pricing pages', body: 'Eight seats at the club. Bring the pricing page data point.', closeLine: null, hashtags: [], status: 'planned', plannedFor: daysAgo(-6), eventType: 'breakfast', eventTime: '08:30', createdAt: `${daysAgo(7)}T07:00:00Z` },
    { ...base, id: 'c9', kind: 'testimonial', runSource: null, angle: null, topic: 'Testimonial from Northwind Sample Co', hook: 'Would you write a few lines on how the search went?', body: null, closeLine: null, hashtags: [], status: 'approved', requestedOn: daysAgo(5), searchId: 's-northwind', createdAt: `${daysAgo(12)}T07:00:00Z` },
    { ...base, id: 'c10', kind: 'testimonial', runSource: null, angle: null, topic: 'Testimonial from the candidate, Senior PMM', hook: 'Would you write a few lines on how we worked together?', body: 'Jason found the role I did not know I wanted, and told me the truth at every step.', closeLine: null, hashtags: [], status: 'posted', requestedOn: daysAgo(20), receivedOn: daysAgo(9), usedWhere: 'Website', searchId: 's-northwind', createdAt: `${daysAgo(30)}T07:00:00Z` },
    { ...base, id: 'c6', kind: 'idea', runSource: 'manual', angle: null, topic: 'A post on levelling', body: null, closeLine: null, hashtags: [], status: 'idea', createdAt: `${daysAgo(3)}T07:00:00Z` },
  ]
}
let sampleContent = freshSampleContent()

// Searches (30): four live, one placed; candidates in play; this week's calls; two A-star suggestions; campaigns.
function search(over: Partial<Search> & Pick<Search, 'id' | 'client' | 'role' | 'openedOn'>): Search {
  return {
    function: 'pmm', level: null, location: null, city: 'new_york', country: 'US', confidential: false, crmUrl: 'https://example.com/crm/job/' + over.id, crmJobRef: null, priority: 'active', status: 'open',
    firstSubmissionOn: null, placedOn: null, lastClientContactOn: over.openedOn, waitingOn: null, nextStep: null, nextStepOn: null, health: 'warm', healthReason: null,
    nSourced: 0, nSpoken: 0, nSubmitted: 0, nFirstStage: 0, nLaterStage: 0, nOffer: 0, feeEstimate: null, wonFromJobLead: null, createdAt: `${over.openedOn}T09:00:00Z`, ...over,
  }
}
export function freshSampleSearches(): Search[] {
  return [
    search({ id: 's-northwind', client: 'Northwind Sample Co', role: 'Head of Product Marketing', openedOn: daysAgo(24), priority: 'focus', nSourced: 40, nSpoken: 10, nSubmitted: 6, nFirstStage: 3, nLaterStage: 1, nOffer: 1, status: 'offer', lastClientContactOn: daysAgo(1), waitingOn: 'client', firstSubmissionOn: daysAgo(15), feeEstimate: 45000, healthReason: 'Ada Example verbally accepted on Monday. The contract went out on Tuesday and is not yet signed; the client chased yesterday.', nextStep: 'Confirm Ada has signed and withdrawn from her other processes', nextStepOn: daysAgo(-1) }),
    search({ id: 's-contoso', client: 'Contoso Demo Inc', role: 'Senior Product Marketing Manager', openedOn: daysAgo(10), priority: 'active', nSourced: 22, nSpoken: 6, nSubmitted: 2, lastClientContactOn: daysAgo(2), waitingOn: 'desk', firstSubmissionOn: daysAgo(3), city: 'boston' }),
    search({ id: 's-globex', client: 'Globex Fiction', role: 'Director of Product Marketing', openedOn: daysAgo(31), priority: 'active', nSourced: 18, nSpoken: 5, nSubmitted: 1, lastClientContactOn: daysAgo(9), health: 'cold', healthReason: 'No client contact for 7 working days', waitingOn: 'client', confidential: true }),
    search({ id: 's-initech', client: 'Initech Mock', role: 'Product Marketing Lead', openedOn: daysAgo(45), priority: 'maintenance', nSourced: 12, nSpoken: 3, lastClientContactOn: daysAgo(6), health: 'cooling', healthReason: 'No client contact for 4 working days', city: 'san_francisco' }),
    search({ id: 's-wonka', client: 'Wonka Imaginary Ltd', role: 'Product Marketing Manager', openedOn: daysAgo(70), priority: 'dormant', nSourced: 5, nSpoken: 1, lastClientContactOn: daysAgo(30), status: 'on_hold', country: 'UK', city: 'london' }),
    search({ id: 's-fabrikam', client: 'Fabrikam Test Ltd', role: 'VP Product Marketing', openedOn: daysAgo(120), priority: 'maintenance', status: 'placed', placedOn: daysAgo(40), firstSubmissionOn: daysAgo(100), nSourced: 30, nSpoken: 8, nSubmitted: 4, nFirstStage: 2, nLaterStage: 1, nOffer: 1, feeEstimate: 60000 }),
  ]
}
let sampleSearches = freshSampleSearches()

function candidate(over: Partial<SearchCandidate> & Pick<SearchCandidate, 'id' | 'searchId' | 'personId' | 'name' | 'stage' | 'stageChangedOn'>): SearchCandidate {
  return {
    title: null, company: null, crmUrl: 'https://example.com/crm/person/' + over.personId, profileUrl: null, submittedOn: null, feedbackReceivedOn: null, feedbackNudges: 0, consentToSubmit: false, nextInterviewAt: null, prepSent: false,
    lastCandidateContactOn: null, outcomeReason: null, offerStatus: null, decisionDueOn: null, startOn: null, referencesTaken: 0, referencesNeeded: 2, competingProcess: false, risks: null, wouldSwing: null, aftercareOn: null, ...over,
  }
}
export function freshSampleCandidates(): SearchCandidate[] {
  return [
    candidate({ id: 'sc-1', searchId: 's-northwind', personId: 'p-ada', name: 'Ada Example', title: 'Senior PMM', company: 'Northwind Sample Co', stage: 'offer', stageChangedOn: daysAgo(2), consentToSubmit: true, submittedOn: daysAgo(14), feedbackReceivedOn: daysAgo(12), offerStatus: 'verbal', decisionDueOn: daysAgo(-5), referencesTaken: 1, risks: 'Counter-offer likely', wouldSwing: 'Title and a clear first-year plan', profileUrl: 'https://example.com/in/ada' }),
    candidate({ id: 'sc-2', searchId: 's-northwind', personId: 'p-dev', name: 'Dev Madeup', title: 'PMM Lead', company: 'Initech Mock', stage: 'later_stage', stageChangedOn: daysAgo(4), consentToSubmit: true, submittedOn: daysAgo(13), feedbackReceivedOn: daysAgo(11), nextInterviewAt: todayAt(26), prepSent: false }),
    candidate({ id: 'sc-3', searchId: 's-northwind', personId: 'p-eve', name: 'Eve Invented', title: 'Group PMM', company: 'Stark Sample', stage: 'first_stage', stageChangedOn: daysAgo(3), consentToSubmit: true, submittedOn: daysAgo(10), feedbackReceivedOn: daysAgo(8) }),
    candidate({ id: 'sc-4', searchId: 's-contoso', personId: 'p-ben', name: 'Ben Sample', title: 'VP Product Marketing', company: 'Contoso Demo Inc', stage: 'submitted', stageChangedOn: daysAgo(6), consentToSubmit: true, submittedOn: daysAgo(6) }),
    candidate({ id: 'sc-5', searchId: 's-contoso', personId: 'p-finn', name: 'Finn Fictional', title: 'PMM', company: 'Globex Fiction', stage: 'spoken', stageChangedOn: daysAgo(1) }),
    candidate({ id: 'sc-6', searchId: 's-globex', personId: 'p-cara', name: 'Cara Placeholder', title: 'Director of PMM', company: 'Umbrella Sample', stage: 'sourced', stageChangedOn: daysAgo(2) }),
    candidate({ id: 'sc-7', searchId: 's-fabrikam', personId: 'p-hal', name: 'Hal Hypothetical', title: 'VP Product Marketing', company: 'Fabrikam Test Ltd', stage: 'placed', stageChangedOn: daysAgo(40), consentToSubmit: true, submittedOn: daysAgo(95), offerStatus: 'accepted', startOn: daysAgo(20), aftercareOn: daysAgo(-10) }),
  ]
}
let sampleCandidates = freshSampleCandidates()
let sampleNotes: SearchNote[] = [
  { id: 'n-brief-1', searchId: 's-northwind', tab: 'brief', title: null, content: '', structured: { why_open: 'The last head moved to a VP role in-house', reports_to: 'CMO', first_90: 'Own the launch calendar and rebuild the messaging house', must_have: 'B2B SaaS, launches at scale, has managed two or more' }, version: 1, updatedAt: `${daysAgo(20)}T10:00:00Z` },
  { id: 'n-close-1', searchId: 's-fabrikam', tab: 'close_out', title: null, content: '', structured: { crm_placement: true, start_date: true, aftercare: true, testimonial_client: false, testimonial_candidate: true, referral_ask: false, account_growth: false }, version: 1, updatedAt: `${daysAgo(30)}T10:00:00Z` },
]

export function freshSampleCalls(): Call[] {
  const c = (over: Partial<Call> & Pick<Call, 'id' | 'heldAt' | 'callType'>): Call => ({
    granolaUrl: 'https://example.com/granola/' + over.id, title: null, minutes: 30, personId: null, personName: null, crmUrl: null, searchId: null, matchConfidence: 'none',
    wRecord: false, wCv: false, wNote: false, wOnSearch: false, wFollowUp: false, cvRequested: false, isNewAStar: false, skipReason: null, summary: null, ...over,
  })
  return [
    c({ id: 'call-1', heldAt: `${daysAgo(0)}T09:00:00Z`, callType: 'candidate_screen', personId: 'p-finn', personName: 'Finn Fictional', crmUrl: 'https://example.com/crm/person/p-finn', searchId: 's-contoso', matchConfidence: 'high', wRecord: true, wNote: true, wOnSearch: true, summary: 'Six years in B2B SaaS, two launches a year, wants a first leadership step. Open to Boston. Keen on the Contoso role.' }),
    c({ id: 'call-2', heldAt: `${daysAgo(1)}T14:00:00Z`, callType: 'candidate_screen', personId: null, personName: 'Someone New', matchConfidence: 'none', wRecord: true }),
    c({ id: 'call-3', heldAt: `${daysAgo(1)}T16:30:00Z`, callType: 'coaching', personId: 'p-ben', personName: 'Ben Sample', crmUrl: 'https://example.com/crm/person/p-ben', wRecord: true, wNote: true, wFollowUp: true, isNewAStar: true }),
    c({ id: 'call-4', heldAt: `${daysAgo(2)}T11:00:00Z`, callType: 'client_update', searchId: 's-northwind', matchConfidence: 'confirmed', wRecord: true, wNote: true, wOnSearch: true, wFollowUp: true, wCv: true }),
    c({ id: 'call-5', heldAt: `${daysAgo(9)}T11:00:00Z`, callType: 'candidate_screen', personId: 'p-dev', personName: 'Dev Madeup', searchId: 's-northwind', matchConfidence: 'confirmed', wRecord: true, wNote: true, wOnSearch: true, wFollowUp: true, wCv: true, summary: 'PMM lead at Initech, ran pricing for the platform line. Strong on positioning, lighter on launches. Would move for a director title.' }),
    c({ id: 'call-6', heldAt: `${daysAgo(12)}T15:00:00Z`, callType: 'candidate_screen', personId: 'p-ada', personName: 'Ada Example', crmUrl: 'https://example.com/crm/person/p-ada', searchId: 's-northwind', matchConfidence: 'confirmed', wRecord: true, wNote: true, wOnSearch: true, wFollowUp: true, wCv: true, isNewAStar: true, summary: 'Senior PMM in New York. Launches at scale, built the sales deck from nothing, pricing and packaging on two products. Wants a head of role.' }),
  ]
}
let sampleCalls = freshSampleCalls()

export function freshSampleAStar(): AStarSuggestion[] {
  return [
    { id: 'as-1', name: 'Zed Fictional', title: 'Director of PMM', company: 'Stark Sample', city: 'boston', linkedinUrl: 'https://example.com/in/zed', why: 'Two launches a year, B2B SaaS, posts about pricing', week: thisMonday(), verdict: 'pending' },
    { id: 'as-2', name: 'Yas Imaginary', title: 'Head of Product Marketing', company: 'Umbrella Sample', city: 'new_york', linkedinUrl: 'https://example.com/in/yas', why: 'Built a team of six from nothing', week: thisMonday(), verdict: 'pending' },
  ]
}
let sampleAStar = freshSampleAStar()
let sampleWarm = new Set<string>(['p-ada'])
/** What went out on the owner's behalf, newest first (0054). */
const sampleBehalf: BehalfRow[] = [
  { key: 'b1', at: `${daysAgo(0)}T14:05:00Z`, area: 'linkedin', what: 'LinkedIn connection note', toName: 'Ivy Placeholder', outcome: 'queued', how: 'auto', by: 'a3_jobs', detail: 'Sends at 09:20 on Wed 18 Nov America/New_York', link: 'https://example.com/in/ivy' },
  { key: 'b2', at: `${daysAgo(1)}T15:10:00Z`, area: 'linkedin', what: 'Accepted your request', toName: 'Hal Sample', outcome: 'accepted', how: 'auto', by: 'sender', detail: 'Contoso Demo Inc', link: 'https://example.com/in/hal' },
  { key: 'b3', at: `${daysAgo(3)}T14:20:00Z`, area: 'linkedin', what: 'LinkedIn connection note', toName: 'Hal Sample', outcome: 'sent', how: 'auto', by: 'a3_jobs', detail: 'Auto', link: 'https://example.com/in/hal' },
  { key: 'b4', at: `${daysAgo(3)}T09:00:00Z`, area: 'campaign', what: 'Added to a campaign', toName: 'Ada to the New York PMM leads', outcome: 'added', how: 'you', by: 'owner', detail: 'email', link: null },
  { key: 'b5', at: `${daysAgo(4)}T10:17:00Z`, area: 'email', what: 'Thank you after a call', toName: 'Finn Fictional', outcome: 'sent', how: 'auto', by: 'a6_calls', detail: 'Auto', link: null },
]

/** The chat on each task, by task key. Ada's follow-up has one exchange so the screen can be seen. */
const sampleChat = new Map<string, TaskChat>([
  [
    'follow_ups:f-ada',
    {
      lines: [
        { id: 'chat-a1', author: 'owner', kind: 'check', body: 'Is this still relevant?', at: '2026-11-13T09:10:00Z' },
        { id: 'chat-a2', author: 'agent', kind: 'answer', body: 'Yes. Her last email, on Thursday, asks for the role outline and nothing has gone back. The draft covers it.', at: '2026-11-13T09:25:00Z' },
      ],
      job: { id: 'job-a1', kind: 'check', instruction: null, status: 'ready', note: null, requestedAt: '2026-11-13T09:10:00Z', finishedAt: '2026-11-13T09:25:00Z' },
    },
  ],
])

let sampleSpecs: SpecRequest[] = [
  {
    id: 'spec-ada', personId: 'p-ada', linkedinUrl: 'https://example.com/in/ada', cvWhere: 'spott', status: 'ready', note: null,
    result: {
      skills: ['launch planning', 'pricing and packaging', 'sales enablement', 'positioning', 'B2B SaaS', 'finance buyer', 'team of two', 'New York'],
      summary: 'A senior PMM who has run launches at scale and rebuilt a sales deck from nothing. Pricing and packaging on two products. Ready for a head of role.',
      matches: [
        { kind: 'job_lead', id: 'job-northwind', name: 'Northwind Sample Co', role: 'Senior PMM', why: 'Same level, same city, launches are the heart of the role', fit: 84 },
        { kind: 'search', id: 's-contoso', name: 'Contoso Demo Inc', role: 'Senior Product Marketing Manager', why: 'Boston is a move but the brief wants exactly her pricing work', fit: 71 },
        { kind: 'account', id: 'Fabrikam Test Ltd', name: 'Fabrikam Test Ltd', role: 'Sam Colleague', why: 'The account is hiring in marketing and Sam asked for PMM names', fit: 58 },
      ],
    },
    requestedAt: `${daysAgo(1)}T09:00:00Z`, finishedAt: `${daysAgo(1)}T09:20:00Z`,
  },
]
export function resetSampleSpecs() {
  sampleSpecs = [...sampleSpecs.filter((r) => r.id === 'spec-ada')]
  sampleWarm = new Set(['p-ada'])
}

export function freshSampleCampaigns(): Campaign[] {
  return [
    { id: 'cp-1', name: 'Ada to the New York PMM leads', tool: 'email', jobLeadId: 'job-northwind', candidatePersonId: 'p-ada', steps: [{ channel: 'email', note: 'Send the two-line profile', doneOn: daysAgo(3) }, { channel: 'phone', note: 'Call the hiring manager on Thursday' }, { channel: 'linkedin', note: 'Message if no answer by Monday' }], contacted: 4, replies: 2, callsBooked: 1, status: 'running', startedOn: daysAgo(3), endedOn: null, createdAt: `${daysAgo(3)}T09:00:00Z` },
    { id: 'cp-2', name: 'Spring CMO breakfast invitations', tool: 'linkedin', jobLeadId: null, candidatePersonId: null, steps: [], contacted: 30, replies: 9, callsBooked: 3, status: 'done', startedOn: daysAgo(60), endedOn: daysAgo(40), createdAt: `${daysAgo(60)}T09:00:00Z` },
  ]
}
let sampleCampaigns = freshSampleCampaigns()
// Templates: the five starters, with the thanks one approved so a sample week can send.
export function freshSampleTemplates(): Template[] {
  const t = (over: Partial<Template> & Pick<Template, 'id' | 'type' | 'name' | 'channel' | 'body'>): Template => ({
    subject: null, variables: [], version: 1, approved: false, approvedAt: null, active: true, updatedAt: `${daysAgo(10)}T09:00:00Z`, ...over,
  })
  return [
    t({ id: 't-thanks', type: 'thanks_after_call', name: 'Starter', channel: 'email', subject: 'Good to speak today', body: 'Hi {{first_name}},\n\nThanks for your time on {{call_day}}. Good to hear about what you have been doing at {{company}}.\n\n{{next_step}}\n\nSpeak soon,\n{{my_first_name}}', approved: true, approvedAt: `${daysAgo(9)}T09:00:00Z` }),
    t({ id: 't-cv', type: 'cv_request', name: 'Starter', channel: 'email', subject: 'Your resume', body: 'Hi {{first_name}},\n\nWhen you get a minute, could you send over your latest resume? It means I can get you in front of the right people quickly.\n\nThanks,\n{{my_first_name}}' }),
    t({ id: 't-submitted', type: 'submitted_confirmation', name: 'Starter', channel: 'email', subject: 'You are with the client', body: 'Hi {{first_name}},\n\nQuick one to say I have put you forward for the {{role}} role today. I will chase for feedback and come back to you as soon as I hear, and by the end of the week either way.\n\n{{my_first_name}}' }),
    t({ id: 't-coaching', type: 'coaching_followup', name: 'Starter', channel: 'email', subject: 'Following up on our chat', body: 'Hi {{first_name}},\n\nGood to talk on {{call_day}}. {{next_step}}\n\nYou mentioned a couple of people who might get something from the same conversation. If you are happy to connect us, I would be glad to help them.\n\n{{my_first_name}}' }),
    t({ id: 't-connect', type: 'linkedin_connect', name: 'Starter', channel: 'linkedin', body: 'Hi {{first_name}}, I recruit product marketers and nothing else, mostly for B2B software teams in the US. Saw you are hiring. Would be good to connect.' }),
  ].map((x) => ({ ...x, variables: [...new Set([...(x.subject ?? '').matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g), ...x.body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]))] }))
}
let sampleTemplates = freshSampleTemplates()

export function freshSampleSendLog(): SendLogRow[] {
  const row = (over: Partial<SendLogRow> & Pick<SendLogRow, 'id' | 'type' | 'toName' | 'outcome' | 'loggedAt'>): SendLogRow => ({
    messageId: `m-${over.id}`, channel: 'email', level: 'automatic', detail: null, ...over,
  })
  return [
    row({ id: 'l1', type: 'thanks_after_call', toName: 'Finn Fictional', outcome: 'sent', detail: 'Auto', loggedAt: `${daysAgo(0)}T15:12:00Z` }),
    row({ id: 'l2', type: 'thanks_after_call', toName: 'Finn Fictional', outcome: 'queued', detail: 'Sends at 10:12 on Wed 11 Nov America/New_York', loggedAt: `${daysAgo(0)}T10:40:00Z` }),
    row({ id: 'l3', type: 'cv_request', toName: 'Someone New', outcome: 'skipped', detail: 'Template needs approval', loggedAt: `${daysAgo(1)}T16:05:00Z` }),
    row({ id: 'l4', type: 'linkedin_connect', toName: 'Uma Pretend', channel: 'linkedin', outcome: 'held', detail: 'Cap reached', loggedAt: `${daysAgo(1)}T09:30:00Z` }),
    row({ id: 'l5', type: 'coaching_followup', toName: 'Ben Sample', level: 'one_click', outcome: 'sent', detail: 'Sent', loggedAt: `${daysAgo(2)}T14:20:00Z` }),
  ]
}
let sampleSendLog = freshSampleSendLog()
export function resetSampleTemplates() {
  sampleTemplates = freshSampleTemplates()
  sampleSendLog = freshSampleSendLog()
}

export function resetSampleSearches() {
  sampleSearches = freshSampleSearches()
  sampleCandidates = freshSampleCandidates()
  sampleCalls = freshSampleCalls()
  sampleAStar = freshSampleAStar()
  sampleCampaigns = freshSampleCampaigns()
  sampleWarm = new Set(['p-ada'])
}

// Problem reports: one closed, one being worked, one new.
const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
export function freshSampleProblems(): Problem[] {
  const base: Problem = { id: '', ref: 0, title: null, description: '', severity: 'medium', status: 'new', reporterName: 'Jason', assignee: null, route: '/home', userAgent: chrome, viewport: '1440x900', appVersion: 'sample', resolution: null, createdAt: `${daysAgo(0)}T08:00:00Z`, updatedAt: `${daysAgo(0)}T08:00:00Z`, resolvedAt: null }
  return [
    { ...base, id: 'p1', ref: 1, title: 'Greeting said Morning at noon', description: 'At 12:05 the greeting still said Morning.', severity: 'low', status: 'closed', resolution: 'Afternoon starts at 12:00 now', createdAt: `${daysAgo(6)}T11:00:00Z`, resolvedAt: `${daysAgo(5)}T09:00:00Z` },
    { ...base, id: 'p2', ref: 2, description: 'The Ignore link on a signal row is cut off on the laptop.\nOnly on the signals list.', status: 'in_progress', route: '/people/signals', createdAt: `${daysAgo(2)}T15:30:00Z` },
    { ...base, id: 'p3', ref: 3, title: 'Save does nothing on the calendar', description: 'Wrote a post for Tuesday, pressed Save, nothing happened.', severity: 'high', route: '/content/calendar', createdAt: `${daysAgo(0)}T08:00:00Z` },
  ]
}
let sampleProblems = freshSampleProblems()
let sampleShots: ProblemScreenshot[] = []
let sampleProblemNotes: ProblemNote[] = [{ id: 'n1', reportId: 'p2', author: 'Jason', body: 'Can reproduce on the laptop, not on the phone.', createdAt: `${daysAgo(1)}T09:00:00Z` }]
export function resetSampleProblems() {
  sampleProblems = freshSampleProblems()
  sampleProblemNotes = [{ id: 'n1', reportId: 'p2', author: 'Jason', body: 'Can reproduce on the laptop, not on the phone.', createdAt: `${daysAgo(1)}T09:00:00Z` }]
}
export function resetSampleContent() {
  sampleContent = freshSampleContent()
}

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
    code, name, schedule, enabled: true, modelTier: 'standard', monthlyBudget: 50, keyCreatedAt: daysAgo(10) + 'T09:00:00Z', consecutiveFailures: 0, lastRun: null, spentThisMonth: 0, connections: ['claude'], criteria: {}, ...over,
  })
  return [
    a('a1_review', 'Weekly review', 'Monday 08:17', { lastRun: { startedAt: hoursAgoIso(30), status: 'ok', itemsCreated: 1 }, spentThisMonth: 1.2 }),
    a('a2_content', 'Content engine', 'Monday 08:58 and 09:15, Thursday 09:30', { lastRun: { startedAt: hoursAgoIso(26), status: 'ok', itemsCreated: 3 }, spentThisMonth: 6.4, connections: ['granola', 'linkedin_read', 'claude'], criteria: { posts_a_week: 2 } }),
    a('a3_jobs', 'Jobs pipeline', 'Collect Tuesday and Friday 13:00. Match Wednesday 07:41', { lastRun: { startedAt: hoursAgoIso(5), status: 'ok', itemsCreated: 4 }, spentThisMonth: 12.4, connections: ['linkedin_scraper', 'outlook_mail', 'claude'], criteria: { lookback_days: 7, icp: 'B2B software, US, product marketing' } }),
    a('a4_signals', 'Relationship signals', 'Friday 12:47', { modelTier: 'light', monthlyBudget: 20, lastRun: { startedAt: hoursAgoIso(50), status: 'failed', itemsCreated: 0 }, consecutiveFailures: 1, spentThisMonth: 2.1, connections: ['linkedin_read', 'claude'], criteria: { lookback_days: 7, uk_to_us: true } }),
    a('a5_followups', 'Follow-up queue', 'Monday 07:30, Thursday 07:30, weekdays 08:45 for the calendar', { lastRun: { startedAt: hoursAgoIso(2), status: 'ok', itemsCreated: 2 }, spentThisMonth: 4.8 }),
    a('a6_calls', 'Call-to-CRM', 'Monday to Thursday 19:30, Friday 16:30', { lastRun: { startedAt: hoursAgoIso(18), status: 'partial', itemsCreated: 1 }, spentThisMonth: 9.9 }),
    a('a7_events', 'Event ideas', '1st of the month', { enabled: false, monthlyBudget: null, keyCreatedAt: null }),
    a('a8_campaigns', 'Campaign runner', 'Weekdays 09:10 and 15:10', { modelTier: 'light', monthlyBudget: 10, keyCreatedAt: null, connections: ['crm', 'claude'] }),
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

// Accounts (29.3): two of the group's clients and two of the owner's own.
export function freshSampleAccounts(): Account[] {
  return [
    { id: 'acc-1', company: 'Contoso Demo Inc', kind: 'group_client', colleague: 'Sam Church', contactName: 'Priya Example', contactTitle: 'VP Sales', functions: ['sales', 'cs'], crmUrl: 'https://example.com/crm/contoso', notes: null, active: true, introducedTo: null },
    { id: 'acc-2', company: 'Fabrikam Test Ltd', kind: 'group_client', colleague: 'Lee Sample', contactName: null, contactTitle: null, functions: [], crmUrl: null, notes: null, active: true, introducedTo: null },
    { id: 'acc-3', company: 'Northwind Sample Co', kind: 'my_account', colleague: null, contactName: 'Ada Example', contactTitle: 'Senior PMM', functions: ['sales'], crmUrl: 'https://example.com/crm/northwind', notes: 'Placed two PMMs in 2025.', active: true, introducedTo: 'Sam Church' },
    { id: 'acc-4', company: 'Initech Mock', kind: 'my_account', colleague: null, contactName: 'Max Madeup', contactTitle: 'CMO', functions: ['marketing', 'sales'], crmUrl: null, notes: null, active: true, introducedTo: null },
  ]
}
let sampleAccounts = freshSampleAccounts()
export function resetSampleAccounts() {
  sampleAccounts = freshSampleAccounts()
}
let sampleRuns = freshSampleRuns()
let samplePrompts = freshSamplePrompts()
let samplePolicies = freshSamplePolicies()
let sampleTargets = freshSampleTargets()
let samplePaused = false
let sampleHeld = 0

// Settings, Connections in sample mode: fake statuses, no keys anywhere.
function freshSampleConnections(): Connection[] {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
  return [
    { provider: 'granola', status: 'connected', accountLabel: 'Granola', connectedAt: hoursAgo(72), lastOkAt: hoursAgo(2), lastError: null },
    { provider: 'spott', status: 'failing', accountLabel: 'Spott', connectedAt: hoursAgo(200), lastOkAt: hoursAgo(30), lastError: 'Spott did not accept the key.' },
  ]
}
let sampleConnections: Connection[] = freshSampleConnections()

function sampleConnect(provider: ConnectionProvider, accountLabel: string): Connection {
  const now = new Date().toISOString()
  const c: Connection = { provider, status: 'connected', accountLabel, connectedAt: now, lastOkAt: now, lastError: null }
  sampleConnections = [...sampleConnections.filter((x) => x.provider !== provider), c]
  return c
}

export function resetSampleSettings() {
  sampleConnections = freshSampleConnections()
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

function daysFromToday(n: number): string {
  return ukClock(new Date(Date.now() + n * 86_400_000)).date
}

const noEdits = (): TaskEdits => ({ title: null, notes: null, dueOn: null, sortOrder: null })

function task(over: Partial<Task> & Pick<Task, 'key' | 'source' | 'kind' | 'title'>): Task {
  const [, sourceId] = over.key.split(':')
  return {
    sourceId,
    why: null,
    personName: null,
    company: null,
    dueOn: null,
    rank: 0,
    waitingOn: null,
    draft: null,
    draftOriginal: null,
    subject: null,
    channel: null,
    messageId: null,
    messageState: null,
    links: [],
    refTable: null,
    refId: null,
    agent: null,
    searchId: null,
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    stale: false,
    sourceUrl: over.links?.[0]?.url ?? null,
    edits: noEdits(),
    ...over,
  }
}

// The sample week's tasks, mirroring db/seed/sample_week.sql and what
// tasks_view makes of it. Held in memory so an action on one page shows on
// the next. Every name is invented.
export function freshSampleTasks(): Task[] {
  const thanks =
    'Hi Ada, thank you for your time yesterday. As discussed, could you send over your CV when you have a moment? I will come back to you on the GrailPay role by Thursday.'
  return [
    task({
      key: 'follow_ups:f-ada',
      source: 'follow_ups',
      kind: 'follow_up',
      title: 'Ada Example, Northwind Sample Co',
      why: 'Spoke yesterday about the GrailPay role. CV promised.',
      personName: 'Ada Example',
      company: 'Northwind Sample Co',
      dueOn: daysFromToday(0),
      rank: 45,
      draft: thanks,
      draftOriginal: thanks,
      subject: 'Good to speak yesterday',
      channel: 'email',
      messageId: 'm-ada',
      messageState: 'draft',
      links: [
        { label: 'Call notes', url: 'https://example.com/notes/ada' },
        { label: 'Open in CRM', url: 'https://example.com/crm/candidates/ada' },
      ],
      agent: 'a6_calls',
      searchId: 's-grail',
    }),
    task({
      key: 'follow_ups:f-cara',
      source: 'follow_ups',
      kind: 'follow_up',
      title: 'Cara Placeholder, Fabrikam Test Ltd',
      why: 'Asked for the shortlist by Friday. Nothing sent yet.',
      personName: 'Cara Placeholder',
      company: 'Fabrikam Test Ltd',
      dueOn: daysFromToday(-3),
      rank: 42,
      draft: 'Hi Cara, the shortlist is attached as promised. Three names, two of whom can start within a month. Shall we walk through them on Thursday?',
      draftOriginal: 'Hi Cara, the shortlist is attached as promised. Three names, two of whom can start within a month. Shall we walk through them on Thursday?',
      subject: 'Shortlist as promised',
      channel: 'email',
      messageId: 'm-cara',
      messageState: 'draft',
      links: [{ label: 'Open thread', url: 'https://example.com/mail/cara' }],
      agent: 'a5_followups',
    }),
    task({
      key: 'follow_ups:f-ben',
      source: 'follow_ups',
      kind: 'follow_up',
      title: 'Ben Sample, Contoso Demo Inc',
      why: 'You asked about their Q1 hiring plan six days ago. No reply.',
      personName: 'Ben Sample',
      company: 'Contoso Demo Inc',
      dueOn: daysFromToday(0),
      rank: 10,
      waitingOn: 'Their reply',
      draft: 'Hi Ben, just bringing this back to the top of your inbox. Any news on the Q1 plan?',
      draftOriginal: 'Hi Ben, just bringing this back to the top of your inbox. Any news on the Q1 plan?',
      subject: 'Q1 hiring plan',
      channel: 'email',
      messageId: 'm-ben',
      messageState: 'draft',
      links: [{ label: 'Open thread', url: 'https://example.com/mail/ben' }],
      agent: 'a5_followups',
    }),
    task({
      key: 'prepare_call:cal-1',
      source: 'calendar_today',
      kind: 'prepare_call',
      title: 'Prepare: Candidate screen',
      why: 'Candidate screen. Read the brief and their profile first',
      personName: 'Dev Madeup',
      company: 'GrailPay Sample',
      dueOn: daysFromToday(0),
      rank: 30,
      links: [
        { label: 'Open in CRM', url: 'https://example.com/crm/candidates/dev' },
        { label: 'Search in CRM', url: 'https://example.com/crm/jobs/grailpay' },
      ],
      agent: 'a5_followups',
      searchId: 's-grail',
    }),
    task({
      key: 'search_health:s-tailspin',
      source: 'searches',
      kind: 'search_health',
      title: 'Tailspin Example Inc: Senior PMM, Platform',
      why: 'No client contact for 10 working days',
      company: 'Tailspin Example Inc',
      dueOn: daysFromToday(0),
      rank: 50,
      draft:
        'Hi there, a quick update on the Senior PMM search. Two strong profiles are in final conversations and I expect to have names to you this week. Would Thursday suit for a short call?',
      draftOriginal:
        'Hi there, a quick update on the Senior PMM search. Two strong profiles are in final conversations and I expect to have names to you this week. Would Thursday suit for a short call?',
      subject: 'Senior PMM search: update',
      channel: 'email',
      messageId: 'm-tailspin',
      messageState: 'draft',
      links: [{ label: 'Search in CRM', url: 'https://example.com/crm/jobs/tailspin' }],
      agent: 'system',
      searchId: 's-tailspin',
    }),
    task({
      key: 'inbox_items:i-north',
      source: 'inbox_items',
      kind: 'job_lead',
      title: 'Senior PMM at Northwind Sample Co',
      why: 'B2B SaaS, about 400 people, New York. Posted two days ago.',
      company: 'Northwind Sample Co',
      rank: 32,
      personName: 'Gail Example',
      draft: "Gail, I'm one of the leading PMM headhunters in the US. Would love to connect.",
      draftOriginal: "Gail, I'm one of the leading PMM headhunters in the US. Would love to connect.",
      channel: 'linkedin',
      links: [{ label: 'LinkedIn post', url: 'https://example.com/linkedin.com/post/northwind' }],
      sourceUrl: 'https://www.linkedin.com/posts/northwind-sample',
      refTable: 'job_leads',
      refId: 'job-northwind',
      agent: 'a3_jobs',
      messageId: 'm-connect-north',
      messageState: 'draft',
      lead: {
        id: 'job-northwind', postedOn: daysAgo(2), foundOn: daysAgo(1), posterName: 'Gail Example', posterTitle: 'VP Marketing', profileUrl: 'https://example.com/in/gail',
        stage: 'found', connectionOn: null, connectedOn: null, messagedOn: null, repliedOn: null, replyOutcome: null,
        connectState: null, connectHold: null, connectAfter: null, campaign: null, sources: ['linkedin_post'],
      },
    }),
    task({
      key: 'inbox_items:i-contoso',
      source: 'inbox_items',
      kind: 'job_lead',
      title: 'Director of PMM at Contoso Demo Inc',
      why: 'Fits the ICP. The hiring leader is on the league.',
      company: 'Contoso Demo Inc',
      personName: 'Hal Sample',
      rank: 31,
      channel: 'linkedin',
      draft: 'Thanks for connecting, Hal. I saw Contoso Demo Inc is hiring for a Director of PMM. I only recruit product marketers, mostly for US tech teams, so I speak to people who fit that kind of brief most weeks.',
      draftOriginal: 'Thanks for connecting, Hal. I saw Contoso Demo Inc is hiring for a Director of PMM. I only recruit product marketers, mostly for US tech teams, so I speak to people who fit that kind of brief most weeks.',
      links: [{ label: 'LinkedIn advert', url: 'https://example.com/advert/contoso' }],
      sourceUrl: 'https://www.linkedin.com/jobs/view/contoso-sample',
      refTable: 'job_leads',
      refId: 'job-contoso',
      agent: 'a3_jobs',
      messageId: 'm-li-contoso',
      messageState: 'draft',
      lead: {
        id: 'job-contoso', postedOn: daysAgo(5), foundOn: daysAgo(4), posterName: 'Hal Sample', posterTitle: 'CMO', profileUrl: 'https://example.com/in/hal',
        stage: 'connected', connectionOn: daysAgo(3), connectedOn: daysAgo(1), messagedOn: null, repliedOn: null, replyOutcome: null,
        connectState: 'sent', connectHold: null, connectAfter: null, campaign: null, sources: ['alex_leads'],
      },
    }),
    task({
      key: 'inbox_items:i-signal',
      source: 'inbox_items',
      kind: 'signal',
      title: 'Ben Sample was promoted to VP',
      why: 'Now VP Product Marketing at Contoso Demo Inc. Likely to build a team.',
      personName: 'Ben Sample',
      company: 'Contoso Demo Inc',
      rank: 30,
      draft: 'Congratulations on the VP move, Ben. If the team grows this quarter I would be glad to help.',
      draftOriginal: 'Congratulations on the VP move, Ben. If the team grows this quarter I would be glad to help.',
      channel: 'linkedin',
      links: [{ label: 'Profile', url: 'https://example.com/in/ben-sample' }],
      agent: 'a4_signals',
    }),
    task({
      key: 'call_confirm:c-finn',
      source: 'calls',
      kind: 'call_confirm',
      title: 'Which search was Finn Fictional for?',
      why: 'The call write-up could not tell which search this was. Nothing is written to the CRM until you say.',
      personName: 'Finn Fictional',
      dueOn: daysFromToday(0),
      rank: 35,
      links: [{ label: 'Call notes', url: 'https://example.com/notes/finn' }],
      agent: 'a6_calls',
    }),
    task({
      key: 'cv_chase:c-ada',
      source: 'calls',
      kind: 'cv_chase',
      title: 'CV still to come from Ada Example',
      why: 'Asked yesterday. Needed before she can be put forward.',
      personName: 'Ada Example',
      company: 'Northwind Sample Co',
      dueOn: daysFromToday(1),
      rank: 20,
      waitingOn: 'The candidate',
      links: [
        { label: 'Where the CV will be', url: 'https://example.com/crm/candidates/ada' },
        { label: 'Call notes', url: 'https://example.com/notes/ada' },
      ],
      agent: 'a6_calls',
    }),
    task({
      key: 'content_approve:ct-1',
      source: 'content_items',
      kind: 'content_approve',
      title: 'Approve: Why first PMM hires fail in month three',
      why: 'Most first PMM hires are set up to fail by week twelve.',
      dueOn: daysFromToday(4),
      rank: 14,
      draft:
        'Most first PMM hires are set up to fail by week twelve.\n\nThe hiring manager wanted a launch engine. The board wanted positioning. The new PMM got both briefs and no owner. Three calls this week, same story.\n\nIf you are hiring your first PMM, agree who owns the brief before you open the role.',
      draftOriginal:
        'Most first PMM hires are set up to fail by week twelve.\n\nThe hiring manager wanted a launch engine. The board wanted positioning. The new PMM got both briefs and no owner. Three calls this week, same story.\n\nIf you are hiring your first PMM, agree who owns the brief before you open the role.',
      channel: 'linkedin',
      agent: 'a2_content',
    }),
    task({
      key: 'content_post:ct-2',
      source: 'content_items',
      kind: 'content_post',
      title: 'Post: Remote PMM roles are back',
      why: 'Remote PMM postings are up again.',
      dueOn: daysFromToday(0),
      rank: 30,
      draft:
        'Remote PMM postings are up again.\n\nA third of the PMM roles we saw this month are remote across the US. Last quarter it was a fifth. Candidates who held out are getting calls.\n\nWorth a look at your own location line.',
      draftOriginal:
        'Remote PMM postings are up again.\n\nA third of the PMM roles we saw this month are remote across the US. Last quarter it was a fifth. Candidates who held out are getting calls.\n\nWorth a look at your own location line.',
      channel: 'linkedin',
      agent: 'a2_content',
    }),
    task({
      key: 'inbox_items:i-suggest',
      source: 'inbox_items',
      kind: 'suggestion',
      title: 'Decide on Dev Madeup for GrailPay Sample',
      why: 'Spoken to over a week ago on the Director of Product Marketing search and still at spoken. Submit, or let them know.',
      personName: 'Dev Madeup',
      company: 'GrailPay Sample',
      dueOn: daysFromToday(2),
      rank: 20,
      links: [{ label: 'Open in CRM', url: 'https://example.com/crm/candidates/dev' }],
      agent: 'system',
      searchId: 's-grail',
    }),
    task({
      key: 'inbox_items:i-referral',
      source: 'inbox_items',
      kind: 'referral',
      title: 'Hal Hypothetical, named by Eve Invented',
      why: 'Group PMM at Northwind Sample Co. Said to be looking.',
      personName: 'Hal Hypothetical',
      company: 'Northwind Sample Co',
      dueOn: daysFromToday(9),
      rank: 20,
      refTable: 'referrals',
      refId: 'ref-hal',
      agent: 'a6_calls',
    }),
    task({
      key: 'inbox_items:i-idea',
      source: 'inbox_items',
      kind: 'event_idea',
      title: 'Breakfast for heads of PMM, New York, January',
      why: 'Four league members in New York asked about meeting peers this quarter.',
      dueOn: daysFromToday(16),
      rank: 5,
      agent: 'a7_events',
    }),
    // Posted more than 21 days ago: it stays on Business development but leaves Tasks.
    task({
      key: 'inbox_items:i-old',
      source: 'inbox_items',
      kind: 'job_lead',
      title: 'PMM Lead at Vandelay Sample',
      why: 'An older post from the import.',
      company: 'Vandelay Sample',
      personName: 'Ola Example',
      rank: 31,
      channel: 'linkedin',
      sourceUrl: 'https://www.linkedin.com/posts/vandelay-sample',
      refTable: 'job_leads',
      refId: 'job-vandelay',
      agent: 'a3_jobs',
      createdAt: `${daysAgo(4)}T09:00:00Z`,
      lead: {
        id: 'job-vandelay', postedOn: daysAgo(40), foundOn: daysAgo(4), posterName: 'Ola Example', posterTitle: 'VP Marketing', profileUrl: 'https://example.com/in/ola',
        stage: 'found', connectionOn: null, connectedOn: null, messagedOn: null, repliedOn: null, replyOutcome: null,
        connectState: null, connectHold: null, connectAfter: null, campaign: null, sources: ['linkedin_post'],
      },
    }),
  ]
}

let sampleTasks = freshSampleTasks()
const sampleGone = new Map<string, Task>()

/** Tests only. */
export function resetSampleTasks() {
  sampleTasks = freshSampleTasks()
  sampleGone.clear()
}

function takeOut(key: string) {
  const t = sampleTasks.find((x) => x.key === key)
  if (!t) throw new Error('No such task')
  sampleGone.set(key, t)
  sampleTasks = sampleTasks.filter((x) => x.key !== key)
}

export const sampleSource: DataSource = {
  async needsYou() {
    // What is due or late across the three columns of the Tasks board (18 November 2026).
    return needsYouCount(sampleTasks, ukClock(new Date()).date)
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
  async dayToday() {
    const calls = (await this.callsToday()).map((c) => ({ ...c, endsAt: new Date(Date.parse(c.startsAt) + 30 * 60_000).toISOString(), isExternal: true }))
    const internal = [
      { id: 'sample-i1', startsAt: todayAt(-1), endsAt: todayAt(-0.5), title: 'Desk stand-up', callType: 'internal', personName: null, isExternal: false },
      { id: 'sample-i2', startsAt: todayAt(2.5), endsAt: todayAt(3), title: 'Lunch with Sam', callType: 'internal', personName: null, isExternal: false },
    ]
    return [...calls, ...internal].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  },
  async calendarWeek() {
    // Today as on the day view, then six more days with a different load each,
    // one of them empty, so the strip and the arrow keys have something to show.
    const today = ukClock(new Date()).date
    const ahead: [number, number, string, string, string][] = [
      [1, 9.5, 'Candidate screen', 'candidate_screen', 'Gus Placeholder'],
      [1, 11, 'Client update', 'client_update', 'Hana Madeup'],
      [1, 15, 'Coaching', 'coaching', 'Ivo Invented'],
      [2, 10, 'Reference', 'reference', 'Jo Example'],
      [2, 14.5, 'Candidate screen', 'candidate_screen', 'Kit Sample'],
      [4, 9, 'Desk stand-up', 'internal', ''],
      [4, 10, 'Brief: Senior PMM', 'client_update', 'Lena Pretend'],
      [4, 13, 'Candidate screen', 'candidate_screen', 'Milo Fictional'],
      [4, 16, 'Candidate screen', 'candidate_screen', 'Nell Imaginary'],
      [5, 11.5, 'Coaching', 'coaching', 'Otto Example'],
      [6, 10, 'Candidate screen', 'candidate_screen', 'Pia Sample'],
      [6, 12, 'Lunch with Sam', 'internal', ''],
    ]
    const later = ahead.map(([n, hour, title, callType, who], i) => {
      const startsAt = ukAt(shiftDate(today, n), hour)
      return {
        id: `sample-w${i + 1}`,
        startsAt,
        endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
        title,
        callType,
        personName: who || null,
        isExternal: callType !== 'internal',
      }
    })
    return [...(await this.dayToday()), ...later]
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

  async inboxFolders() {
    return [...sampleFolders].sort((a, b) => a.position - b.position).map((f) => ({ ...f }))
  },
  async createInboxFolder(name) {
    checkFolderName(name)
    const position = sampleFolders.reduce((m, f) => Math.max(m, f.position), -1) + 1
    const folder = { id: `folder-new-${++sampleFolderSeq}`, name: name.trim(), position }
    sampleFolders.push(folder)
    return { ...folder }
  },
  async renameInboxFolder(id, name) {
    const found = sampleFolders.find((f) => f.id === id)
    if (!found) throw new Error('No such folder')
    checkFolderName(name, id)
    found.name = name.trim()
  },
  async deleteInboxFolder(id) {
    if (!sampleFolders.some((f) => f.id === id)) throw new Error('No such folder')
    sampleFolders = sampleFolders.filter((f) => f.id !== id)
    // On delete set null: its items go back to Inbox.
    for (const i of sampleInbox) if (i.folderId === id) i.folderId = null
  },
  async moveInboxItem(id, folderId) {
    const found = sampleInbox.find((i) => i.id === id)
    if (!found) throw new Error('No such item')
    if (folderId !== null && !sampleFolders.some((f) => f.id === folderId)) throw new Error('No such folder')
    found.folderId = folderId
  },
  async inboxClosed(view) {
    return sampleInbox.filter((i) => i.status === view && i.type !== 'auto_sent').map((i) => ({ ...i }))
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
  async addWiderLead(input) {
    sampleWider.unshift({
      id: `w-${Date.now()}`, company: input.company, role: input.role, function: input.function, country: input.country, location: null, source: input.source,
      mentionedByName: input.mentionedByName, existingClient: input.existingClient, passedTo: null, passedOn: null, splitNote: null, status: 'spotted', notes: input.notes, createdAt: new Date().toISOString(), accountId: input.accountId,
    })
  },
  async setOutreach(id, patch) {
    const found = sampleLeads.find((l) => l.id === id)
    if (!found) throw new Error('No such lead')
    Object.assign(found, patch)
    const today = daysAgo(0)
    if (patch.outreachStage === 'connection_sent' && !found.outreachConnectionOn) found.outreachConnectionOn = today
    if (patch.outreachStage === 'connected' && !found.outreachConnectedOn) found.outreachConnectedOn = today
    if (patch.outreachStage === 'messaged' && !found.outreachMessagedOn) found.outreachMessagedOn = today
    if (patch.outreachStage === 'replied' && !found.outreachRepliedOn) found.outreachRepliedOn = today
  },
  async updateReferral(id, patch) {
    const found = sampleReferrals.find((r) => r.id === id)
    if (!found) throw new Error('No such referral')
    Object.assign(found, patch)
  },
  async referralToJobLead(id) {
    const r = sampleReferrals.find((x) => x.id === id)
    if (!r) throw new Error('No such referral')
    if (r.jobLeadId) return r.jobLeadId
    const made = lead({ id: `lead-${Date.now()}`, company: r.referredCompany ?? 'Unknown', role: 'Product marketing hire', firstSeenOn: daysAgo(0), sources: ['referral'], posterName: r.hiringManagerName, posterProfileUrl: r.hiringManagerUrl })
    sampleLeads.unshift(made)
    r.jobLeadId = made.id
    return made.id
  },
  async accounts() {
    return sampleAccounts.map((a) => ({ ...a }))
  },
  async addAccount(input) {
    sampleAccounts.push({ id: `acc-${Date.now()}`, ...input, notes: null, active: true, introducedTo: null })
  },
  async updateAccount(id, patch) {
    const found = sampleAccounts.find((a) => a.id === id)
    if (!found) throw new Error('No such account')
    Object.assign(found, patch)
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
      list.unshift({ id: `t-${personId}-${today}`, touchedOn: today, channel: 'linkedin', kind: 'message_replied', note: null, sourceUrl: null })
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
  async saveProfileSummary(personId, text) {
    for (const m of sampleMembers) if (m.personId === personId) m.profileSummary = text.trim() || null
  },
  async askProfilePull(personId) {
    pullsAsked.push(personId)
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
  async updateAgentSetup(code, patch) {
    const found = sampleAgents.find((a) => a.code === code)
    if (!found) throw new Error('No such agent')
    if (patch.connections) found.connections = patch.connections
    if (patch.criteria) found.criteria = patch.criteria
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

  // ---- Tasks (0049)
  async tasks() {
    return sampleTasks.map((t) => ({ ...t, links: [...t.links], edits: { ...t.edits } }))
  },
  async completeTask(task, detail) {
    if ((task.kind === 'call_confirm' || task.kind === 'call_writeup') && !detail?.searchId) throw new Error('Choose the search first')
    takeOut(task.key)
  },
  async binTask(task) {
    takeOut(task.key)
  },
  async snoozeTask(task) {
    takeOut(task.key)
  },
  async reopenTask(task) {
    const back = sampleGone.get(task.key)
    if (back) {
      sampleTasks = [...sampleTasks, back]
      sampleGone.delete(task.key)
    }
  },
  async saveTaskEdits(task, edits) {
    const t = sampleTasks.find((x) => x.key === task.key)
    if (t) t.edits = { ...t.edits, ...edits }
  },
  async reorderTasks(keys) {
    keys.forEach((key, i) => {
      const t = sampleTasks.find((x) => x.key === key)
      if (t) t.edits = { ...t.edits, sortOrder: i + 1 }
    })
  },
  async saveDraft(task, body, subject) {
    const t = sampleTasks.find((x) => x.key === task.key)
    if (t) {
      t.draft = body
      t.subject = subject
    }
  },
  async sendTask(task) {
    if (!task.messageId) throw new Error('Nothing to send')
    return 'Queued to send'
  },
  async openInOutlook(task) {
    if (!task.messageId) throw new Error('Nothing to open')
    return `https://example.com/outlook/drafts/${task.messageId}`
  },
  async createTaskDraft(task, subject, body) {
    const t = sampleTasks.find((x) => x.key === task.key)
    const id = `m-${task.sourceId}`
    if (t) {
      t.messageId = id
      t.messageState = 'draft'
      t.channel = 'email'
      t.subject = subject
      t.draft = body
      t.draftOriginal = body
    }
    return id
  },
  async connections() {
    return sampleConnections.map((c) => ({ ...c }))
  },
  async outlookStartUrl() {
    // No Microsoft in sample mode: pretend the sign-in came straight back.
    sampleConnect('outlook', 'Owner Sample (owner@example.test)')
    return '/settings/connections?outlook=connected'
  },
  async saveConnectionKey(provider, key) {
    if (key.trim().length < 8) throw new Error('Paste the whole key.')
    if (provider === 'granola' && !key.trim().startsWith('grn_')) throw new Error('A Granola key starts grn_.')
    return sampleConnect(provider, provider === 'granola' ? 'Granola' : 'Spott')
  },
  async disconnect(provider) {
    sampleConnections = sampleConnections.filter((c) => c.provider !== provider)
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

  async problems() {
    return sampleProblems.map((p) => ({ ...p })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  async reportProblem(input) {
    const now = new Date().toISOString()
    const made: Problem = { id: `p-${Date.now()}`, ref: Math.max(0, ...sampleProblems.map((p) => p.ref)) + 1, title: input.title, description: input.description, severity: input.severity, status: 'new', reporterName: input.reporterName, assignee: null, route: input.route, userAgent: input.userAgent, viewport: input.viewport, appVersion: input.appVersion, resolution: null, createdAt: now, updatedAt: now, resolvedAt: null }
    sampleProblems.push(made)
    return { ...made }
  },
  async updateProblem(id, patch) {
    const found = sampleProblems.find((p) => p.id === id)
    if (!found) throw new Error('No such report')
    Object.assign(found, patch, { updatedAt: new Date().toISOString() })
    found.resolvedAt = found.status === 'new' || found.status === 'in_progress' ? null : (found.resolvedAt ?? new Date().toISOString())
  },
  async problemNotes(id) {
    return sampleProblemNotes.filter((n) => n.reportId === id).map((n) => ({ ...n }))
  },
  async addProblemNote(id, body, author) {
    const made: ProblemNote = { id: `n-${Date.now()}`, reportId: id, author, body, createdAt: new Date().toISOString() }
    sampleProblemNotes.push(made)
    return { ...made }
  },
  async problemScreenshots(id) {
    return sampleShots.filter((s) => s.reportId === id).map((s) => ({ ...s }))
  },
  async addProblemScreenshot(id, dataUrl) {
    if (sampleShots.filter((s) => s.reportId === id).length >= 3) throw new Error('limit: Three pictures at most on one report')
    const made: ProblemScreenshot = { id: `s-${Date.now()}-${sampleShots.length}`, reportId: id, data: dataUrl, createdAt: new Date().toISOString() }
    sampleShots.push(made)
    return { ...made }
  },
  async searches() {
    return sampleSearches.map((x) => ({ ...x }))
  },
  async addSearch(input) {
    const made = search({ id: `s-${Date.now()}`, client: input.client, role: input.role, function: input.function, crmUrl: input.crmUrl, priority: input.priority, confidential: input.confidential ?? false, wonFromJobLead: input.wonFromJobLead ?? null, status: 'intake', openedOn: daysAgo(0) })
    sampleSearches.unshift(made)
    return { ...made }
  },
  async updateSearch(id, patch) {
    const found = sampleSearches.find((x) => x.id === id)
    if (!found) throw new Error('No such search')
    Object.assign(found, patch)
    if (patch.status === 'placed' && !found.placedOn) found.placedOn = daysAgo(0)
  },
  async searchCandidates() {
    return sampleCandidates.map((x) => ({ ...x }))
  },
  async addCandidate(searchId, personId) {
    const m = sampleMembers.find((x) => x.personId === personId)
    sampleCandidates.push(candidate({ id: `sc-${Date.now()}`, searchId, personId, name: m?.name ?? 'Someone', title: m?.title ?? null, company: m?.company ?? null, stage: 'sourced', stageChangedOn: daysAgo(0) }))
  },
  async updateCandidate(id, patch) {
    const found = sampleCandidates.find((x) => x.id === id)
    if (!found) throw new Error('No such candidate')
    if (patch.stage === 'submitted' && !(patch.consentToSubmit ?? found.consentToSubmit)) throw new Error('Agreed to be put forward must be on first')
    const today = daysAgo(0)
    if (patch.stage && patch.stage !== found.stage) found.stageChangedOn = today
    Object.assign(found, patch)
    if (patch.stage === 'submitted' && !found.submittedOn) found.submittedOn = today
    if (patch.offerStatus === 'accepted') found.stage = 'placed'
    if (found.stage === 'placed' && !found.aftercareOn) found.aftercareOn = plusDays(found.startOn ?? today, 30)
    if (found.stage === 'placed') {
      const s = sampleSearches.find((x) => x.id === found.searchId)
      if (s && s.status !== 'placed') {
        s.status = 'placed'
        s.placedOn = today
      }
    }
  },
  async searchNotes(searchId) {
    return sampleNotes.filter((n) => n.searchId === searchId).map((n) => ({ ...n }))
  },
  async saveSearchNote(searchId, tab, content, structured) {
    const found = sampleNotes.find((n) => n.searchId === searchId && n.tab === tab)
    if (found) Object.assign(found, { content, structured, updatedAt: new Date().toISOString() })
    else sampleNotes.push({ id: `n-${Date.now()}`, searchId, tab, title: null, content, structured, version: 1, updatedAt: new Date().toISOString() })
  },
  async calls() {
    return sampleCalls.map((x) => ({ ...x }))
  },
  async updateCall(id, patch) {
    const found = sampleCalls.find((x) => x.id === id)
    if (!found) throw new Error('No such call')
    Object.assign(found, patch)
  },
  async aStarSuggestions() {
    return sampleAStar.filter((x) => x.verdict === 'pending').map((x) => ({ ...x }))
  },
  async aStarVerdict(id, verdict) {
    const found = sampleAStar.find((x) => x.id === id)
    if (!found) throw new Error('No such suggestion')
    found.verdict = verdict
    if (verdict === 'good') {
      const personId = `p-${found.name.toLowerCase().replace(/\s+/g, '-')}`
      sampleMembers.push(member({ id: `m-${personId}`, personId, name: found.name, title: found.title, company: found.company, city: found.city, listId: 'list-top', tier: 'league_one', why: found.why ?? 'From the A-star feed', lastTouchOn: null, profileUrl: found.linkedinUrl }))
    }
  },
  async warmSpecs() {
    return sampleMembers
      .filter((m) => sampleWarm.has(m.personId))
      .map((m) => ({
        personId: m.personId, name: m.name, title: m.title, company: m.company, crmUrl: m.crmUrl, profileUrl: m.profileUrl,
        matches: sampleLeads.filter((l) => l.stage !== 'dead' && l.stage !== 'passed' && l.matched.some((x) => x.personId === m.personId || x.name === m.name)).map((l) => ({ leadId: l.id, company: l.company, role: l.role })),
      }))
  },
  async spokenTo() {
    const out = new Map<string, SpokenPerson>()
    for (const c of [...sampleCalls].sort((a, b) => b.heldAt.localeCompare(a.heldAt))) {
      if (!c.personId || !c.personName || !['candidate_screen', 'coaching', 'interview_prep', 'debrief', 'reference', 'other', 'unknown'].includes(c.callType)) continue
      const held = out.get(c.personId) ?? { personId: c.personId, name: c.personName, title: null, company: null, city: null, crmUrl: c.crmUrl, profileUrl: sampleSpecs.find((r) => r.personId === c.personId)?.linkedinUrl ?? null, good: sampleWarm.has(c.personId), suggested: false, lastCallOn: c.heldAt.slice(0, 10), calls: [] }
      held.suggested = held.suggested || c.isNewAStar
      held.calls.push({ id: c.id, heldAt: c.heldAt, callType: c.callType, granolaUrl: c.granolaUrl, summary: c.summary, searchId: c.searchId })
      out.set(c.personId, held)
    }
    return [...out.values()]
  },
  async specRequests() {
    return sampleSpecs.map((r) => ({ ...r }))
  },
  async sendQueue() {
    return [
      { type: 'linkedin_connect', state: 'waiting' as const, reason: 'Template needs approval', count: 32, nextAt: null },
      { type: 'thanks_after_call', state: 'queued' as const, reason: null, count: 1, nextAt: `${daysAgo(-1)}T14:05:00Z` },
    ]
  },

  async connectLead(task) {
    const t = sampleTasks.find((x) => x.key === task.key)
    if (t?.lead) {
      t.lead = { ...t.lead, connectState: 'draft', connectHold: 'Template needs approval' }
    }
    return 'Template needs approval'
  },

  async markLinkedInSent(task) {
    const t = sampleTasks.find((x) => x.key === task.key)
    if (t?.lead) t.lead = { ...t.lead, stage: 'messaged', messagedOn: new Date().toISOString().slice(0, 10) }
    return 'Marked as sent by hand'
  },

  async addLeadToCampaign(task) {
    const t = sampleTasks.find((x) => x.key === task.key)
    if (t?.lead) t.lead = { ...t.lead, campaign: { name: `${t.lead.posterName} at ${t.company}`, addedOn: new Date().toISOString().slice(0, 10), enrolledOn: null } }
  },

  async onYourBehalf(area) {
    return sampleBehalf.filter((r) => area === null || r.area === area || (area === 'leads' && (r.area === 'linkedin' || r.area === 'campaign'))).map((r) => ({ ...r }))
  },

  async taskChat(taskKey) {
    const held = sampleChat.get(taskKey) ?? { lines: [], job: null }
    return { lines: held.lines.map((l) => ({ ...l })), job: held.job ? { ...held.job } : null }
  },

  async askTask(taskKey, kind, instruction) {
    const held = sampleChat.get(taskKey) ?? { lines: [], job: null }
    const words = instruction?.trim() || (kind === 'check' ? 'Is this still relevant?' : 'Do this for me.')
    const now = new Date().toISOString()
    held.lines.push({ id: `chat-${held.lines.length + 1}`, author: 'owner', kind, body: words, at: now })
    held.job = { id: `job-${taskKey}`, kind, instruction: instruction?.trim() || null, status: 'waiting', note: null, requestedAt: now, finishedAt: null }
    sampleChat.set(taskKey, held)
    return held.job.id
  },

  async requestSpec(personId, ask) {
    sampleWarm.add(personId)
    if (sampleSpecs.some((r) => r.personId === personId && (r.status === 'waiting' || r.status === 'working'))) return
    const req: SpecRequest = { id: `spec-${personId}-${Date.now()}`, personId, linkedinUrl: ask.linkedinUrl ?? null, cvWhere: ask.cvWhere, status: 'waiting', note: null, result: null, requestedAt: new Date().toISOString(), finishedAt: null }
    sampleSpecs = [req, ...sampleSpecs.filter((r) => r.personId !== personId)]
    setTimeout(() => {
      req.status = 'working'
    }, 1500)
    setTimeout(() => {
      req.status = 'ready'
      req.finishedAt = new Date().toISOString()
      req.result = {
        skills: ['positioning', 'launch planning', 'sales enablement', 'B2B SaaS'],
        summary: 'A sample answer: a solid product marketer with launches and enablement behind them.',
        matches: [{ kind: 'job_lead', id: 'job-northwind', name: 'Northwind Sample Co', role: 'Senior PMM', why: 'Level and city both fit', fit: 70 }],
      }
    }, 3500)
  },
  async setWarmSpec(personId, on) {
    if (on) sampleWarm.add(personId)
    else sampleWarm.delete(personId)
  },
  async campaigns() {
    return sampleCampaigns.map((x) => ({ ...x, steps: x.steps.map((st) => ({ ...st })) }))
  },
  async addCampaign(input) {
    sampleCampaigns.unshift({ id: `cp-${Date.now()}`, name: input.name, tool: input.tool, jobLeadId: input.jobLeadId, candidatePersonId: input.candidatePersonId, steps: input.steps ?? [], contacted: 0, replies: 0, callsBooked: 0, status: 'planned', startedOn: null, endedOn: null, createdAt: new Date().toISOString() })
  },
  async updateCampaign(id, patch) {
    const found = sampleCampaigns.find((x) => x.id === id)
    if (!found) throw new Error('No such campaign')
    Object.assign(found, patch)
  },
  async templates() {
    return sampleTemplates.map((x) => ({ ...x }))
  },
  async addTemplate(input) {
    const version = sampleTemplates.filter((x) => x.type === input.type && x.name === input.name).length + 1
    sampleTemplates.push({ id: `t-${Date.now()}`, ...input, variables: [], version, approved: false, approvedAt: null, active: true, updatedAt: new Date().toISOString() })
  },
  async saveTemplate(id, patch) {
    const found = sampleTemplates.find((x) => x.id === id)
    if (!found) throw new Error('No such template')
    if (found.approved) {
      // TPL-1: the approved version stands aside; the edit becomes the next version, unapproved.
      found.active = false
      sampleTemplates.push({ ...found, id: `${id}-v${found.version + 1}`, subject: patch.subject, body: patch.body, version: found.version + 1, approved: false, approvedAt: null, active: true, updatedAt: new Date().toISOString() })
    } else {
      found.subject = patch.subject
      found.body = patch.body
      found.updatedAt = new Date().toISOString()
    }
  },
  async approveTemplate(id) {
    const found = sampleTemplates.find((x) => x.id === id)
    if (!found) throw new Error('No such template')
    found.approved = true
    found.approvedAt = new Date().toISOString()
    found.active = true
    for (const x of sampleTemplates) if (x.type === found.type && x.name === found.name && x.id !== id) x.active = false
    return 0
  },
  async seedContentIdeas() {
    const before = sampleContent.length
    for (const c of freshSampleContent()) if (!sampleContent.some((x) => x.topic === c.topic)) sampleContent.push({ ...c })
    return sampleContent.length - before
  },
  async seedTemplates() {
    const before = sampleTemplates.length
    for (const t of freshSampleTemplates()) if (!sampleTemplates.some((x) => x.type === t.type && x.name === t.name)) sampleTemplates.push({ ...t, approved: false, approvedAt: null })
    return sampleTemplates.length - before
  },
  async sendLog(limit = 30) {
    return sampleSendLog.slice(0, limit).map((x) => ({ ...x }))
  },
  async sendTest(type) {
    sampleSendLog.unshift({ id: `l-test-${Date.now()}`, messageId: `m-test-${Date.now()}`, type, channel: 'email', level: 'one_click', toName: 'Jason', outcome: 'queued', detail: 'Test send to yourself. Goes on the next tick', loggedAt: new Date().toISOString() })
    return { state: 'queued', note: 'Queued to you. The sender picks it up on its next run.' }
  },
  async sendAction(messageId, action) {
    const f = sampleFollowUps.find((x) => x.message?.id === messageId)
    const m = f?.message
    if (!m) throw new Error('No such message')
    const log = (outcome: SendLogRow['outcome'], detail: string) =>
      sampleSendLog.unshift({ id: `l-${Date.now()}`, messageId, type: 'email_reply', channel: m.channel, toName: f!.personName, level: m.level, outcome, detail, loggedAt: new Date().toISOString() })
    switch (action) {
      case 'approve': {
        if (m.state !== 'draft') throw new Error('Only a draft can be approved')
        if (m.level === 'draft_only') throw new Error('This one is draft only. Open it in Outlook or copy it')
        m.state = 'queued'
        log('queued', 'Sends at 09:12 on the next working day America/New_York')
        return { state: 'queued', note: 'Sends at 09:12, New York time' }
      }
      case 'open_draft':
        return { state: 'draft', outlook_draft_url: composeLink(null, null, m.body), note: `Opens a draft to ${f!.personName} in Outlook. Nothing is sent until you press Send there.` }
      case 'mark_sent': {
        if (m.state !== 'draft') throw new Error('Only a draft is marked as sent')
        m.state = 'sent'
        f!.status = 'sent'
        log('sent', 'manual')
        return { state: 'sent', note: 'Marked as sent by hand' }
      }
      case 'cancel': {
        m.state = 'cancelled'
        log('cancelled', 'Cancelled by the owner')
        return { state: 'cancelled' }
      }
    }
  },
  async contentItems() {
    return sampleContent.filter((c) => c.status !== 'binned').map((c) => ({ ...c })).sort((a, b) => b.rank - a.rank || b.createdAt.localeCompare(a.createdAt))
  },
  async addContent(input) {
    const { copy, plannedFor, status } = input
    const parts = input.kind !== 'linkedin_post' ? { hook: input.kind === 'testimonial' ? copy || null : null, body: input.kind === 'event' ? copy || null : null, closeLine: null } : splitCopy(copy)
    const made: ContentItem = {
      id: `c-${Date.now()}`, kind: input.kind, runSource: 'manual', angle: null, topic: input.kind !== 'linkedin_post' ? input.topic : topicFrom(copy), searchId: null, requestedOn: null, receivedOn: null, usedWhere: null, hook: parts.hook, body: parts.body, closeLine: parts.closeLine, hashtags: [],
      eventType: input.kind === 'event' ? input.eventType : null, eventTime: input.kind === 'event' ? input.eventTime : null,
      dataPoint: null, dataPointUrl: null, promptedBy: null, formatOk: true, formatReason: null, rank: 0, status, heldReason: null,
      plannedFor, postedOn: status === 'posted' ? plannedFor : null, postUrl: null, impressions: null, comments: null, inboundMessages: null, createdAt: new Date().toISOString(),
    }
    sampleContent.push(made)
    return { ...made }
  },
  async updateContent(id, patch) {
    const found = sampleContent.find((c) => c.id === id)
    if (!found) throw new Error('No such draft')
    Object.assign(found, patch)
    if (patch.status === 'posted' && !found.postedOn) found.postedOn = daysAgo(0)
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
