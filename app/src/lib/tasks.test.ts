import { afterEach, describe, expect, it } from 'vitest'
import { band, binReasons, byOrder, channelOf, columns, dueWord, leadEmail, leadMove, leadStatus, linkedinUrl, primaryLabel, snoozeChoices, status, type Task } from './tasks'
import { freshSampleTasks, resetSampleTasks, sampleSource } from './sample'

// The Tasks rules: band, status, order, words. Today is a Monday.
const today = '2026-11-16'

function t(over: Partial<Task>): Task {
  return { ...freshSampleTasks()[0], edits: { title: null, notes: null, dueOn: null, sortOrder: null }, waitingOn: null, dueOn: null, rank: 0, ...over }
}

afterEach(() => resetSampleTasks())

describe('task rules', () => {
  it('bands by due date, then by rank', () => {
    expect(band(t({ dueOn: '2026-11-15' }), today)).toBe('now')
    expect(band(t({ dueOn: today }), today)).toBe('now')
    expect(band(t({ dueOn: '2026-11-22' }), today)).toBe('week')
    expect(band(t({ dueOn: '2026-11-23' }), today)).toBe('later')
    expect(band(t({ rank: 50 }), today)).toBe('now')
    expect(band(t({ rank: 30 }), today)).toBe('week')
    expect(band(t({ rank: 5 }), today)).toBe('later')
    expect(band(t({ kind: 'system_notice' }), today)).toBe('now')
    // The owner's own due date wins.
    expect(band(t({ dueOn: '2026-12-01', edits: { title: null, notes: null, dueOn: today, sortOrder: null } }), today)).toBe('now')
  })

  it('status: waiting beats the date; late, today, on track', () => {
    expect(status(t({ dueOn: '2026-11-10', waitingOn: 'Their reply' }), today)).toBe('waiting')
    expect(status(t({ dueOn: '2026-11-10' }), today)).toBe('late')
    expect(status(t({ dueOn: today }), today)).toBe('today')
    expect(status(t({ dueOn: '2026-11-20' }), today)).toBe('on_track')
    expect(status(t({}), today)).toBe('on_track')
  })

  it('due words: Today, a weekday within the week, otherwise a short date', () => {
    expect(dueWord(t({ dueOn: today }), today)).toBe('Today')
    expect(dueWord(t({ dueOn: '2026-11-19' }), today)).toBe('Thu')
    expect(dueWord(t({ dueOn: '2026-11-13' }), today)).toBe('Fri')
    expect(dueWord(t({ dueOn: '2026-12-03' }), today)).toBe('3 Dec')
    expect(dueWord(t({}), today)).toBe('')
  })

  it('orders by the owner first, then rank, then the nearer date', () => {
    const a = t({ key: 'a', rank: 10, dueOn: '2026-11-20' })
    const b = t({ key: 'b', rank: 40, dueOn: '2026-11-21' })
    const c = t({ key: 'c', rank: 40, dueOn: '2026-11-18' })
    const d = t({ key: 'd', rank: 1, edits: { title: null, notes: null, dueOn: null, sortOrder: 1 } })
    const late = t({ key: 'late', rank: 2, dueOn: '2026-11-10' })
    expect([a, b, c, d, late].sort(byOrder(today)).map((x) => x.key)).toEqual(['d', 'late', 'c', 'b', 'a'])
  })

  it('puts waiting tasks in their own column whatever the band', () => {
    const cols = columns(
      [t({ key: 'w', dueOn: today, waitingOn: 'The client' }), t({ key: 'n', dueOn: today }), t({ key: 'l', rank: 1 })],
      today,
    )
    expect(cols.map((c) => [c.key, c.tasks.map((x) => x.key)])).toEqual([
      ['now', ['n']],
      ['week', []],
      ['later', ['l']],
      ['waiting', ['w']],
    ])
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
