import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { night, nightTone, theme, tone } from '../theme/tokens'
import { firstNameOf, problemInUrl, readClaims } from './auth'
import { twoDigits } from './format'
import { nextLine } from './nextLine'
import { landing, sections, visibleSections } from './sections'
import { dateLine, greeting, isWeekend, ukClock, ukTime, weekdayOf } from './time'

const wed = new Date('2026-11-11T10:00:00Z')

describe('format', () => {
  it('pads to two digits and caps at 99 with a plus', () => {
    expect(twoDigits(0)).toEqual({ text: '00', plus: false })
    expect(twoDigits(7)).toEqual({ text: '07', plus: false })
    expect(twoDigits(99)).toEqual({ text: '99', plus: false })
    expect(twoDigits(140)).toEqual({ text: '99', plus: true })
  })
})

describe('time', () => {
  it('reads the clock in UK time, in winter and summer', () => {
    expect(ukClock(new Date('2026-11-14T23:30:00Z'))).toMatchObject({ weekday: 'Saturday', hour: 23, date: '2026-11-14' })
    // British Summer Time: 23:30 UTC is 00:30 the next day in London.
    expect(ukClock(new Date('2026-07-01T23:30:00Z'))).toMatchObject({ weekday: 'Thursday', hour: 0, date: '2026-07-02' })
    expect(ukTime(new Date('2026-07-01T13:05:00Z'))).toBe('14:05')
  })

  it('writes the date line and greeting', () => {
    expect(dateLine(wed)).toBe('Wednesday 11 November')
    expect(greeting(new Date('2026-11-11T11:59:00Z'))).toBe('Morning')
    expect(greeting(new Date('2026-11-11T12:00:00Z'))).toBe('Afternoon')
    expect(greeting(new Date('2026-11-11T18:00:00Z'))).toBe('Evening')
    expect(isWeekend(new Date('2026-11-14T10:00:00Z'))).toBe(true)
    expect(isWeekend(wed)).toBe(false)
    expect(weekdayOf('2026-11-09')).toBe('Monday')
  })
})

describe('next line (section 14.9)', () => {
  const fu = { due: 3, late: 3, lateFromDay: 'Monday' }
  const soon = { id: 'c1', startsAt: '2026-11-11T10:15:00Z', title: 'Screen', callType: 'candidate_screen', personName: 'Ada Example' }

  it('1: a call within 20 minutes beats everything', () => {
    const line = nextLine({ now: wed, calls: [soon], followUps: fu, needsYou: 5 })
    expect(line).toEqual({ text: 'Your call with Ada Example starts at 10:15', to: '/home?card=prep:c1' })
  })

  it('1: a call 21 minutes away or already started does not match', () => {
    const later = { ...soon, startsAt: '2026-11-11T10:21:00Z' }
    const past = { ...soon, startsAt: '2026-11-11T09:59:00Z' }
    expect(nextLine({ now: wed, calls: [later, past] }).text).toBe('All clear')
  })

  it('2: a cold search comes next', () => {
    const line = nextLine({ now: wed, coldSearch: { id: 's1', name: 'Sample search', reason: 'no client reply in 7 days' }, followUps: fu })
    expect(line.text).toBe('Sample search has gone cold: no client reply in 7 days')
  })

  it('3: late follow-ups', () => {
    expect(nextLine({ now: wed, followUps: fu, needsYou: 5 })).toEqual({
      text: "Start with 3 follow-ups from Monday's calls",
      to: '/leads/follow-ups',
    })
    expect(nextLine({ now: wed, followUps: { due: 1, late: 1, lateFromDay: null } }).text).toBe('Start with 1 follow-up')
  })

  it('4: Monday before 11:00 offers the follow-up block', () => {
    const monday = new Date('2026-11-09T09:30:00Z')
    expect(nextLine({ now: monday, followUps: { due: 6, late: 0, lateFromDay: null }, needsYou: 5 })).toEqual({
      text: 'Follow-up block: 6 people from last week',
      to: '/leads/follow-ups?focus=monday',
    })
    const mondayNoon = new Date('2026-11-09T12:00:00Z')
    expect(nextLine({ now: mondayNoon, followUps: { due: 6, late: 0, lateFromDay: null }, needsYou: 5 }).to).toBe('/tasks?view=deck')
  })

  it('5: new inbox items', () => {
    expect(nextLine({ now: wed, needsYou: 7 })).toEqual({ text: '7 things need you', to: '/tasks?view=deck' })
    expect(nextLine({ now: wed, needsYou: 1 }).text).toBe('1 thing needs you')
  })

  it('6 and 7: league due, then behind pace', () => {
    expect(nextLine({ now: wed, leagueDue: 4 }).text).toBe('4 people on the league are due')
    const behind = { sentence: '6 more posts to chase this week', to: '/leads/jobs' }
    expect(nextLine({ now: wed, behindPace: behind })).toEqual({ text: behind.sentence, to: behind.to })
  })

  it('8: All clear hides Start. Friday after 15:00 with every target met says Week done', () => {
    expect(nextLine({ now: wed })).toEqual({ text: 'All clear', to: null })
    const friday = new Date('2026-11-13T15:30:00Z')
    expect(nextLine({ now: friday, week: { hit: 4, total: 4 } })).toEqual({ text: 'Week done. 4 of 4', to: null })
    expect(nextLine({ now: friday, week: { hit: 3, total: 4 } }).text).toBe('All clear')
  })
})

describe('sections', () => {
  it('has the file tabs in order, one word each except Business development (docs/decisions.md)', () => {
    for (const s of sections) expect(s.label === 'Business development' || /^\w+$/.test(s.label)).toBe(true)
    expect(landing(sections[2])).toBe('/leads/jobs')
    expect(landing(sections[0])).toBe('/home')
  })

  it('shows the reviewer Numbers and Searches only (section 5.6)', () => {
    expect(visibleSections('reviewer').map((s) => s.label)).toEqual(['Searches', 'Numbers'])
  })
})

describe('auth helpers', () => {
  it('reads the role from the token and takes a first name', () => {
    const body = btoa(JSON.stringify({ app_role: 'owner', email: 'someone@example.com' }))
    expect(readClaims(`x.${body}.y`).app_role).toBe('owner')
    expect(readClaims('not-a-token')).toEqual({})
    expect(firstNameOf('Jason Sample', 'x@example.com')).toBe('Jason')
    expect(firstNameOf(undefined, 'jason.sample@example.com')).toBe('Jason')
  })

  it('tells a dead link from a refusal from what the auth service put in the address', () => {
    expect(problemInUrl('', '')).toBeNull()
    expect(problemInUrl('', '#access_token=x&type=magiclink')).toBeNull()
    expect(
      problemInUrl('', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'),
    ).toBe('expired')
    expect(problemInUrl('?error=access_denied&error_description=Signups+not+allowed', '')).toBe('refused')
    expect(problemInUrl('', '#error=server_error&error_description=Error+running+hook')).toBe('failed')
  })
})

describe('theme tokens', () => {
  const css = readFileSync('src/theme/theme.css', 'utf8').toLowerCase()

  it('matches the CSS, so the two can never drift', () => {
    const [paper, nightBlock] = css.split("[data-theme='night']")
    for (const value of [...Object.values(theme.colour), ...Object.values(tone)]) expect(paper).toContain(value.toLowerCase())
    for (const value of [...Object.values(night), ...Object.values(nightTone)]) expect(nightBlock).toContain(value.toLowerCase())
  })

  it('T-FE-3: holds no colour outside the token list', () => {
    const allowed = new Set([...Object.values(theme.colour), ...Object.values(night), ...Object.values(tone), ...Object.values(nightTone)].map((v) => v.toLowerCase()))
    for (const found of css.match(/#[0-9a-f]{3,8}\b/g) ?? []) expect(allowed).toContain(found)
    expect(css).not.toMatch(/rgb|hsl|oklch/)
  })
})
