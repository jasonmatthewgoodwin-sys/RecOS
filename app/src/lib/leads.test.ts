import { afterEach, describe, expect, it } from 'vitest'
import { byFit, cityName, daysSince, funnel, funnelRatios, leadSourceWord, matchesFilter, nextStage, outreachShort, primaryLabel } from './leads'
import { freshSampleLeads, resetSampleLeads, sampleSource } from './sample'

afterEach(() => resetSampleLeads())

describe('leads helpers', () => {
  it('turns city codes into words', () => {
    expect(cityName('new_york')).toBe('New York')
    expect(cityName('remote_us')).toBe('Remote US')
    expect(cityName(null)).toBe('')
  })

  it('counts whole days since a date', () => {
    expect(daysSince('2026-11-09', '2026-11-11')).toBe(2)
    expect(daysSince('2026-11-11', '2026-11-11')).toBe(0)
  })

  it('sorts highest fit first, unknown last, then the oldest first', () => {
    const leads = freshSampleLeads()
    const sorted = [...leads].sort(byFit)
    expect(sorted[0].company).toBe('Umbrella Sample')
    const scores = sorted.map((l) => l.fitScore ?? -1)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it('names the next stage and the primary button', () => {
    expect(nextStage('new')).toBe('chased')
    expect(nextStage('chased')).toBe('replied')
    expect(nextStage('replied')).toBe('meeting_booked')
    expect(nextStage('meeting_booked')).toBeNull()
    expect(nextStage('dead')).toBeNull()
    const lead = freshSampleLeads().find((l) => l.existingClient)!
    expect(primaryLabel(lead)).toBe('Tell the account owner')
    expect(primaryLabel({ ...lead, existingClient: false })).toBe('Chased')
    expect(primaryLabel({ ...lead, stage: 'passed' })).toBeNull()
  })

  it('counts the funnel over the last 8 weeks from the stage dates', () => {
    const f = funnel(
      [
        { firstSeenOn: '2026-11-01', chasedOn: '2026-11-02', repliedOn: null, meetingOn: null, wonOn: null },
        { firstSeenOn: '2026-08-01', chasedOn: '2026-08-02', repliedOn: '2026-10-30', meetingOn: null, wonOn: null },
      ].map((d) => ({ ...freshSampleLeads()[0], ...d })),
      '2026-11-11',
    )
    expect(f).toEqual({ found: 1, chased: 1, replied: 1, meetings: 0, won: 0 })
    expect(funnelRatios({ found: 64, chased: 41, replied: 9, meetings: 4, won: 1 })).toBe(
      '64% of found were chased. 22% of chased replied. 44% of replies became meetings. 25% of meetings were won',
    )
    expect(funnelRatios({ found: 0, chased: 0, replied: 0, meetings: 0, won: 0 })).toBe('Nothing to compare yet')
    expect(funnelRatios({ found: 4, chased: 0, replied: 0, meetings: 0, won: 0 })).toBe('0% of found were chased')
  })
})

describe('sample leads', () => {
  it('moves a lead to chased once and the weekly number rises', async () => {
    const before = await sampleSource.chasedThisWeek()
    await sampleSource.setLeadStage('job-northwind', 'chased')
    const after = await sampleSource.chasedThisWeek()
    expect(after.total).toBe(before.total + 1)
    const lead = (await sampleSource.jobLeads()).find((l) => l.id === 'job-northwind')!
    expect(lead.stage).toBe('chased')
    expect(lead.chasedOn).not.toBeNull()
  })

  it('refuses dead without a reason and won without a search, as the database does', async () => {
    await expect(sampleSource.setLeadStage('job-northwind', 'dead')).rejects.toThrow()
    await expect(sampleSource.setLeadStage('job-northwind', 'job_won')).rejects.toThrow()
    await sampleSource.setLeadStage('job-northwind', 'dead', 'filled')
    const lead = (await sampleSource.jobLeads()).find((l) => l.id === 'job-northwind')!
    expect(lead.deadReason).toBe('filled')
    await sampleSource.setLeadStage('job-northwind', 'new')
    expect((await sampleSource.jobLeads()).find((l) => l.id === 'job-northwind')!.deadReason).toBeNull()
  })

  it('holds no contact details', async () => {
    const text = JSON.stringify(await sampleSource.jobLeads())
    expect(text).not.toMatch(/@|\+?\d{3}[\s-]?\d{3}[\s-]?\d{4}/)
  })
})

describe('Ad and post chasers tiles (18 Nov)', () => {
  const base = freshSampleLeads()[0]
  it('says where the outreach stands in one short word', () => {
    expect(outreachShort({ outreachStage: 'found', connectMessageId: null })).toBeNull()
    expect(outreachShort({ outreachStage: 'found', connectMessageId: 'm-1' })).toBe('Request queued')
    expect(outreachShort({ outreachStage: 'connection_sent', connectMessageId: 'm-1' })).toBe('Request sent')
    expect(outreachShort({ outreachStage: 'connected', connectMessageId: 'm-1' })).toBe('Accepted')
    expect(outreachShort({ outreachStage: 'messaged', connectMessageId: 'm-1' })).toBe('Messaged')
    expect(outreachShort({ outreachStage: 'replied', connectMessageId: 'm-1' })).toBe('Replied')
  })
  it('names the source in words, LinkedIn post and Alex leads first', () => {
    expect(leadSourceWord(['linkedin_post'])).toBe('LinkedIn post')
    expect(leadSourceWord(['linkedin_advert', 'alex_leads'])).toBe("Alex's leads")
    expect(leadSourceWord([])).toBeNull()
  })
  it('Request sent and Accepted follow the outreach on open leads only', () => {
    expect(matchesFilter({ ...base, outreachStage: 'connection_sent' }, 'sent')).toBe(true)
    expect(matchesFilter({ ...base, outreachStage: 'connected' }, 'accepted')).toBe(true)
    expect(matchesFilter({ ...base, outreachStage: 'connected', stage: 'dead' }, 'accepted')).toBe(false)
    expect(matchesFilter({ ...base, outreachStage: 'found' }, 'sent')).toBe(false)
  })
})
