import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import type { Session } from '../../lib/auth'
import { data } from '../../lib/data'
import { streakSentence } from '../../lib/numbers'
import { resetSampleKpis, sampleSource } from '../../lib/sample'

// P1-42: Numbers, This week (32.1). T-NUM-1 to T-NUM-3 (32.5).

const owner = { firstName: 'Jason', role: 'owner' as const }
const reviewer = { firstName: 'Sam', role: 'reviewer' as const }

function mock() {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 3, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockImplementation(sampleSource.weekTargets)
  vi.spyOn(data, 'kpiThisWeek').mockImplementation(sampleSource.kpiThisWeek)
  vi.spyOn(data, 'kpiStreaks').mockImplementation(sampleSource.kpiStreaks)
  vi.spyOn(data, 'kpiEvents').mockImplementation(sampleSource.kpiEvents)
  return { correct: vi.spyOn(data, 'correctKpi').mockImplementation(sampleSource.correctKpi) }
}

function open(session: Session = owner) {
  return render(
    <MemoryRouter initialEntries={['/numbers/this-week']}>
      <SignedIn session={session} />
    </MemoryRouter>,
  )
}

const value = () => screen.getByTestId('hero-value').textContent
const stepper = () => screen.getByTestId('stepper').textContent

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
  resetSampleKpis()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Numbers, This week', () => {
  it('T-NUM-1 shows one KPI at a time with a tick meter, a stepper and a sentence, and no chart', async () => {
    mock()
    open()
    await waitFor(() => expect(value()).toBe('20/20'))
    const main = screen.getByRole('main')
    expect(main.querySelectorAll('[data-hero-stat]')).toHaveLength(1)
    expect(main.querySelectorAll('svg:not([data-icon]), canvas')).toHaveLength(0)
    expect(screen.getByText('Job posts chased')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '20 of 20' })).toBeInTheDocument()
    expect(stepper()).toBe('1 of 4')
    expect(screen.getByTestId('sentence')).toHaveTextContent('Tracking since the week of 9 November.')
    expect(screen.queryByTestId('hero-mark')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(stepper()).toBe('2 of 4')
    expect(value()).toBe('5/5')
    expect(screen.getByText('Coaching calls')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowRight}')
    expect(stepper()).toBe('3 of 4')
    expect(value()).toBe('1/2')
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(stepper()).toBe('1 of 4')
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(stepper()).toBe('4 of 4')
    expect(value()).toBe('3/5')
  })

  it('T-NUM-2 Show what counted lists one line per row, each naming a role and company', async () => {
    mock()
    open()
    await waitFor(() => expect(value()).toBe('20/20'))
    await userEvent.click(screen.getByRole('button', { name: 'Show what counted' }))
    const list = await screen.findByRole('list', { name: 'What counted' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(20)
    for (const li of items) expect(li).toHaveTextContent(/Chased: .+ at .+/)
    await userEvent.click(screen.getByRole('button', { name: 'Hide what counted' }))
    expect(screen.queryByRole('list', { name: 'What counted' })).not.toBeInTheDocument()
  })

  it('T-NUM-3 a correction of minus 2 with a reason shows 18/20 with an m mark, and sits in what counted', async () => {
    const { correct } = mock()
    open()
    await waitFor(() => expect(value()).toBe('20/20'))
    await userEvent.click(screen.getByRole('button', { name: 'Correct this number' }))
    const form = screen.getByRole('form', { name: 'Correct this number' })
    expect(form.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    expect(screen.getByRole('main').querySelectorAll('[data-kind="primary"]')).toHaveLength(1)

    // A reason is required (22.4).
    await userEvent.clear(within(form).getByLabelText('How many'))
    await userEvent.type(within(form).getByLabelText('How many'), '2')
    await userEvent.click(within(form).getByRole('button', { name: 'Save correction' }))
    expect(within(form).getByText('Say why, in a few words.')).toBeInTheDocument()
    expect(correct).not.toHaveBeenCalled()

    await userEvent.type(within(form).getByLabelText('Why'), 'Two were the same post')
    await userEvent.click(within(form).getByRole('button', { name: 'Save correction' }))
    expect(correct).toHaveBeenCalledWith('posts_chased', -2, 'Two were the same post')
    await waitFor(() => expect(value()).toBe('18/20m'))
    expect(screen.getByTestId('hero-mark')).toHaveTextContent('m')
    expect(screen.queryByRole('form')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Show what counted' }))
    const list = await screen.findByRole('list', { name: 'What counted' })
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('−2')
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Correction: Two were the same post')
  })

  it('All four at once is four lines of text, and the reviewer sees no links to the rows or corrections', async () => {
    mock()
    open(reviewer)
    await waitFor(() => expect(value()).toBe('20/20'))
    expect(screen.queryByRole('button', { name: 'Show what counted' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Correct this number' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'All four at once' }))
    const all = screen.getByRole('list', { name: 'All four' })
    expect(within(all).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['20/20Job posts chased', '5/5Coaching calls', '1/2LinkedIn posts', '3/5New A-star candidates'])
    expect(screen.getByRole('switch', { name: 'All work' })).toHaveAttribute('aria-checked', 'false')
  })
})

describe('the sentence instead of a trend chart (14.3)', () => {
  const base = { kpi: 'posts_chased', weeksHistory: 6, firstWeek: '2026-10-05', hitLast4: 3, pmmHitLast4: 2, best12: 24, pmmBest12: 21 }
  it('reads the four cases, PMM by default and all work with the switch', () => {
    expect(streakSentence({ ...base, pmmHitLast4: 4 }, false)).toBe('Hit every week for the last 4.')
    expect(streakSentence(base, false)).toBe('Hit in 2 of the last 4 weeks.')
    expect(streakSentence(base, true)).toBe('Hit in 3 of the last 4 weeks.')
    expect(streakSentence({ ...base, pmmHitLast4: 0 }, false)).toBe('Not hit in the last 4 weeks. Best week was 21.')
    expect(streakSentence({ ...base, weeksHistory: 2 }, false)).toBe('Tracking since the week of 5 October.')
    expect(streakSentence(undefined, false)).toBe('')
  })
})
