import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { copyOf, dayTitle, monthGrid, shiftMonth, splitCopy, topicFrom } from '../../lib/calendar'
import { data } from '../../lib/data'
import { freshSampleContent, resetSampleContent, sampleSource } from '../../lib/sample'

// The content calendar (31.2, and the calendar handover of 14 November 2026
// in the RecOS look): two numbers, weekday rows, a composer window over the
// sheet, Bin with a confirm, a guard on unsaved text, and week links.

const session = { firstName: 'Jason', role: 'owner' as const }

function mock() {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 6, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  vi.spyOn(data, 'contentItems').mockImplementation(sampleSource.contentItems)
  return {
    add: vi.spyOn(data, 'addContent').mockImplementation((input) => sampleSource.addContent(input)),
    update: vi.spyOn(data, 'updateContent').mockImplementation((id, patch) => sampleSource.updateContent(id, patch)),
  }
}

function open(path = '/content/calendar') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SignedIn session={session} />
    </MemoryRouter>,
  )
}

const values = () => screen.getAllByTestId('hero-value').map((el) => el.textContent)
const day = (date: string) => document.querySelector(`[data-day="${date}"]`) as HTMLElement
const dialog = (name: string) => screen.getByRole('dialog', { name })

beforeEach(() => {
  // Wednesday 11 November 2026, 10:00 UK. The sample week runs Monday 9 to Friday 13.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
  resetSampleContent()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Content calendar', () => {
  it('shows this week as 1/2 with a meter, one ready draft, and a month grid with the posted post on Monday and the planned one on Thursday', async () => {
    mock()
    open()
    await waitFor(() => expect(values()).toEqual(['1/2', '01']))
    expect(within(day('2026-11-09')).getByRole('button', { name: /^The best PMM hires/ }).textContent).toContain('Posted')
    expect(within(day('2026-11-12')).getByRole('button', { name: /^Three questions a CMO/ }).textContent).toContain('Planned')
    expect(within(day('2026-11-10')).getByRole('button', { name: 'Add a post on Tuesday 10 November' })).toBeInTheDocument()
    // November 2026 starts on a Sunday, so the grid runs from Monday 26 October to Sunday 6 December.
    expect(document.querySelectorAll('[data-day]')).toHaveLength(42)
    expect(document.querySelector('[data-day="2026-10-26"]')).toBeInTheDocument()
    expect(day('2026-11-11')).toHaveAttribute('data-today', 'true')
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeInTheDocument()
  })

  it('a dash opens the composer for that day, offers the ready draft, and a saved post appears on the day at once', async () => {
    const { add } = mock()
    open()
    await waitFor(() => expect(values()).toEqual(['1/2', '01']))
    await userEvent.click(screen.getByRole('button', { name: 'Add a post on Tuesday 10 November' }))
    const card = dialog('Tuesday 10 November')
    expect(within(card).getByRole('list', { name: 'Ready drafts' }).textContent).toContain('Three questions a CMO should ask before hiring a PMM')
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }))
    expect(within(card).getByText('Write the post first.')).toBeInTheDocument()
    expect(add).not.toHaveBeenCalled()
    await userEvent.type(within(card).getByLabelText('Post'), 'A hook on its own line.{enter}{enter}Then the post itself.')
    expect(within(card).getByText('46 characters')).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(add).toHaveBeenCalledWith({ kind: 'linkedin_post', copy: 'A hook on its own line.\n\nThen the post itself.', plannedFor: '2026-11-10', status: 'planned' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(within(day('2026-11-10')).getByRole('button', { name: /^A hook on its own line/ })).toBeInTheDocument())
  })

  it('placing a ready draft on a day plans it there', async () => {
    const { update } = mock()
    open()
    await waitFor(() => expect(values()).toEqual(['1/2', '01']))
    await userEvent.click(screen.getByRole('button', { name: 'Add a post on Friday 13 November' }))
    await userEvent.click(within(dialog('Friday 13 November')).getByRole('button', { name: /^Three questions a CMO/ }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('c4', { status: 'planned', plannedFor: '2026-11-13' }))
    await waitFor(() => expect(within(day('2026-11-13')).getByRole('button', { name: /^Three questions a CMO/ })).toBeInTheDocument())
    expect(values()).toEqual(['1/2', '00'])
  })

  it('a post reopens prefilled, can be moved to another day and edited, and marked posted from its state', async () => {
    const { update } = mock()
    open()
    await waitFor(() => expect(values()).toEqual(['1/2', '01']))
    await userEvent.click(within(day('2026-11-12')).getByRole('button', { name: /^Three questions a CMO/ }))
    const card = dialog('Thursday 12 November')
    const post = within(card).getByLabelText('Post') as HTMLTextAreaElement
    expect(post.value).toMatch(/^Three questions a CMO should ask before hiring a PMM\.\n\n/)
    fireEvent.change(within(card).getByLabelText('Day'), { target: { value: '2026-11-13' } })
    await userEvent.type(post, ' Really.')
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    const [id, change] = update.mock.calls[0]
    expect(id).toBe('c7')
    expect(change).toMatchObject({ plannedFor: '2026-11-13', status: 'planned', closeLine: 'Fix the brief first. Really.' })
    await waitFor(() => expect(within(day('2026-11-13')).getByRole('button', { name: /^Three questions a CMO/ })).toBeInTheDocument())
    await userEvent.click(within(day('2026-11-13')).getByRole('button', { name: /^Three questions a CMO/ }))
    const again = dialog('Friday 13 November')
    await userEvent.selectOptions(within(again).getByLabelText('State'), 'posted')
    await userEvent.click(within(again).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenLastCalledWith('c7', expect.objectContaining({ status: 'posted', postedOn: '2026-11-13' })))
    await waitFor(() => expect(values()).toEqual(['2/2', '01']))
  })

  it('Bin asks first, then the post leaves the day; unsaved text asks before the window closes', async () => {
    const { update } = mock()
    open()
    await waitFor(() => expect(values()).toEqual(['1/2', '01']))
    await userEvent.click(within(day('2026-11-12')).getByRole('button', { name: /^Three questions a CMO/ }))
    let card = dialog('Thursday 12 November')
    await userEvent.click(within(card).getByRole('button', { name: 'Bin' }))
    expect(update).not.toHaveBeenCalled()
    await userEvent.click(within(within(card).getByRole('group', { name: 'Bin this post?' })).getByRole('button', { name: 'Bin it' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('c7', { status: 'binned' }))
    await waitFor(() => expect(within(day('2026-11-12')).getByRole('button', { name: 'Add a post on Thursday 12 November' })).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Add a post on Wednesday 11 November' }))
    card = dialog('Wednesday 11 November')
    await userEvent.type(within(card).getByLabelText('Post'), 'Half a thought')
    await userEvent.keyboard('{Escape}')
    expect(within(card).getByRole('group', { name: 'Discard what you wrote?' })).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Keep writing' }))
    expect(within(card).getByLabelText('Post')).toHaveValue('Half a thought')
    await userEvent.click(within(card).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('Next month moves the grid on a month and This month comes back', async () => {
    mock()
    open()
    await waitFor(() => expect(values()).toEqual(['1/2', '01']))
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    await waitFor(() => expect(document.querySelector('[data-month]')).toHaveAttribute('data-month', '2026-12'))
    expect(screen.getByRole('grid', { name: 'December 2026' })).toBeInTheDocument()
    expect(values()[0]).toBe('1/2')
    await userEvent.click(screen.getByRole('button', { name: 'This month' }))
    await waitFor(() => expect(document.querySelector('[data-month]')).toHaveAttribute('data-month', '2026-11'))
  })
})

describe('calendar helpers', () => {
  it('names a day, splits copy into hook, body and close, and files a post under its first line', () => {
    expect(dayTitle('2026-11-10')).toBe('Tuesday 10 November')
    expect(splitCopy('Hook.\n\nBody.\n\nClose.')).toEqual({ hook: 'Hook.', body: 'Body.', closeLine: 'Close.' })
    expect(splitCopy('Hook.\n\nBody.')).toEqual({ hook: 'Hook.', body: 'Body.', closeLine: null })
    expect(splitCopy('Just a body')).toEqual({ hook: null, body: 'Just a body', closeLine: null })
    const c = freshSampleContent()[0]
    expect(splitCopy(copyOf(c))).toEqual({ hook: c.hook, body: c.body, closeLine: c.closeLine })
    expect(topicFrom('\nA first line\nmore')).toBe('A first line')
    expect(topicFrom('x'.repeat(90))).toHaveLength(80)
  })

  it('lays a month out in whole weeks from Monday, and steps months across a year end', () => {
    const nov = monthGrid('2026-11')
    expect(nov).toHaveLength(42)
    expect(nov[0]).toBe('2026-10-26')
    expect(nov[41]).toBe('2026-12-06')
    const jun = monthGrid('2026-06')
    expect(jun[0]).toBe('2026-06-01')
    expect(jun).toHaveLength(35)
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
})
