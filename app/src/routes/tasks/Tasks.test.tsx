import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data } from '../../lib/data'
import { freshSampleTasks } from '../../lib/sample'

// The Tasks tab: the board, the filters, the order, the card, the deck and
// the two ways out for an email. Runs on the invented sample tasks.

const session = { firstName: 'Jason', role: 'owner' as const }

function mock(over: { fail?: boolean } = {}) {
  vi.spyOn(data, 'needsYou').mockResolvedValue(5)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 0, late: 0, lateFromDay: null })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'dayToday').mockResolvedValue([])
  vi.spyOn(data, 'calendarWeek').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  vi.spyOn(data, 'tasks').mockResolvedValue(freshSampleTasks())
  vi.spyOn(data, 'searches').mockResolvedValue([
    { id: 's-grail', client: 'GrailPay Sample', role: 'Director of Product Marketing', status: 'open', health: 'warm' },
  ] as unknown as Awaited<ReturnType<typeof data.searches>>)
  const complete = vi.spyOn(data, 'completeTask')
  const bin = vi.spyOn(data, 'binTask')
  const snooze = vi.spyOn(data, 'snoozeTask')
  const edits = vi.spyOn(data, 'saveTaskEdits').mockResolvedValue()
  const reorder = vi.spyOn(data, 'reorderTasks').mockResolvedValue()
  const draft = vi.spyOn(data, 'saveDraft').mockResolvedValue()
  const send = vi.spyOn(data, 'sendTask').mockResolvedValue('Queued to send')
  const outlook = vi.spyOn(data, 'openInOutlook').mockResolvedValue('https://example.com/outlook/drafts/m-ada')
  vi.spyOn(data, 'reopenTask').mockResolvedValue()
  vi.spyOn(data, 'requestRun').mockResolvedValue()
  if (over.fail) {
    complete.mockRejectedValue(new Error('down'))
    bin.mockRejectedValue(new Error('down'))
    snooze.mockRejectedValue(new Error('down'))
  } else {
    complete.mockResolvedValue()
    bin.mockResolvedValue()
    snooze.mockResolvedValue()
  }
  return { complete, bin, snooze, edits, reorder, draft, send, outlook }
}

function open(path = '/tasks') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SignedIn session={session} />
    </MemoryRouter>,
  )
}

const values = () => screen.getAllByTestId('hero-value').map((el) => el.textContent)
const column = (name: string) => screen.getByRole('region', { name })
const tilesIn = (name: string) => Array.from(column(name).querySelectorAll<HTMLElement>('[data-task-tile]'))
const tile = (title: string) => screen.getByRole('button', { name: new RegExp(title) })
const board = () => screen.getByRole('main').querySelector('[data-board]')!

beforeEach(() => {
  // A Monday at 10:00 UK time.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Tasks', () => {
  it('opens on a board of Now, This week and Waiting, with two hero numbers and one Start button', async () => {
    mock()
    open()
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    await waitFor(() => expect(board()).toBeInTheDocument())
    expect(values()).toEqual(['06', '02'])
    expect(screen.getByRole('main').querySelectorAll('[data-hero-stat]')).toHaveLength(2)
    expect(screen.getByRole('main').querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
    expect(column('Now')).toBeInTheDocument()
    expect(column('This week')).toBeInTheDocument()
    expect(column('Waiting')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Later' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Later, 2' })).toBeInTheDocument()
    // Four cards per column, then Show more.
    expect(tilesIn('Now')).toHaveLength(4)
    expect(within(column('Now')).getByRole('button', { name: 'Show more' })).toBeInTheDocument()
    expect(screen.getByRole('main').querySelectorAll('svg, canvas, img')).toHaveLength(0)
  })

  it('marks status with a colour bar, a dot and a word, and the late one comes first in Now', async () => {
    mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    const first = tilesIn('Now')[0]
    expect(first).toHaveAttribute('data-status', 'late')
    expect(first).toHaveTextContent('Cara Placeholder')
    expect(first).toHaveTextContent('Late')
    expect(first.querySelector('[data-mark]')).toHaveClass('bg-tone-action')
    expect(first.querySelector('[data-dot]')).toHaveAttribute('data-dot', 'solid')
    const waiting = tilesIn('Waiting')[0]
    expect(waiting).toHaveAttribute('data-status', 'waiting')
    expect(waiting).toHaveTextContent(/Waiting on (their reply|the candidate)/)
    expect(waiting.querySelector('[data-dot]')).toHaveAttribute('data-dot', 'hollow')
    const week = tilesIn('This week')[0]
    expect(week.querySelector('[data-mark]')).toHaveClass('bg-tone-new')
  })

  it('filters by priority, with the chosen filter shown by weight', async () => {
    mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Waiting' }))
    expect(screen.getByRole('button', { name: 'Waiting', current: true })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Now' })).not.toBeInTheDocument()
    expect(tilesIn('Waiting')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(tilesIn('Later')).toHaveLength(2)
    expect(tilesIn('Later')[0]).toHaveTextContent('Hal Hypothetical')
    await userEvent.click(screen.getAllByTestId('hero-value')[0].closest('button')!)
    expect(column('Now')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Waiting' })).not.toBeInTheDocument()
  })

  it('reorders with Shift and the arrow keys, and keeps the order', async () => {
    const { reorder } = mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    const before = tilesIn('Now').map((t) => t.textContent)
    const second = tilesIn('Now')[1].querySelector('button')!
    second.focus()
    fireEvent.keyDown(second, { key: 'ArrowUp', shiftKey: true })
    await waitFor(() => expect(tilesIn('Now')[0].textContent).toBe(before[1]))
    expect(reorder).toHaveBeenCalledTimes(1)
    const keys = reorder.mock.calls[0][0]
    expect(keys[0]).toBe(tilesIn('Now')[0].querySelector('[data-task]')!.getAttribute('data-task'))
  })

  it('reorders by dragging a card onto another in the same column', async () => {
    const { reorder } = mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    const [first, , third] = tilesIn('Now')
    const firstText = first.textContent
    fireEvent.dragStart(third)
    fireEvent.dragOver(first)
    fireEvent.drop(first)
    await waitFor(() => expect(tilesIn('Now')[1].textContent).toBe(firstText))
    expect(reorder).toHaveBeenCalledTimes(1)
  })

  it('opens a card with the context links, the draft and the agent line; Esc closes it', async () => {
    mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Ada Example, Northwind Sample Co'))
    const card = screen.getByRole('dialog', { name: 'Ada Example, Northwind Sample Co' })
    expect(card).toHaveTextContent('Spoke yesterday about the GrailPay role. CV promised.')
    expect(within(card).getByRole('link', { name: 'Call notes' })).toHaveAttribute('href', 'https://example.com/notes/ada')
    expect(within(card).getByRole('link', { name: 'Open in CRM' })).toHaveAttribute('href', 'https://example.com/crm/candidates/ada')
    expect(within(card).getByRole('textbox', { name: 'Subject' })).toHaveValue('Good to speak yesterday')
    expect((within(card).getByRole('textbox', { name: 'Email' }) as HTMLTextAreaElement).value).toMatch(/thank you for your time yesterday/)
    expect(card.querySelector('[data-kind="primary"]')).toHaveTextContent('Send')
    expect(within(card).getByRole('button', { name: 'Open in Outlook' })).toBeInTheDocument()
    expect(card).toHaveTextContent('Raised by the call write-up')
    expect(screen.getByRole('main').querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('opens straight from a link with ?card=task:key', async () => {
    mock()
    open('/tasks?card=task:search_health:s-tailspin')
    expect(await screen.findByRole('dialog', { name: 'Tailspin Example Inc: Senior PMM, Platform' })).toBeInTheDocument()
  })

  it('Send goes through the engine, the task leaves the board and one note says so', async () => {
    const { send } = mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Ada Example, Northwind Sample Co'))
    const card = screen.getByRole('dialog', { name: 'Ada Example, Northwind Sample Co' })
    await userEvent.click(card.querySelector<HTMLButtonElement>('[data-kind="primary"]')!)
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ key: 'follow_ups:f-ada' })))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Queued to send'))
    expect(screen.queryByRole('button', { name: /Ada Example, Northwind/ })).not.toBeInTheDocument()
  })

  it('Open in Outlook asks the engine for the draft and opens it in a new tab', async () => {
    const { outlook } = mock()
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Ada Example, Northwind Sample Co'))
    await userEvent.click(screen.getByRole('button', { name: 'Open in Outlook' }))
    await waitFor(() => expect(outlook).toHaveBeenCalled())
    expect(opened).toHaveBeenCalledWith('https://example.com/outlook/drafts/m-ada', '_blank', 'noopener')
  })

  it('edits the draft in place and keeps it; Reset brings the agent\'s words back', async () => {
    const { draft } = mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Ada Example, Northwind Sample Co'))
    const card = screen.getByRole('dialog', { name: 'Ada Example, Northwind Sample Co' })
    const box = within(card).getByRole('textbox', { name: 'Email' })
    await userEvent.type(box, ' Best, Jason')
    await waitFor(() => expect(draft).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'follow_ups:f-ada' }), expect.stringMatching(/Best, Jason$/), 'Good to speak yesterday'))
    expect(within(card).getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Reset' }))
    expect((box as HTMLTextAreaElement).value).not.toMatch(/Best, Jason/)
  })

  it('Edit saves the owner\'s title, due day and notes without touching the agent\'s words', async () => {
    const { edits } = mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('CV still to come from Ada Example'))
    let card = screen.getByRole('dialog', { name: 'CV still to come from Ada Example' })
    await userEvent.click(within(card).getByRole('button', { name: 'Edit' }))
    const title = within(card).getByRole('textbox', { name: 'Title' })
    await userEvent.clear(title)
    await userEvent.type(title, 'Chase Ada for her CV')
    await userEvent.type(within(card).getByRole('textbox', { name: 'Notes' }), 'She said Thursday')
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }))
    expect(edits).toHaveBeenCalledWith(expect.objectContaining({ key: 'cv_chase:c-ada' }), { title: 'Chase Ada for her CV', notes: 'She said Thursday', dueOn: null })
    card = screen.getByRole('dialog', { name: 'Chase Ada for her CV' })
    expect(card).toHaveTextContent('She said Thursday')
    expect(tile('Chase Ada for her CV')).toBeInTheDocument()
  })

  it('Bin asks why with three quick reasons and Other, then the task leaves', async () => {
    const { bin } = mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Senior PMM at Northwind Sample Co'))
    const card = screen.getByRole('dialog', { name: 'Senior PMM at Northwind Sample Co' })
    await userEvent.click(within(card).getByRole('button', { name: 'Bin' }))
    expect(within(card).getAllByRole('button', { name: /^(Not ICP|Filled|Uses another agency|Other)$/ })).toHaveLength(4)
    await userEvent.click(within(card).getByRole('button', { name: 'Filled' }))
    expect(bin).toHaveBeenCalledWith(expect.objectContaining({ key: 'inbox_items:i-north' }), 'Filled')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Senior PMM at Northwind/ })).not.toBeInTheDocument()
  })

  it('Snooze offers tomorrow, Thursday and next Monday', async () => {
    const { snooze } = mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Senior PMM at Northwind Sample Co'))
    const card = screen.getByRole('dialog', { name: 'Senior PMM at Northwind Sample Co' })
    await userEvent.click(within(card).getByRole('button', { name: 'Snooze' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Thursday' }))
    expect(snooze).toHaveBeenCalledWith(expect.objectContaining({ key: 'inbox_items:i-north' }), '2026-11-19')
  })

  it('Confirm on an unmatched call needs a search chosen first', async () => {
    const { complete } = mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Which search was Finn Fictional for'))
    const card = screen.getByRole('dialog', { name: /Which search was Finn Fictional for/ })
    await userEvent.click(card.querySelector<HTMLButtonElement>('[data-kind="primary"]')!)
    expect(within(card).getByText('Choose the search first')).toBeInTheDocument()
    expect(complete).not.toHaveBeenCalled()
    await userEvent.selectOptions(within(card).getByRole('combobox', { name: 'Search' }), 's-grail')
    await userEvent.click(card.querySelector<HTMLButtonElement>('[data-kind="primary"]')!)
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ key: 'call_confirm:c-finn' }), { searchId: 's-grail' })
  })

  it('puts a task back and shows one note when the write fails', async () => {
    mock({ fail: true })
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Tailspin Example Inc'))
    const card = screen.getByRole('dialog', { name: /Tailspin Example Inc/ })
    await userEvent.click(card.querySelector<HTMLButtonElement>('[data-kind="primary"]')!)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not save that. Try again.'))
    expect(tile('Tailspin Example Inc')).toBeInTheDocument()
  })

  it('Start works the Now column one task at a time, and List comes back to the board', async () => {
    const { complete } = mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByTestId('deck-counter')).toHaveTextContent('01 of 06')
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Cara Placeholder, Fabrikam Test Ltd')
    expect(screen.getByRole('main').querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    await userEvent.keyboard('j')
    expect(screen.getByRole('heading', { level: 3 })).not.toHaveTextContent('Cara Placeholder')
    const primary = screen.getByRole('main').querySelector<HTMLButtonElement>('[data-kind="primary"]')!
    if (primary.textContent !== 'Send') {
      await userEvent.click(primary)
      await waitFor(() => expect(complete).toHaveBeenCalled())
      expect(screen.getByTestId('deck-counter')).toHaveTextContent('02 of 06')
    }
    await userEvent.click(screen.getByRole('button', { name: 'List' }))
    await waitFor(() => expect(board()).toBeInTheDocument())
  })

  it('Write up now asks the write-up agent to run and says so once', async () => {
    mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Write up now' }))
    expect(data.requestRun).toHaveBeenCalledWith('a6_calls')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('The call agent picks this up at its next check'))
  })

  it('shows dashes and three dots while loading, and one line when the list fails', async () => {
    mock()
    vi.spyOn(data, 'tasks').mockReturnValue(new Promise(() => {}))
    open()
    expect(values()).toEqual(['–', '–'])
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
  })

  it('says Could not load when the queue fails, and the tabs still work', async () => {
    mock()
    vi.spyOn(data, 'tasks').mockRejectedValue(new Error('down'))
    open()
    await waitFor(() => expect(screen.getByText('Could not load. Try again.')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /Business development/ })).toBeInTheDocument()
  })
})
