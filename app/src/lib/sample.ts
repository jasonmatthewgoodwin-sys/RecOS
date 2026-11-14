// Invented sample data for building screens with no database (section 4.3,
// Local). Every name here is made up. Nothing in this file is real.

import type { DataSource, JobLead } from './data'
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

// Chased this week in the sample is eleven from earlier in the week plus the
// sample leads chased since Monday, so a Chased on the page moves the number.
const CHASED_BEFORE = 11
const CHASED_TARGET = 20

export const sampleSource: DataSource = {
  async needsYou() {
    return 7
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
}
