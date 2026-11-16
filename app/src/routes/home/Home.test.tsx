import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data, type CalendarCall } from '../../lib/data'

// Acceptance tests T-HOME-1 to T-HOME-7 (section 26.8).
// T-HOME-7 (phone width) is a layout check: the stats grid is two columns
// below the md breakpoint. It is checked by screenshot, and by class here.

const session = { firstName: 'Jason', role: 'owner' as const }

function call(id: string, minutesFromNow: number, personName: string): CalendarCall {
  return {
    id,
    startsAt: new Date(Date.now() + minutesFromNow * 60_000).toISOString(),
    title: 'Candidate screen',
    callType: 'candidate_screen',
    personName,
  }
}

function mock(over: Partial<{ needsYou: number; due: number; late: number; calls: CalendarCall[]; hit: number }> = {}) {
  const v = { needsYou: 0, due: 0, late: 0, calls: [] as CalendarCall[], hit: 0, ...over }
  vi.spyOn(data, 'needsYou').mockResolvedValue(v.needsYou)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: v.due, late: v.late, lateFromDay: v.late ? 'Monday' : null })
  // The second number is live searches (15 November); `due` stands in for how many are live.
  const live = Array.from({ length: v.due }, (_, i) => ({ id: `s${i}`, status: 'open', health: 'warm' }))
  vi.spyOn(data, 'searches').mockResolvedValue(live as unknown as Awaited<ReturnType<typeof data.searches>>)
  vi.spyOn(data, 'callsToday').mockResolvedValue(v.calls)
  vi.spyOn(data, 'dayToday').mockResolvedValue(v.calls)
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: v.hit, total: 4 })
}

function open() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <SignedIn session={session} />
    </MemoryRouter>,
  )
}

function values() {
  return screen.getAllByTestId('hero-value').map((el) => el.textContent)
}

beforeEach(() => {
  // A Wednesday at 10:00 UK time, so no time-of-week rule interferes.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Home', () => {
  it('T-HOME-1 shows 07, 03, 06 and 2/4 with two ticks filled', async () => {
    const calls = [1, 2, 3, 4, 5, 6].map((h) => call(`c${h}`, h * 60, `Person ${h}`))
    mock({ needsYou: 7, due: 3, late: 3, calls, hit: 2 })
    open()
    await waitFor(() => expect(values()).toEqual(['07', '03', '06', '2/4']))
    const meter = screen.getByRole('img', { name: '2 of 4' })
    expect(meter.querySelectorAll('[data-filled="true"]')).toHaveLength(2)
    expect(meter.querySelectorAll('[data-filled="false"]')).toHaveLength(2)
  })

  it('T-HOME-2 holds a date, a greeting, four stats, one rule, one sentence and one button. Nothing more', async () => {
    mock({ needsYou: 7, due: 3, late: 3, hit: 2 })
    open()
    const sheet = screen.getByRole('main')
    await waitFor(() => expect(within(sheet).getByTestId('next-line')).not.toBeEmptyDOMElement())
    expect(sheet.querySelectorAll('[data-hero-stat]')).toHaveLength(4)
    expect(sheet.querySelectorAll('hr')).toHaveLength(1)
    expect(sheet.querySelectorAll('h1')).toHaveLength(1)
    expect(within(sheet).getByText('Wednesday 11 November')).toBeInTheDocument()
    expect(within(sheet).getByRole('heading')).toHaveTextContent('Morning, Jason')
    expect(sheet.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    // Icons are allowed (14 November 2026); charts, lists and tables are not.
    expect(sheet.querySelectorAll('ul, ol, table, svg:not([data-icon]), canvas, img:not([role])')).toHaveLength(0)
    // Every piece of text on the sheet is accounted for.
    expect(sheet.querySelectorAll('p')).toHaveLength(2)
  })

  it('T-HOME-3 shows a dash for a count that fails and still loads the other three', async () => {
    mock({ due: 3, late: 3, calls: [call('c1', 120, 'Person 1')], hit: 2 })
    vi.spyOn(data, 'needsYou').mockRejectedValue(new Error('down'))
    open()
    await waitFor(() => expect(values()).toEqual(['–', '03', '01', '2/4']))
  })

  it('T-HOME-4 says All clear and hides Start when everything is at zero', async () => {
    mock()
    open()
    await waitFor(() => expect(screen.getByTestId('next-line')).toHaveTextContent('All clear'))
    expect(values()).toEqual(['00', '00', '00', '0/4'])
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
  })

  it('T-HOME-5 names a call starting in 10 minutes, and Start opens its prep card', async () => {
    mock({ needsYou: 7, due: 3, late: 3, calls: [call('c9', 10, 'Ada Example')] })
    vi.spyOn(data, 'followUps').mockResolvedValue([])
    open()
    await waitFor(() =>
      expect(screen.getByTestId('next-line')).toHaveTextContent('Your call with Ada Example starts at 10:10'),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    const card = await screen.findByRole('dialog', { name: 'Ada Example' })
    expect(within(card).getAllByText('Candidate screen').length).toBeGreaterThan(0)
    expect(within(card).getByText('The role')).toBeInTheDocument()
    expect(within(card).getByText('10:10, 05:10 ET')).toBeInTheDocument()
    expect(card.querySelectorAll('[data-kind="primary"]')).toHaveLength(0)
  })

  it('P1-32 Calls today opens a card of the calls with UK and US Eastern times, and Prep opens the prep card', async () => {
    const calls = [call('c1', 60, 'Ada Example'), { ...call('c2', 120, 'Cara Placeholder'), callType: 'client_update' }, { ...call('c3', 180, 'Eve Invented'), callType: 'reference' }]
    mock({ calls, hit: 2 })
    vi.spyOn(data, 'followUps').mockResolvedValue([
      { id: 'f1', personId: null, personName: 'Cara Placeholder', company: 'Fabrikam Test Ltd', kind: 'chase', reason: 'Waiting for feedback on two CVs', source: 'email', direction: 'waiting', dueOn: '2026-11-10', status: 'open', snoozedUntil: null, message: null, createdAt: '2026-11-09T10:00:00Z' },
    ])
    open()
    await waitFor(() => expect(values()[2]).toBe('03'))
    await userEvent.click(screen.getByRole('button', { name: /Calls today/ }))
    const card = await screen.findByRole('dialog', { name: 'Your day' })
    const rows = card.querySelectorAll('[data-call]')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('11:00')
    expect(rows[0]).toHaveTextContent('06:00 ET')
    expect(rows[0]).toHaveTextContent('Ada Example')
    expect(rows[1]).toHaveTextContent('Client update')
    expect(card.querySelectorAll('[data-kind="primary"]')).toHaveLength(0)
    await userEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: 'Prep' }))
    const prep = await screen.findByRole('dialog', { name: 'Cara Placeholder' })
    expect(within(prep).getByText('Waiting on feedback')).toBeInTheDocument()
    expect(within(prep).getByText('Waiting for feedback on two CVs')).toBeInTheDocument()
    expect(within(prep).getByText('12:00, 07:00 ET')).toBeInTheDocument()
  })

  it('T-HOME-6 changes nothing while open, and refreshes when focus returns', async () => {
    mock({ needsYou: 7 })
    open()
    await waitFor(() => expect(values()[0]).toBe('07'))
    // Agents run for an hour. The page is not told and does not ask.
    vi.spyOn(data, 'needsYou').mockResolvedValue(12).mockClear()
    vi.setSystemTime(new Date('2026-11-11T11:00:00Z'))
    await new Promise((r) => setTimeout(r, 20))
    expect(values()[0]).toBe('07')
    expect(data.needsYou).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(values()[0]).toBe('12'))
  })

  it('T-HOME-7 stacks the stats two by two on a phone', async () => {
    mock()
    open()
    const grid = screen.getByRole('main').querySelector('[data-hero-stat]')!.parentElement!
    expect(grid.className).toContain('grid-cols-2')
    expect(grid.className).toContain('md:grid-cols-4')
  })

  it('HOME-5 puts a dot on Inbox and Leads only, with no count', async () => {
    mock({ needsYou: 7, due: 3, late: 3 })
    open()
    await waitFor(() => expect(screen.getAllByTestId('tab-dot')).toHaveLength(2))
    const tabs = screen.getAllByRole('navigation', { name: 'Sections' })[0]
    expect(within(tabs).getByRole('link', { name: /Inbox/ })).toContainElement(screen.getAllByTestId('tab-dot')[0])
    expect(within(tabs).getByRole('link', { name: /Business development/ })).toContainElement(screen.getAllByTestId('tab-dot')[1])
    expect(tabs.textContent).not.toMatch(/\d/)
  })

  it('opens a file tab with a number key', async () => {
    mock()
    open()
    await userEvent.keyboard('2')
    expect(await screen.findByRole('heading', { name: 'Inbox' })).toBeInTheDocument()
    await userEvent.keyboard('3')
    expect(await screen.findByRole('heading', { name: 'Business development' })).toBeInTheDocument()
    await userEvent.keyboard(']')
    expect(screen.getByRole('link', { name: 'Referrals and leads' })).toHaveAttribute('aria-current', 'page')
  })
})
