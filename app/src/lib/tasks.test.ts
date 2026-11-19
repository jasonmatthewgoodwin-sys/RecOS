import { afterEach, describe, expect, it, vi } from 'vitest'
import { actionTitle, binReasons, byOrder, channelOf, columnOf, shownTitle, sourceShort, starterDraft, typeWord, columns, dueNow, dueWord, leadEmail, leadMove, leadSource, leadStatus, linkedinUrl, needsYouCount, primaryLabel, snoozeChoices, status, withLeadSources, type Task, type TaskLead } from './tasks'
import { freshSampleMembers, freshSampleTasks, keepInTouchTask, resetSampleMembers, resetSampleTasks, sampleKeepInTouchTasks, sampleSource } from './sample'
import { contactLine, dayMonth, dueCount, dueOrOverdue, lastContactWords, linkedinLine, linkedinProfileUrl, onCadence, placeLine, thisWeek, usesRhythm } from './people'

// The Tasks rules: band, status, order, words. Today is a Monday.
const today = '2026-11-16'

function t(over: Partial<Task>): Task {
  return { ...freshSampleTasks()[0], edits: { title: null, notes: null, dueOn: null, sortOrder: null }, waitingOn: null, dueOn: null, rank: 0, lead: null, createdAt: `${today}T09:00:00Z`, ...over }
}

afterEach(() => resetSampleTasks())

describe('task rules', () => {
  it('status: waiting beats the date; late, today, on track', () => {
    expect(status(t({ dueOn: '2026-11-10', waitingOn: 'Their reply' }), today)).toBe('waiting')
    expect(status(t({ dueOn: '2026-11-10' }), today)).toBe('late')
    expect(status(t({ dueOn: today }), today)).toBe('today')
    expect(status(t({ dueOn: '2026-11-20' }), today)).toBe('on_track')
    expect(status(t({}), today)).toBe('on_track')
    // Older than three days with no date of its own is overdue.
    expect(status(t({ createdAt: '2026-11-13T09:00:00Z' }), today)).toBe('today')
    expect(status(t({ createdAt: '2026-11-12T09:00:00Z' }), today)).toBe('late')
  })

  it('due words: Today, a weekday within the week, otherwise a short date', () => {
    expect(dueWord(t({ dueOn: today }), today)).toBe('Today')
    expect(dueWord(t({ dueOn: '2026-11-19' }), today)).toBe('Thu')
    expect(dueWord(t({ dueOn: '2026-11-13' }), today)).toBe('Fri')
    expect(dueWord(t({ dueOn: '2026-12-03' }), today)).toBe('3 Dec')
    expect(dueWord(t({}), today)).toBe('Thu')
  })

  it('orders by the owner first, then rank, then the nearer date', () => {
    const a = t({ key: 'a', rank: 10, dueOn: '2026-11-20' })
    const b = t({ key: 'b', rank: 40, dueOn: '2026-11-21' })
    const c = t({ key: 'c', rank: 40, dueOn: '2026-11-18' })
    const d = t({ key: 'd', rank: 1, edits: { title: null, notes: null, dueOn: null, sortOrder: 1 } })
    const late = t({ key: 'late', rank: 2, dueOn: '2026-11-10' })
    expect([a, b, c, d, late].sort(byOrder(today)).map((x) => x.key)).toEqual(['d', 'late', 'c', 'b', 'a'])
  })

  it('names the primary action by kind', () => {
    expect(primaryLabel(t({ kind: 'job_lead' }))).toBe('Chased')
    expect(primaryLabel(t({ kind: 'follow_up', messageId: 'm', channel: 'email' }))).toBe('Send')
    expect(primaryLabel(t({ kind: 'follow_up', messageId: null }))).toBe('Done')
    expect(primaryLabel(t({ kind: 'call_confirm' }))).toBe('Confirm')
    expect(primaryLabel(t({ kind: 'cv_chase' }))).toBe('Received')
    expect(primaryLabel(t({ kind: 'content_post' }))).toBe('Posted')
    expect(primaryLabel(t({ kind: 'suggestion' }))).toBe('Done')
  })

  it('snooze choices are tomorrow, Thursday and next Monday', () => {
    expect(snoozeChoices(today).map((c) => c.until)).toEqual(['2026-11-17', '2026-11-19', '2026-11-23'])
    expect(snoozeChoices('2026-11-19').map((c) => c.until)).toEqual(['2026-11-20', '2026-11-26', '2026-11-23'])
    expect(binReasons('job_lead')).toHaveLength(3)
  })
})

describe('sample tasks', () => {
  it('complete, bin and snooze take a task out; reopen puts it back; edits and order stick', async () => {
    const before = await sampleSource.tasks()
    const [first] = before
    await sampleSource.completeTask(first)
    expect((await sampleSource.tasks()).some((x) => x.key === first.key)).toBe(false)
    await sampleSource.reopenTask(first)
    expect((await sampleSource.tasks()).some((x) => x.key === first.key)).toBe(true)
    await sampleSource.saveTaskEdits(first, { title: 'My words', dueOn: '2026-12-01' })
    await sampleSource.reorderTasks([before[1].key, first.key])
    const again = await sampleSource.tasks()
    expect(again.find((x) => x.key === first.key)?.edits).toEqual({ title: 'My words', notes: null, dueOn: '2026-12-01', sortOrder: 2 })
    expect(again.find((x) => x.key === before[1].key)?.edits.sortOrder).toBe(1)
  })

  it('refuses to confirm a call without a search, and holds no contact details', async () => {
    const call = (await sampleSource.tasks()).find((x) => x.kind === 'call_confirm')!
    await expect(sampleSource.completeTask(call)).rejects.toThrow()
    await sampleSource.completeTask(call, { searchId: 's-grail' })
    const text = JSON.stringify(await sampleSource.tasks())
    expect(text).not.toMatch(/@|\+?\d{3}[\s-]?\d{3}[\s-]?\d{4}/)
  })
})

describe('LinkedIn leads (0054)', () => {
  const base = freshSampleTasks().find((t) => t.key === 'inbox_items:i-north')!
  const lead = base.lead!
  it('the next move follows the outreach', () => {
    expect(leadMove(lead)).toBe('connect')
    expect(leadMove({ ...lead, connectState: 'queued' })).toBe('waiting')
    expect(leadMove({ ...lead, stage: 'connection_sent' })).toBe('waiting')
    expect(leadMove({ ...lead, stage: 'connected' })).toBe('message')
    expect(leadMove({ ...lead, stage: 'messaged' })).toBe('chase')
  })
  it('says where it stands in plain words, with the campaign', () => {
    expect(leadStatus(lead)).toBe('Not connected')
    expect(leadStatus({ ...lead, connectState: 'draft', connectHold: 'Template needs approval' })).toMatch(/approve the connection note/)
    expect(leadStatus({ ...lead, stage: 'connection_sent', connectionOn: '2026-11-16' })).toBe('Request sent 16 Nov. Waiting for Gail to accept')
    expect(leadStatus({ ...lead, stage: 'replied', repliedOn: '2026-11-16', replyOutcome: 'interested', campaign: { name: 'x', addedOn: '2026-11-17', enrolledOn: '2026-11-17' } }))
      .toBe('Gail replied 16 Nov, interested. In a campaign since 17 Nov, enrolled in Spott')
  })
  it('a LinkedIn task goes to LinkedIn, an email task to Outlook', () => {
    expect(channelOf(base)).toBe('linkedin')
    expect(linkedinUrl(base)).toBe('https://example.com/in/gail')
    const fu = freshSampleTasks().find((t) => t.kind === 'follow_up' && t.channel === 'email')!
    expect(channelOf(fu)).toBe('email')
  })
  it('the email to copy is about their hiring, not the report', () => {
    const e = leadEmail(base)
    expect(e.subject).toBe('Hiring product marketers?')
    expect(e.body).toMatch(/^Hi Gail,\n\nI saw Northwind Sample Co is hiring for a Senior PMM\./)
    expect(e.body).not.toMatch(/report/i)
    expect(primaryLabel(base)).toBe('Connect on LinkedIn')
  })
})

describe('titles are the action (17 Nov)', () => {
  const all = freshSampleTasks()
  const titleOf = (key: string) => actionTitle(all.find((x) => x.key === key)!)
  it('a lead reads by where the outreach stands', () => {
    const north = all.find((x) => x.key === 'inbox_items:i-north')!
    expect(actionTitle(north)).toBe('Connect with Gail Example at Northwind Sample Co')
    expect(actionTitle({ ...north, lead: { ...north.lead!, stage: 'connection_sent' } })).toBe('Wait for Gail Example at Northwind Sample Co to accept')
    expect(actionTitle({ ...north, lead: { ...north.lead!, stage: 'connected' } })).toBe('Message Gail Example: accepted your request')
    expect(actionTitle({ ...north, lead: { ...north.lead!, stage: 'messaged' } })).toBe('Chase Gail Example at Northwind Sample Co for a reply')
  })
  it('people tasks name the person and the verb; the owner own title wins', () => {
    expect(titleOf('inbox_items:i-signal')).toBe('Get in touch with Ben Sample, who was promoted to VP')
    const t = all.find((x) => x.kind === 'follow_up' && x.waitingOn === 'Their reply')!
    expect(actionTitle(t)).toMatch(/^Chase /)
    expect(shownTitle({ ...t, edits: { ...t.edits, title: 'Ring Ben on Thursday' } })).toBe('Ring Ben on Thursday')
  })
})

describe('the board: Emails, Business development, Other (18 Nov)', () => {
  const lead = (over: Partial<TaskLead>): TaskLead => ({
    id: 'l', postedOn: null, foundOn: '2026-11-14', posterName: 'Pia Example', posterTitle: null, profileUrl: null,
    stage: 'found', connectionOn: null, connectedOn: null, messagedOn: null, repliedOn: null, replyOutcome: null,
    connectState: null, connectHold: null, connectAfter: null, campaign: null, ...over,
  })
  // The base sample task is an email; these start with no channel.
  const u = (over: Partial<Task>) => t({ channel: null, messageId: null, ...over })
  const keys = (tasks: Task[]) => columns(tasks, today).map((c) => [c.key, c.tasks.map((x) => x.key)])

  it('sorts follow-ups and email tasks into Emails, leads into Business development, the rest into Other; waiting leaves the columns', () => {
    const tasks = [
      u({ key: 'fu', kind: 'follow_up', channel: null }),
      u({ key: 'mail', kind: 'search_health', channel: 'email' }),
      u({ key: 'job', kind: 'job_lead', lead: lead({ postedOn: '2026-11-10' }) }),
      u({ key: 'wider', kind: 'wider_lead' }),
      u({ key: 'prep', kind: 'prepare_call' }),
      u({ key: 'post', kind: 'content_approve', channel: 'linkedin' }),
      u({ key: 'cv', kind: 'cv_chase' }),
      u({ key: 'wait', kind: 'follow_up', waitingOn: 'Their reply' }),
    ]
    expect(keys(tasks)).toEqual([
      ['emails', ['fu', 'mail']],
      // The wider lead has no post date: it counts from the day it was raised, today, so it is the newest.
      ['bd', ['wider', 'job']],
      ['other', ['prep', 'post', 'cv']],
      ['waiting', ['wait']],
    ])
  })

  it('Emails: the oldest due date first, so overdue comes first; the owner order still wins', () => {
    const a = u({ key: 'a', kind: 'follow_up', dueOn: '2026-11-18', rank: 90 })
    const b = u({ key: 'b', kind: 'follow_up', dueOn: '2026-11-02' })
    const c = u({ key: 'c', kind: 'follow_up', dueOn: '2026-11-12' })
    expect(columns([a, b, c], today)[0].tasks.map((x) => x.key)).toEqual(['b', 'c', 'a'])
    const mine = { ...a, edits: { ...a.edits, sortOrder: 1 } }
    expect(columns([mine, b, c], today)[0].tasks.map((x) => x.key)).toEqual(['a', 'b', 'c'])
  })

  it('Business development keeps leads posted in the last 21 days only, by post date, else the day first seen', () => {
    const fresh = u({ key: 'fresh', kind: 'job_lead', lead: lead({ postedOn: '2026-10-26' }) })
    const old = u({ key: 'old', kind: 'job_lead', lead: lead({ postedOn: '2026-10-25' }) })
    const seen = u({ key: 'seen', kind: 'job_lead', lead: lead({ postedOn: null, foundOn: '2026-11-01' }) })
    const oldSeen = u({ key: 'oldSeen', kind: 'job_lead', lead: lead({ postedOn: null, foundOn: '2026-10-01' }) })
    // 21 days before Monday 16 November is 26 October.
    expect(columns([fresh, old, seen, oldSeen], today)[1].tasks.map((x) => x.key)).toEqual(['seen', 'fresh'])
    // An old lead counts for nothing on Home either.
    expect(needsYouCount([old], today)).toBe(0)
  })

  it('Business development: an accepted request comes first, worded as a message to send; then the newest post', () => {
    const older = u({ key: 'older', kind: 'job_lead', lead: lead({ postedOn: '2026-11-03' }) })
    const newer = u({ key: 'newer', kind: 'job_lead', lead: lead({ postedOn: '2026-11-15' }) })
    const accepted = u({ key: 'acc', kind: 'job_lead', personName: 'Pia Example', lead: lead({ postedOn: '2026-11-01', stage: 'connected' }) })
    const bd = columns([older, newer, accepted], today)[1].tasks
    expect(bd.map((x) => x.key)).toEqual(['acc', 'newer', 'older'])
    expect(shownTitle(bd[0])).toBe('Message Pia Example: accepted your request')
  })

  it('a lead says its source in words, from the lead list when the view leaves it out', () => {
    const north = freshSampleTasks().find((x) => x.key === 'inbox_items:i-north')!
    expect(leadSource(north)).toBe('LinkedIn post')
    const bare = { ...north, lead: { ...north.lead!, sources: undefined } }
    const filled = withLeadSources([bare], [{ id: 'job-northwind', sources: ['alex_leads'] }])[0]
    expect(leadSource(filled)).toBe("Alex's leads")
  })

  it('Needs you counts what is due or late across the three columns, not waiting and not old leads', () => {
    const tasks = [
      u({ key: 'late', kind: 'follow_up', dueOn: '2026-11-10' }),
      u({ key: 'today', kind: 'prepare_call', dueOn: today }),
      u({ key: 'later', kind: 'prepare_call', dueOn: '2026-11-25' }),
      u({ key: 'wait', kind: 'follow_up', dueOn: '2026-11-10', waitingOn: 'Their reply' }),
      u({ key: 'lead', kind: 'job_lead', dueOn: today, lead: lead({ postedOn: '2026-11-15' }) }),
    ]
    expect(dueNow(tasks, today).map((x) => x.key)).toEqual(['late', 'lead', 'today'])
    expect(needsYouCount(tasks, today)).toBe(3)
  })
})

// ---- The senior network (Jason, 19 November 2026): last contact, rhythm, the LinkedIn link, keep-in-touch tasks.

describe('senior network contact', () => {
  afterEach(() => {
    vi.useRealTimers()
    resetSampleMembers()
  })

  it('last contact in words: the day and how, or Never; three-letter months as the database writes them', () => {
    expect(lastContactWords('2026-11-12', 'call')).toBe('Last contact: 12 Nov, call')
    expect(lastContactWords('2026-09-03', 'linkedin_request')).toBe('Last contact: 3 Sep, LinkedIn request')
    expect(lastContactWords('2026-11-01', 'linkedin_message')).toBe('Last contact: 1 Nov, LinkedIn message')
    expect(lastContactWords('2026-11-01', 'meeting')).toBe('Last contact: 1 Nov, meeting')
    expect(lastContactWords('2026-11-01', 'email')).toBe('Last contact: 1 Nov, email')
    expect(lastContactWords('2026-11-01', null)).toBe('Last contact: 1 Nov, noted')
    expect(lastContactWords(null, null)).toBe('Last contact: Never')
    expect(dayMonth('2026-09-27T07:00:00Z')).toBe('27 Sep')
  })

  it('status line, place and where the details came from', () => {
    expect(contactLine({ contactStatus: 'overdue', nextContactOn: '2026-10-27' })).toBe('Overdue since 27 Oct')
    expect(contactLine({ contactStatus: 'due', nextContactOn: '2026-11-20' })).toBe('Due by 20 Nov')
    expect(contactLine({ contactStatus: 'on_track', nextContactOn: '2027-01-10' })).toBe('On track, next by 10 Jan')
    expect(contactLine({ contactStatus: null, nextContactOn: null })).toBeNull()
    expect(placeLine('new_york', 'United States')).toBe('New York, United States')
    expect(placeLine(null, 'United Kingdom')).toBe('United Kingdom')
    expect(linkedinLine({ linkedinQueued: true, linkedinReadAt: '2026-11-03T07:00:00Z', linkedinError: null })).toBe('Waiting for the LinkedIn reader')
    expect(linkedinLine({ linkedinQueued: false, linkedinReadAt: '2026-11-03T07:00:00Z', linkedinError: null })).toBe('From LinkedIn, read 3 Nov')
    expect(linkedinLine({ linkedinQueued: false, linkedinReadAt: null, linkedinError: 'Profile not found' })).toBe('The LinkedIn reader could not read it: Profile not found')
    expect(linkedinLine({ linkedinQueued: false, linkedinReadAt: null, linkedinError: null })).toBeNull()
  })

  it('a LinkedIn profile link has linkedin.com/in/ in it and is tidied as the database tidies it', () => {
    expect(linkedinProfileUrl('https://www.linkedin.com/in/dana-sample/')).toBe('https://www.linkedin.com/in/dana-sample')
    expect(linkedinProfileUrl(' uk.linkedin.com/in/Dana-Sample-123?trk=x ')).toBe('https://www.linkedin.com/in/Dana-Sample-123')
    expect(linkedinProfileUrl('http://linkedin.com/in/dana')).toBe('https://www.linkedin.com/in/dana')
    for (const bad of ['https://example.com/in/dana', 'linkedin.com/company/acme', 'https://www.linkedin.com/in/', 'dana sample']) expect(linkedinProfileUrl(bad)).toBeNull()
  })

  it('rhythm: due counts due and overdue; the filter puts overdue first; this week puts signals, then overdue, then due', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
    const senior = freshSampleMembers().filter((m) => m.listId === 'list-senior')
    expect(usesRhythm(senior, 'senior_network')).toBe(true)
    expect(usesRhythm(freshSampleMembers().filter((m) => m.listId === 'list-top'), 'top_candidates')).toBe(false)
    expect(dueCount(senior)).toBe(3)
    expect(onCadence(senior)).toBe(5)
    expect(dueOrOverdue(senior).map((m) => [m.name, m.contactStatus])).toEqual([['Cara Placeholder', 'overdue'], ['Nia Pretend', 'overdue'], ['Lee Example', 'due']])
    expect(thisWeek(senior).map((m) => m.name)).toEqual(['Gia Imaginary', 'Ben Sample', 'Cara Placeholder', 'Nia Pretend', 'Lee Example'])
  })

  it('an overdue person is a keep-in-touch task in Other, worded as the action, done with Got in touch', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
    const tasks = sampleKeepInTouchTasks()
    expect(tasks.map((x) => x.personName)).toEqual(['Cara Placeholder', 'Nia Pretend'])
    const [cara, nia] = tasks
    expect(cara.key).toBe('keep_in_touch:m-cara:2026-10-27')
    expect(shownTitle(cara)).toBe('Get in touch with Cara Placeholder: last contact 27 Sep, meeting')
    expect(shownTitle(nia)).toBe('Get in touch with Nia Pretend: last contact 28 Aug, LinkedIn request')
    expect(cara.why).toBe('Every 30 days. Due 27 Oct.')
    expect(columnOf(cara)).toBe('other')
    expect(columns([...freshSampleTasks(), ...tasks], '2026-11-11').find((c) => c.key === 'other')!.tasks.map((x) => x.key)).toContain(cara.key)
    expect(status(cara, '2026-11-11')).toBe('late')
    expect(primaryLabel(cara)).toBe('Got in touch')
    expect(typeWord.keep_in_touch).toBe('Keep in touch')
    expect(sourceShort(cara)).toBe('Contact rhythm')
    expect(channelOf(cara)).toBe('linkedin')
    expect(channelOf(nia)).toBe('email')
    expect(starterDraft(cara)?.subject).toBe('Catching up')
    expect(binReasons('keep_in_touch')).toEqual(['Already in touch', 'Not this time', 'Off the list soon'])
    const never = keepInTouchTask({ ...freshSampleMembers()[0], lastContactOn: null, lastContactHow: null, contactEveryDays: 60, nextContactOn: '2026-11-01', contactStatus: 'overdue' })
    expect(never.title).toBe('Get in touch with Ben Sample: no contact yet')
  })

  it('sample mode: the board carries the overdue people, and Got in touch puts them back on track', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
    resetSampleMembers()
    const before = (await sampleSource.tasks()).filter((x) => x.kind === 'keep_in_touch')
    expect(before.map((x) => x.personName)).toEqual(['Cara Placeholder', 'Nia Pretend'])
    await sampleSource.completeTask(before[0])
    expect((await sampleSource.tasks()).filter((x) => x.kind === 'keep_in_touch').map((x) => x.personName)).toEqual(['Nia Pretend'])
    const cara = (await sampleSource.members()).find((m) => m.personId === 'p-cara')!
    expect([cara.lastContactOn, cara.contactStatus]).toEqual(['2026-11-11', 'on_track'])
  })
})
