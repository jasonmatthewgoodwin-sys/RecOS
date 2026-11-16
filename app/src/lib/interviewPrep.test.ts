import { describe, expect, it } from 'vitest'
import { PREP_BOOKING_URL, prepBody, prepSubject } from './interviewPrep'

// Invented names only (CLAUDE.md).
const base = { name: 'Finn Fictional', client: 'Contoso', role: 'Director of Product Marketing' }

describe('interview prep', () => {
  it('the prep email greets by first name, lists what to prepare and carries no booking link', () => {
    const t = prepBody({ ...base, kind: 'email' })
    expect(t.startsWith('Hi Finn,')).toBe(true)
    expect(t).toContain('What you know of Contoso')
    expect(t).not.toContain(PREP_BOOKING_URL)
    expect(t).not.toContain('!')
  })

  it('offer a call and both carry the booking link; both keeps the points', () => {
    const call = prepBody({ ...base, kind: 'call' })
    expect(call).toContain(PREP_BOOKING_URL)
    expect(call).not.toContain('Three questions')
    const both = prepBody({ ...base, kind: 'both', interviewAt: '2026-11-20T15:00:00Z' })
    expect(both).toContain(PREP_BOOKING_URL)
    expect(both).toContain('Three questions')
    expect(both).toContain('on Friday 20 November')
  })

  it('a confidential search keeps the client out of the subject', () => {
    expect(prepSubject({ ...base, kind: 'email' })).toBe('Interview prep: Director of Product Marketing at Contoso')
    expect(prepSubject({ ...base, kind: 'email', confidential: true })).toBe('Interview prep: Director of Product Marketing')
  })
})
