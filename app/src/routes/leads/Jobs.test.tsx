import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data } from '../../lib/data'
import { freshSampleLeads } from '../../lib/sample'

// Acceptance tests T-LEAD-1, 2, 3 and 6 (section 28.10), the job card and the
// page states (25.4). T-LEAD-4 and 5 belong to the Wider business and
// Coaching pages. Everything runs on the invented sample leads.

const session = { firstName: 'Jason', role: 'owner' as const }

function mock(over: { chased?: number[]; fail?: boolean } = {}) {
  vi.spyOn(data, 'needsYou').mockResolvedValue(0)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 0, late: 0, lateFromDay: null })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  vi.spyOn(data, 'jobLeads').mockResolvedValue(freshSampleLeads())
  const chased = vi.spyOn(data, 'chasedThisWeek')
  for (const n of over.chased ?? [12, 13]) chased.mockResolvedValueOnce({ total: n, target: 20 })
  const stage = vi.spyOn(data, 'setLeadStage')
  if (over.fail) stage.mockRejectedValue(new Error('down'))
  else stage.mockResolvedValue()
  vi.spyOn(data, 'passLead').mockResolvedValue()
  return { stage }
}

function open(path = '/leads') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SignedIn session={session} />
    </MemoryRouter>,
  )
}

const values = () => screen.getAllByTestId('hero-value').map((el) => el.textContent)
const rows = () => screen.getByRole('main').querySelectorAll('[data-row]')
const row = (title: string) => screen.getByRole('button', { name: new RegExp(`^${title}`) })
/** The whole line: the row button, its hover actions and its meta. */
const line = (title: string) => row(title).closest('li')!
const action = (title: string, name: string) => within(line(title)).getByRole('button', { name })
const primaryIn = (el: HTMLElement) => el.querySelector('[data-kind="primary"]')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Jobs', () => {
  it('T-LEAD-1 opens /leads on Jobs with two hero numbers and 7 rows at most', async () => {
    mock()
    open()
    expect(screen.getByRole('heading', { name: 'Business development' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute('aria-current', 'page')
    await waitFor(() => expect(values()).toEqual(['12/20', '09']))
    const main = screen.getByRole('main')
    expect(main.querySelectorAll('[data-hero-stat]')).toHaveLength(2)
    expect(rows()).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument()
    expect(main.querySelectorAll('ul')).toHaveLength(1)
    expect(main.querySelectorAll('svg:not([data-icon]), canvas, img')).toHaveLength(0)
    expect(main.querySelectorAll('[data-kind="primary"]')).toHaveLength(0)
    // Highest fit first. The row carries the role, the company, the city and the days since first seen.
    expect(rows()[0]).toHaveTextContent('Senior PMM')
    expect(rows()[0]).toHaveTextContent('Northwind Sample Co')
    expect(line('Senior PMM')).toHaveTextContent('New York 2d')
    expect(rows()[0].querySelector('[data-dot]')).toHaveAttribute('data-dot', 'solid')
    expect(rows()[2]).toHaveTextContent('Existing client')
  })

  it('T-LEAD-2 marks a lead Chased from the row: hollow dot, hero up by one, meter gains a tick', async () => {
    const { stage } = mock()
    open()
    await waitFor(() => expect(values()).toEqual(['12/20', '09']))
    expect(screen.getByRole('img', { name: '12 of 20' })).toBeInTheDocument()
    await userEvent.hover(row('Senior PMM'))
    await userEvent.click(action('Senior PMM', 'Chased'))
    expect(row('Senior PMM').querySelector('[data-dot]')).toHaveAttribute('data-dot', 'hollow')
    expect(stage).toHaveBeenCalledWith('job-northwind', 'chased', undefined)
    await waitFor(() => expect(values()[0]).toBe('13/20'))
    expect(screen.getByRole('img', { name: '13 of 20' }).querySelectorAll('[data-filled="true"]')).toHaveLength(13)
    // The row stays where it was, so nothing shifts under the cursor. New is one fewer.
    expect(rows()[0]).toHaveTextContent('Senior PMM')
    expect(values()[1]).toBe('08')
  })

  it('T-LEAD-3 reads Tell the account owner on the card of an existing client, with an introduction', async () => {
    mock()
    open()
    await waitFor(() => expect(rows().length).toBe(7))
    await userEvent.click(row('Head of Product Marketing'))
    const card = screen.getByRole('dialog', { name: 'Head of Product Marketing' })
    expect(within(card).getByRole('button', { name: 'Tell the account owner' })).toHaveAttribute('data-kind', 'primary')
    expect(within(card).getByText('Introduction')).toBeInTheDocument()
    expect(screen.getByRole('main').querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
  })

  it('T-LEAD-6 shows the funnel as one line of five numbers, with ratios on a click. No chart', async () => {
    mock()
    open()
    await waitFor(() => expect(rows().length).toBe(7))
    await userEvent.click(screen.getByRole('button', { name: 'Show funnel' }))
    const line = screen.getByRole('main').querySelector<HTMLElement>('[data-number-line]')!
    expect(line.querySelectorAll('.font-mono')).toHaveLength(5)
    expect(line).toHaveTextContent('12 found')
    expect(line).toHaveTextContent('2 chased')
    expect(line).toHaveTextContent('1 replied')
    expect(line).toHaveTextContent('0 meetings')
    expect(line).toHaveTextContent('0 won')
    expect(screen.queryByText(/of found were chased/)).not.toBeInTheDocument()
    await userEvent.click(within(line as HTMLElement).getByRole('button'))
    expect(screen.getByText(/17% of found were chased/)).toBeInTheDocument()
    expect(screen.getByRole('main').querySelectorAll('svg:not([data-icon]), canvas')).toHaveLength(0)
  })

  it('opens the card from a row by query string and closes it with Esc', async () => {
    mock()
    open()
    await waitFor(() => expect(rows().length).toBe(7))
    await userEvent.click(row('Senior PMM'))
    const card = screen.getByRole('dialog', { name: 'Senior PMM' })
    expect(card).toHaveTextContent('Northwind Sample Co, New York')
    expect(card).toHaveTextContent('B2B SaaS, about 400 people, New York')
    expect(card).not.toHaveTextContent('88')
    expect(within(card).getByRole('link', { name: 'LinkedIn post' })).toHaveAttribute('href', 'https://example.com/post/northwind')
    expect(within(card).getByRole('link', { name: 'Open profile' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Ada Example' })).toBeInTheDocument()
    expect(primaryIn(card)).toHaveTextContent('Chased')
    expect(within(card).getByRole('group', { name: 'Stage' }).querySelector('[aria-current="true"]')).toHaveTextContent('New')
    expect(within(card).getAllByRole('button', { name: /^(Copy draft|Pass to a colleague|Bin)$/ })).toHaveLength(3)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(rows()).toHaveLength(7)
  })

  it('opens the card straight from a link with ?card=job:id', async () => {
    mock()
    open('/leads/jobs?card=job:job-contoso')
    expect(await screen.findByRole('dialog', { name: 'Director of PMM' })).toBeInTheDocument()
  })

  it('Chased on the card moves the lead and the card shows the new stage', async () => {
    const { stage } = mock()
    open()
    await waitFor(() => expect(rows().length).toBe(7))
    await userEvent.click(row('Senior PMM'))
    const card = screen.getByRole('dialog', { name: 'Senior PMM' })
    await userEvent.click(primaryIn(card) as HTMLElement)
    expect(stage).toHaveBeenCalledWith('job-northwind', 'chased', undefined)
    expect(within(card).getByRole('group', { name: 'Stage' }).querySelector('[aria-current="true"]')).toHaveTextContent('Chased')
    expect(primaryIn(card)).toHaveTextContent('Replied')
    expect(screen.getByRole('main').querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
  })

  it('Bin asks for a reason in words, refuses without one, then moves the lead to dead', async () => {
    const { stage } = mock()
    open()
    await waitFor(() => expect(rows().length).toBe(7))
    await userEvent.click(row('Senior PMM'))
    const card = screen.getByRole('dialog', { name: 'Senior PMM' })
    await userEvent.click(within(card).getByRole('button', { name: 'Bin' }))
    const field = within(card).getByRole('combobox', { name: 'Reason' })
    expect(within(field).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Why it is dead',
      'No reply',
      'Filled',
      'Uses another agency',
      'In-house only',
      'Not ICP',
      'Other',
    ])
    await userEvent.click(within(card).getByRole('button', { name: 'Bin' }))
    expect(within(card).getByText('Choose a reason')).toBeInTheDocument()
    expect(stage).not.toHaveBeenCalled()
    await userEvent.selectOptions(field, 'filled')
    await userEvent.click(within(card).getByRole('button', { name: 'Bin' }))
    expect(stage).toHaveBeenCalledWith('job-northwind', 'dead', 'filled')
    expect(card).toHaveTextContent('Filled')
    expect(primaryIn(card)).toBeNull()
    expect(within(card).queryByRole('button', { name: /^(Bin|Pass to a colleague|Copy draft)$/ })).not.toBeInTheDocument()
    // The row stays, struck through and grey.
    expect(row('Senior PMM')).toHaveAttribute('data-done', 'true')
  })

  it('Bin from the row opens the card asking for the reason', async () => {
    mock()
    open()
    await waitFor(() => expect(rows().length).toBe(7))
    await userEvent.hover(row('Director of PMM'))
    await userEvent.click(action('Director of PMM', 'Bin'))
    const card = screen.getByRole('dialog', { name: 'Director of PMM' })
    expect(within(card).getByRole('combobox', { name: 'Reason' })).toBeInTheDocument()
  })

  it('Job won is refused in place until searches exist', async () => {
    const { stage } = mock()
    open()
    await waitFor(() => expect(rows().length).toBe(7))
    await userEvent.click(row('Senior PMM'))
    const card = screen.getByRole('dialog', { name: 'Senior PMM' })
    await userEvent.click(within(card).getByRole('button', { name: 'Job won' }))
    expect(within(card).getByText(/Job won needs a search/)).toBeInTheDocument()
    expect(stage).not.toHaveBeenCalled()
  })

  it('Pass to a colleague needs a name, then closes the lead here', async () => {
    mock()
    open()
    await waitFor(() => expect(rows().length).toBe(7))
    await userEvent.click(row('Senior PMM'))
    const card = screen.getByRole('dialog', { name: 'Senior PMM' })
    await userEvent.click(within(card).getByRole('button', { name: 'Pass to a colleague' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Pass' }))
    expect(within(card).getByText('Say who takes it')).toBeInTheDocument()
    expect(data.passLead).not.toHaveBeenCalled()
    await userEvent.type(within(card).getByRole('textbox', { name: 'Colleague' }), 'Sam Colleague')
    await userEvent.click(within(card).getByRole('button', { name: 'Pass' }))
    expect(data.passLead).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-northwind' }), 'Sam Colleague')
    expect(card).toHaveTextContent('Handed to a colleague')
    expect(row('Senior PMM')).toHaveAttribute('data-done', 'true')
  })

  it('puts the row back and shows one note when the write fails', async () => {
    mock({ fail: true, chased: [12, 12] })
    open()
    await waitFor(() => expect(rows().length).toBe(7))
    await userEvent.hover(row('Senior PMM'))
    await userEvent.click(action('Senior PMM', 'Chased'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not save that. Try again.'))
    expect(row('Senior PMM').querySelector('[data-dot]')).toHaveAttribute('data-dot', 'solid')
    expect(values()[0]).toBe('12/20')
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('filters by stage, with the chosen one shown by weight, and the hero numbers drill in', async () => {
    mock()
    open()
    await waitFor(() => expect(rows().length).toBe(7))
    expect(screen.getByRole('button', { name: 'New', current: true })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Replied' }))
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveTextContent('VP Product Marketing')
    await userEvent.click(screen.getByRole('button', { name: 'Meeting' }))
    expect(screen.getByText('No meetings booked')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(rows()).toHaveLength(7)
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(rows()).toHaveLength(12)
    expect(row('PMM Lead')).toHaveAttribute('data-done', 'true')
    await userEvent.click(screen.getAllByTestId('hero-value')[0].closest('button')!)
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveTextContent('Initech Mock')
  })

  it('sets leads under 40 below one hairline labelled Lower fit', async () => {
    mock()
    open()
    await waitFor(() => expect(rows().length).toBe(7))
    expect(screen.getByRole('main').querySelectorAll('[data-divider]')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    const dividers = screen.getByRole('main').querySelectorAll('[data-divider]')
    expect(dividers).toHaveLength(1)
    expect(dividers[0]).toHaveTextContent('Lower fit')
    expect(dividers[0].nextElementSibling).toHaveTextContent('Marketing Manager')
  })

  it('shows dashes and three dots while loading, and one line when the list fails', async () => {
    mock({ chased: [] })
    let release: (v: never[]) => void = () => {}
    vi.spyOn(data, 'jobLeads').mockReturnValue(new Promise((r) => (release = r)))
    vi.spyOn(data, 'chasedThisWeek').mockReturnValue(new Promise(() => {}))
    open()
    expect(values()).toEqual(['–', '–'])
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show funnel' })).not.toBeInTheDocument()
    release([])
    await waitFor(() => expect(screen.getByText('No new leads')).toBeInTheDocument())
    expect(values()).toEqual(['–', '00'])
  })

  it('says Could not load when the list fails, and the rest of the page stays usable', async () => {
    mock()
    vi.spyOn(data, 'jobLeads').mockRejectedValue(new Error('down'))
    open()
    await waitFor(() => expect(screen.getByText('Could not load. Try again.')).toBeInTheDocument())
    await waitFor(() => expect(values()[0]).toBe('12/20'))
    expect(screen.getByRole('link', { name: 'Referrals' })).toBeInTheDocument()
  })

  it('moves between rows with j and k, and x opens the card ready to bin', async () => {
    mock()
    open()
    await waitFor(() => expect(rows().length).toBe(7))
    await userEvent.keyboard('j')
    expect(rows()[0]).toHaveFocus()
    await userEvent.keyboard('j')
    expect(rows()[1]).toHaveFocus()
    await userEvent.keyboard('k')
    expect(rows()[0]).toHaveFocus()
    await userEvent.keyboard('x')
    const card = screen.getByRole('dialog', { name: 'Senior PMM' })
    expect(within(card).getByRole('combobox', { name: 'Reason' })).toBeInTheDocument()
  })
})
