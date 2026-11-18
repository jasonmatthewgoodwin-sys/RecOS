import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data } from '../../lib/data'
import { freshSampleTasks, sampleSource } from '../../lib/sample'

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
  vi.spyOn(data, 'onYourBehalf').mockImplementation((area) => sampleSource.onYourBehalf(area))
  vi.spyOn(data, 'connectLead').mockResolvedValue('Template needs approval')
  vi.spyOn(data, 'markLinkedInSent').mockResolvedValue('Marked as sent by hand')
  vi.spyOn(data, 'addLeadToCampaign').mockResolvedValue()
  vi.spyOn(data, 'taskChat').mockImplementation((key) => sampleSource.taskChat(key))
  vi.spyOn(data, 'askTask').mockImplementation((key, kind, words) => sampleSource.askTask(key, kind, words))
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
  it('opens on a board of Emails, Business development and Other, with two hero numbers and one Start button', async () => {
    mock()
    open()
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    await waitFor(() => expect(board()).toBeInTheDocument())
    // Needs you: what is due or late across the three columns. Waiting: on someone else.
    expect(values()).toEqual(['07', '02'])
    expect(screen.getByRole('main').querySelectorAll('[data-hero-stat]')).toHaveLength(2)
    expect(document.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
    expect(column('Emails')).toBeInTheDocument()
    expect(column('Business development')).toBeInTheDocument()
    expect(column('Other')).toBeInTheDocument()
    for (const gone of ['Now', 'This week', 'Later', 'Waiting']) expect(screen.queryByRole('region', { name: gone })).not.toBeInTheDocument()
    expect(tilesIn('Emails')).toHaveLength(3)
    // The lead posted 40 days ago stays on Business development, not here.
    expect(tilesIn('Business development')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Ola Example/ })).not.toBeInTheDocument()
    // Four cards per column, then Show more.
    expect(tilesIn('Other')).toHaveLength(4)
    expect(within(column('Other')).getByRole('button', { name: 'Show more' })).toBeInTheDocument()
    expect(screen.getByRole('main').querySelectorAll('svg, canvas, img')).toHaveLength(0)
  })

  it('marks status with a colour bar, a dot and a word; overdue email first, the accepted request first in Business development', async () => {
    mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    const first = tilesIn('Emails')[0]
    expect(first).toHaveAttribute('data-status', 'late')
    expect(first).toHaveTextContent('Cara Placeholder')
    expect(first).toHaveTextContent('Late')
    expect(first.querySelector('[data-mark]')).toHaveClass('bg-tone-action')
    expect(first.querySelector('[data-dot]')).toHaveAttribute('data-dot', 'solid')
    const [accepted, fresh] = tilesIn('Business development')
    expect(accepted).toHaveTextContent('Message Hal Sample: accepted your request')
    expect(within(accepted).getByTestId('tile-action')).toHaveTextContent("Alex's leads")
    expect(fresh.querySelector('[data-mark]')).toHaveClass('bg-tone-new')
  })

  it('Waiting is a filter above the board, shown by weight, and shows only those', async () => {
    mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Waiting' }))
    expect(screen.getByRole('button', { name: 'Waiting', current: true })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Emails' })).not.toBeInTheDocument()
    expect(tilesIn('Waiting')).toHaveLength(2)
    const waiting = tilesIn('Waiting')[0]
    expect(waiting).toHaveAttribute('data-status', 'waiting')
    expect(waiting).toHaveTextContent(/Waiting on (their reply|the candidate)/)
    expect(waiting.querySelector('[data-dot]')).toHaveAttribute('data-dot', 'hollow')
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(column('Emails')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Waiting' })).not.toBeInTheDocument()
  })

  it('reorders with Shift and the arrow keys, and keeps the order', async () => {
    const { reorder } = mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    const before = tilesIn('Other').map((t) => t.textContent)
    const second = tilesIn('Other')[1].querySelector('button')!
    second.focus()
    fireEvent.keyDown(second, { key: 'ArrowUp', shiftKey: true })
    await waitFor(() => expect(tilesIn('Other')[0].textContent).toBe(before[1]))
    expect(reorder).toHaveBeenCalledTimes(1)
    const keys = reorder.mock.calls[0][0]
    expect(keys[0]).toBe(tilesIn('Other')[0].querySelector('[data-task]')!.getAttribute('data-task'))
  })

  it('reorders by dragging a card onto another in the same column', async () => {
    const { reorder } = mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    const [first, , third] = tilesIn('Other')
    const firstText = first.textContent
    fireEvent.dragStart(third)
    fireEvent.dragOver(first)
    fireEvent.drop(first)
    await waitFor(() => expect(tilesIn('Other')[1].textContent).toBe(firstText))
    expect(reorder).toHaveBeenCalledTimes(1)
  })

  it('opens a card with the context links, the draft and the agent line; Esc closes it', async () => {
    mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Email Ada Example at Northwind Sample Co'))
    const card = screen.getByRole('dialog', { name: 'Email Ada Example at Northwind Sample Co' })
    expect(card).toHaveTextContent('Spoke yesterday about the GrailPay role. CV promised.')
    expect(within(card).getByRole('link', { name: 'Call notes' })).toHaveAttribute('href', 'https://example.com/notes/ada')
    expect(within(card).getByRole('link', { name: 'Open in CRM' })).toHaveAttribute('href', 'https://example.com/crm/candidates/ada')
    // Where the task came from, in words, with the link when it was a call.
    expect(within(card).getByTestId('task-source')).toHaveTextContent('A call with Ada Example, written up by the call agent')
    expect(within(within(card).getByTestId('task-source')).getByRole('link')).toHaveAttribute('href', 'https://example.com/notes/ada')
    expect(within(card).getByRole('textbox', { name: 'Subject' })).toHaveValue('Good to speak yesterday')
    expect((within(card).getByRole('textbox', { name: 'Email' }) as HTMLTextAreaElement).value).toMatch(/thank you for your time yesterday/)
    expect(card.querySelector('[data-kind="primary"]')).toHaveTextContent('Send')
    expect(within(card).getByRole('button', { name: 'Open in Outlook' })).toBeInTheDocument()
    expect(card).toHaveTextContent(/Raised \d{4}-\d{2}-\d{2} by the calls agent/)
    expect(document.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('opens straight from a link with ?card=task:key', async () => {
    mock()
    open('/tasks?card=task:search_health:s-tailspin')
    expect(await screen.findByRole('dialog', { name: 'Update Tailspin Example Inc on the Senior PMM, Platform search' })).toBeInTheDocument()
  })

  it('Send goes through the engine, the task leaves the board and one note says so', async () => {
    const { send } = mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Email Ada Example at Northwind Sample Co'))
    const card = screen.getByRole('dialog', { name: 'Email Ada Example at Northwind Sample Co' })
    await userEvent.click(card.querySelector<HTMLButtonElement>('[data-kind="primary"]')!)
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ key: 'follow_ups:f-ada' })))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Queued to send'))
    expect(screen.queryByRole('button', { name: /Ada Example, Northwind/ })).not.toBeInTheDocument()
  })

  it('a task the agent left no draft for still carries a start on the email, and Open in Outlook makes it the message first', async () => {
    const { outlook } = mock()
    const create = vi.spyOn(data, 'createTaskDraft').mockResolvedValue('m-new')
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    open('/tasks?card=task:cv_chase:c-ada')
    const card = await screen.findByRole('dialog', { name: 'Get the CV from Ada Example' })
    expect(within(card).getByRole('textbox', { name: 'Subject' })).toHaveValue('Your CV')
    expect((within(card).getByRole('textbox', { name: 'Email, a start' }) as HTMLTextAreaElement).value).toMatch(/^Hi Ada,/)
    expect(within(card).getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Open in Outlook' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ key: 'cv_chase:c-ada' }), 'Your CV', expect.stringMatching(/^Hi Ada,/)))
    await waitFor(() => expect(outlook).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'm-new' })))
    expect(opened).toHaveBeenCalled()
  })

  it('Open in Outlook asks the engine for the draft and opens it in a new tab', async () => {
    const { outlook } = mock()
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Email Ada Example at Northwind Sample Co'))
    await userEvent.click(screen.getByRole('button', { name: 'Open in Outlook' }))
    await waitFor(() => expect(outlook).toHaveBeenCalled())
    expect(opened).toHaveBeenCalledWith('https://example.com/outlook/drafts/m-ada', '_blank', 'noopener')
  })

  it('edits the draft in place and keeps it; Reset brings the agent\'s words back', async () => {
    const { draft } = mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Email Ada Example at Northwind Sample Co'))
    const card = screen.getByRole('dialog', { name: 'Email Ada Example at Northwind Sample Co' })
    const box = within(card).getByRole('textbox', { name: 'Email' })
    await userEvent.type(box, ' Best, Jason')
    await waitFor(() => expect(draft).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'follow_ups:f-ada' }), expect.stringMatching(/Best, Jason$/), 'Good to speak yesterday'))
    expect(within(card).getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Reset' }))
    expect((box as HTMLTextAreaElement).value).not.toMatch(/Best, Jason/)
  })

  it('Edit saves the owner\'s title, due day and notes without touching the agent\'s words', async () => {
    const { edits } = mock()
    // The CV is waiting on the candidate, so it shows under the Waiting filter.
    open('/tasks?show=waiting')
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Get the CV from Ada Example'))
    let card = screen.getByRole('dialog', { name: 'Get the CV from Ada Example' })
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
    await userEvent.click(tile('Connect with Gail Example at Northwind Sample Co'))
    const card = screen.getByRole('dialog', { name: 'Connect with Gail Example at Northwind Sample Co' })
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
    await userEvent.click(tile('Connect with Gail Example at Northwind Sample Co'))
    const card = screen.getByRole('dialog', { name: 'Connect with Gail Example at Northwind Sample Co' })
    await userEvent.click(within(card).getByRole('button', { name: 'Snooze' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Thursday' }))
    expect(snooze).toHaveBeenCalledWith(expect.objectContaining({ key: 'inbox_items:i-north' }), '2026-11-19')
  })

  it('Confirm on an unmatched call needs a search chosen first', async () => {
    const { complete } = mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    // Other holds more than the column shows at first: open the rest.
    const more = within(column('Other')).queryByRole('button', { name: /Show more/ })
    if (more) await userEvent.click(more)
    await userEvent.click(tile('Confirm the search for your call with Finn Fictional'))
    const card = screen.getByRole('dialog', { name: /Confirm the search for your call with Finn Fictional/ })
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

  it('Start works what is due or late one task at a time, and List comes back to the board', async () => {
    const { complete } = mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByTestId('deck-counter')).toHaveTextContent('01 of 07')
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Email Cara Placeholder at Fabrikam Test Ltd')
    expect(document.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    await userEvent.keyboard('j')
    expect(screen.getByRole('heading', { level: 3 })).not.toHaveTextContent('Cara Placeholder')
    const primary = screen.getByRole('main').querySelector<HTMLButtonElement>('[data-kind="primary"]')!
    if (primary.textContent !== 'Send') {
      await userEvent.click(primary)
      await waitFor(() => expect(complete).toHaveBeenCalled())
      expect(screen.getByTestId('deck-counter')).toHaveTextContent('02 of 07')
    }
    await userEvent.click(screen.getByRole('button', { name: 'List' }))
    await waitFor(() => expect(board()).toBeInTheDocument())
  })

  it('the chat on a task shows what was asked and answered, takes a new ask and then waits for the task assistant', async () => {
    mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Email Ada Example at Northwind Sample Co'))
    const card = screen.getByRole('dialog', { name: 'Email Ada Example at Northwind Sample Co' })
    const chat = await within(card).findByTestId('task-chat')
    expect(within(chat).getByRole('list', { name: 'Chat' }).children).toHaveLength(2)
    expect(chat).toHaveTextContent('Her last email, on Thursday, asks for the role outline')
    // Change needs words.
    await userEvent.click(within(chat).getByRole('button', { name: 'Change it' }))
    expect(data.askTask).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Say what should change first'))
    await userEvent.type(within(chat).getByRole('textbox', { name: 'Tell the task assistant' }), 'Make it a two-line nudge')
    await userEvent.click(within(chat).getByRole('button', { name: 'Do this for me' }))
    expect(data.askTask).toHaveBeenCalledWith('follow_ups:f-ada', 'do', 'Make it a two-line nudge')
    await waitFor(() => expect(within(chat).getByTestId('task-chat-standing')).toHaveTextContent('Waiting for the task assistant'))
    expect(within(chat).getByRole('list', { name: 'Chat' }).children).toHaveLength(3)
    expect(within(chat).queryByRole('button', { name: 'Do this for me' })).toBeNull()
    expect(within(chat).getByRole('button', { name: 'Look again' })).toBeInTheDocument()
    // One primary on the screen still.
    expect(document.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
  })

  it('every tile says where the task came from, what to do and the day it surfaced, and a lead the day it was posted; past three days with no date of its own it is late', async () => {
    mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    const north = tile('Connect with Gail Example at Northwind Sample Co')
    expect(within(north).getByTestId('tile-action')).toHaveTextContent('LinkedIn post·Connect on LinkedIn')
    expect(within(north).getByTestId('tile-surfaced')).toHaveTextContent('Posted 14 Nov')
    const prep = tile('Prepare for your call with Dev Madeup')
    expect(within(prep).getByTestId('tile-surfaced')).toHaveTextContent(/^Surfaced \d+ \w+$/)
    const late = document.querySelectorAll('[data-task-tile][data-status="late"]')
    expect(late.length).toBeGreaterThan(0)
  })

  it('a LinkedIn job lead says where it came from and where the outreach stands, connects through the engine, and keeps an email about their hiring to copy', async () => {
    mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Connect with Gail Example at Northwind Sample Co'))
    const card = screen.getByRole('dialog', { name: 'Connect with Gail Example at Northwind Sample Co' })
    expect(within(card).getByTestId('lead-line')).toHaveTextContent(/^LinkedIn job lead\. Posted \d+ \w+\. Found \d+ \w+$/)
    expect(within(card).getByTestId('lead-status')).toHaveTextContent('Not connected')
    expect(card).not.toHaveTextContent(/hiring report/i)
    expect(within(card).queryByRole('button', { name: 'Open in Outlook' })).toBeNull()
    const primary = card.querySelector<HTMLButtonElement>('[data-kind="primary"]')!
    expect(primary).toHaveTextContent('Connect on LinkedIn')
    expect(document.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    const email = within(card).getByTestId('lead-email')
    expect(within(email).getByRole('textbox', { name: 'Subject' })).toHaveValue('Hiring product marketers?')
    expect((within(email).getByRole('textbox', { name: 'Email' }) as HTMLTextAreaElement).value).toMatch(/^Hi Gail,\n\nI saw Northwind Sample Co is hiring for a Senior PMM\./)
    await userEvent.click(primary)
    expect(data.connectLead).toHaveBeenCalledWith(expect.objectContaining({ key: 'inbox_items:i-north' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Request ready. It goes once you approve the connection note in Settings, Templates.'))
    await userEvent.click(within(card).getByRole('button', { name: 'Add to campaign' }))
    await waitFor(() => expect(data.addLeadToCampaign).toHaveBeenCalled())
  })

  it('a connected lead offers the first LinkedIn message to copy and open, and Mark messaged records it', async () => {
    mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    await userEvent.click(tile('Message Hal Sample: accepted your request'))
    const card = screen.getByRole('dialog', { name: 'Message Hal Sample: accepted your request' })
    expect(within(card).getByTestId('lead-status')).toHaveTextContent(/^Connected \d+ \w+\. Message not sent yet$/)
    expect((within(card).getByRole('textbox', { name: 'LinkedIn message' }) as HTMLTextAreaElement).value).toMatch(/^Thanks for connecting, Hal\./)
    expect(card.querySelector('[data-kind="primary"]')).toHaveTextContent('Copy and open LinkedIn')
    expect(within(card).queryByRole('button', { name: 'Open in Outlook' })).toBeNull()
    await userEvent.click(within(card).getByRole('button', { name: 'Mark messaged' }))
    await waitFor(() => expect(data.markLinkedInSent).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Marked as messaged'))
  })

  it('Sent for you lists who was contacted on your behalf, how and when, with one line on since when and how much went by itself', async () => {
    mock()
    open()
    await waitFor(() => expect(board()).toBeInTheDocument())
    expect(data.onYourBehalf).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Sent for you' }))
    const card = await screen.findByRole('dialog', { name: 'Sent for you' })
    expect(data.onYourBehalf).toHaveBeenCalledWith(null)
    await waitFor(() => expect(within(card).getByTestId('behalf-summary')).toHaveTextContent(/^Since \d+ \w+: .*2 sent.*\. 4 by the agents on their own, 1 by you\.$/))
    const list = within(card).getByRole('list', { name: 'Sent for you' })
    expect(list.children).toHaveLength(5)
    expect(within(list).getAllByText('Auto')).toHaveLength(4)
    expect(list).toHaveTextContent('Hal Sample')
    expect(card.querySelector('[data-kind="primary"]')).toBeNull()
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
