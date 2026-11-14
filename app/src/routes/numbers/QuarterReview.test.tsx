import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import type { Session } from '../../lib/auth'
import { data } from '../../lib/data'
import { movedWords, summaryDraft } from '../../lib/numbers'
import { resetSampleKpis, resetSampleReviews, sampleSource } from '../../lib/sample'

// P1-43: Numbers, Quarter (32.2) and Review (32.3). T-NUM-4 (32.5).

const owner = { firstName: 'Jason', role: 'owner' as const }
const reviewer = { firstName: 'Sam', role: 'reviewer' as const }

function mock() {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 3, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockImplementation(sampleSource.weekTargets)
  vi.spyOn(data, 'kpiQuarter').mockImplementation(sampleSource.kpiQuarter)
  vi.spyOn(data, 'followUpsQuarter').mockImplementation(sampleSource.followUpsQuarter)
  vi.spyOn(data, 'bdFunnel').mockImplementation(sampleSource.bdFunnel)
  vi.spyOn(data, 'kpiWeeks').mockImplementation(sampleSource.kpiWeeks)
  vi.spyOn(data, 'kpiOutputWeeks').mockImplementation(sampleSource.kpiOutputWeeks)
  vi.spyOn(data, 'followUpsWeeks').mockImplementation(sampleSource.followUpsWeeks)
  vi.spyOn(data, 'weeklyReview').mockImplementation(sampleSource.weeklyReview)
  vi.spyOn(data, 'systemWeeks').mockImplementation(sampleSource.systemWeeks)
  return { save: vi.spyOn(data, 'saveWeeklyReview').mockImplementation(sampleSource.saveWeeklyReview) }
}

function open(path: string, session: Session = owner) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SignedIn session={session} />
    </MemoryRouter>,
  )
}

const value = () => screen.getByTestId('hero-value').textContent

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // A Monday morning, 16 November 2026. Last week is w/c 9 November.
  vi.setSystemTime(new Date('2026-11-16T09:00:00Z'))
  resetSampleKpis()
  resetSampleReviews()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Numbers, Quarter', () => {
  it('shows the quarterly target in view with a stepper over three, the outputs table and the funnel as a line', async () => {
    mock()
    open('/numbers/quarter')
    await waitFor(() => expect(value()).toBe('0/1'))
    expect(screen.getByText('Events held')).toBeInTheDocument()
    expect(screen.getByTestId('stepper')).toHaveTextContent('1 of 3')
    await userEvent.keyboard('{ArrowRight}')
    expect(value()).toBe('1/3')
    expect(screen.getByText('Blogs published')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(value()).toBe('2/3')
    expect(screen.getByText('Testimonials')).toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Outputs this quarter' })
    const cells = within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent))
    expect(cells).toEqual([
      ['Client meetings', '4'],
      ['Jobs won', '1'],
      ['Shortlists sent', '2'],
      ['First interviews', '3'],
      ['Offers', '1'],
      ['Placements', '0'],
      ['Referrals received', '1'],
      ['Leads passed to colleagues', '1'],
      ['Follow-ups on time', '5 of 6'],
    ])
    expect(screen.getByRole('main').querySelectorAll('svg, canvas')).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: 'Show funnel' }))
    const line = await waitFor(() => screen.getByRole('main').querySelector('[data-number-line]')!)
    expect(line).toHaveTextContent(/\d+ found.*\d+ chased.*\d+ replied.*\d+ meetings.*\d+ won/)
    expect(screen.getByText('The search funnel arrives with searches, in phase 2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Forecast' }))
    expect(screen.getByText('The forecast arrives with searches, in phase 2')).toBeInTheDocument()
  })
})

describe('Numbers, Review', () => {
  it("T-NUM-4 on a Monday shows last week's four lines filled and three text fields empty and ready", async () => {
    mock()
    open('/numbers/review')
    expect(await screen.findByTestId('week')).toHaveTextContent('w/c 9 November')
    const last = await screen.findByRole('region', { name: 'Last week' })
    await waitFor(() => expect(within(last).getAllByRole('listitem')).toHaveLength(4))
    const lines = within(last).getAllByRole('listitem').map((li) => li.textContent)
    expect(lines).toEqual(['Job posts chased22/20Hit', 'Coaching calls5/5Hit', 'LinkedIn posts2/2Hit', 'New A-star candidates6/5Hit'])
    expect(screen.getByRole('region', { name: 'What moved' })).toHaveTextContent('1 shortlist, 2 first interviews.')
    expect(screen.getByRole('region', { name: 'What moved' })).toHaveTextContent('Follow-ups on time: 5 of 6.')
    for (const label of ['What I learned', 'What changes', 'Next week']) {
      expect(screen.getByLabelText(label)).toHaveValue('')
    }
    expect(screen.getByLabelText('Quarterly focus')).toHaveValue('')
    const summary = screen.getByRole('textbox', { name: 'Summary' }) as HTMLTextAreaElement
    expect(summary.value).toContain('Subject: PMM weekly KPIs - w/c 9 November')
    expect(summary.value).toContain('Job posts chased: 22/20, hit')
    expect(summary.value).toContain('Notes to add before the review.')
    expect(screen.getByRole('main').querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    // The health line for the owner only (33.7).
    expect(await screen.findByTestId('system-line')).toHaveTextContent('System: 11 runs, 0 failed, 63 items, 14 sent for you.')
  })

  it('notes save when a field is left and flow into the summary; the arrows reach the week before', async () => {
    const { save } = mock()
    open('/numbers/review')
    const learned = await screen.findByLabelText('What I learned')
    await userEvent.type(learned, 'Chasing on Tuesday works best.')
    await userEvent.tab()
    await waitFor(() => expect(save).toHaveBeenCalledWith('2026-11-09', expect.objectContaining({ learned: 'Chasing on Tuesday works best.' })))
    const summary = screen.getByRole('textbox', { name: 'Summary' }) as HTMLTextAreaElement
    expect(summary.value).toContain('What I learned: Chasing on Tuesday works best.')
    expect(summary.value).not.toContain('Notes to add')

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByTestId('week')).toHaveTextContent('w/c 2 November')
    const last = screen.getByRole('region', { name: 'Last week' })
    expect(last).toHaveTextContent('Not logged')
    await waitFor(() => expect(screen.getByLabelText('What I learned')).toHaveValue(''))
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByTestId('week')).toHaveTextContent('w/c 9 November')
    await waitFor(() => expect(screen.getByLabelText('What I learned')).toHaveValue('Chasing on Tuesday works best.'))
  })

  it('the reviewer reads the page and cannot type', async () => {
    const { save } = mock()
    open('/numbers/review', reviewer)
    await screen.findByRole('region', { name: 'Last week' })
    expect(screen.queryByRole('form', { name: 'Notes' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Notes' })).getAllByText('Nothing written')).toHaveLength(4)
    expect(save).not.toHaveBeenCalled()
    expect(screen.queryByTestId('system-line')).not.toBeInTheDocument()
  })
})

describe('the summary and the What moved line', () => {
  it('reads as the A1 message shape, says so when away, and names nothing when nothing moved', () => {
    expect(movedWords([], '2026-11-09', false)).toBe('Nothing moved.')
    expect(movedWords([{ kpi: 'offers', week: '2026-11-09', total: 1, pmmTotal: 1 }], '2026-11-09', false)).toBe('1 offer.')
    const text = summaryDraft({
      week: '2026-11-09',
      lines: [{ kpi: 'posts_chased', name: 'Job posts chased', fraction: '12/20', hit: false, mark: false }],
      moved: 'Nothing moved.',
      followUps: undefined,
      review: { learned: '', changes: '', plan: 'Away Thursday and Friday.', quarterlyFocus: '' },
    })
    expect(text.startsWith('Subject: PMM weekly KPIs - w/c 9 November\n\nOlly,\n\nI was away for part of the week.')).toBe(true)
    expect(text).toContain('Job posts chased: 12/20, missed')
    expect(text).toContain('Next week: Away Thursday and Friday.')
    expect(text.endsWith('\nJason')).toBe(true)
    expect(summaryDraft({ week: '2026-11-09', lines: [], moved: 'Nothing moved.', followUps: undefined, review: null })).toContain('No logged activity this week')
  })
})
