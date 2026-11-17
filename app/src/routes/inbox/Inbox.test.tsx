import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data, type InboxItem } from '../../lib/data'
import { freshSampleInbox, resetSampleInbox, sampleSource } from '../../lib/sample'

// The two-pane Inbox (Jason, 2026-11-14) with its folders, and the deck one
// link away: acceptance tests T-INBX-1 to 5 (section 27.11), the bin reasons,
// the snooze and approve choices, Pass on and Sent for you. Everything runs
// on the invented sample inbox.

// Captured before any spy: with no Supabase settings, data is sampleSource itself.
const sample = { ...sampleSource }

const session = { firstName: 'Jason', role: 'owner' as const }

const waitingItems = () => freshSampleInbox().filter((i) => (i.status === 'new' || i.status === 'stale') && i.type !== 'auto_sent')
const sentItems = () => freshSampleInbox().filter((i) => i.type === 'auto_sent')

function mock(over: { items?: InboxItem[]; fail?: boolean } = {}) {
  vi.spyOn(data, 'needsYou').mockResolvedValue(12)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 0, late: 0, lateFromDay: null })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  const items = vi.spyOn(data, 'inboxItems').mockResolvedValue(over.items ?? waitingItems())
  vi.spyOn(data, 'sentForYou').mockResolvedValue(sentItems())
  const actOn = vi.spyOn(data, 'actOnInbox')
  if (over.fail) actOn.mockRejectedValue(new Error('down'))
  else actOn.mockResolvedValue()
  const undo = vi.spyOn(data, 'undoInbox').mockResolvedValue()
  const binStale = vi.spyOn(data, 'binStale').mockResolvedValue()
  // Folders run on the sample store so nothing reaches a server.
  vi.spyOn(data, 'inboxFolders').mockImplementation(sample.inboxFolders)
  vi.spyOn(data, 'createInboxFolder').mockImplementation(sample.createInboxFolder)
  vi.spyOn(data, 'renameInboxFolder').mockImplementation(sample.renameInboxFolder)
  vi.spyOn(data, 'inboxClosed').mockImplementation(sample.inboxClosed)
  const moveItem = vi.spyOn(data, 'moveInboxItem').mockResolvedValue()
  const deleteFolder = vi.spyOn(data, 'deleteInboxFolder').mockImplementation(sample.deleteInboxFolder)
  return { items, actOn, undo, binStale, moveItem, deleteFolder }
}

function open(path = '/inbox') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SignedIn session={session} />
    </MemoryRouter>,
  )
}

function pretendPhone(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('max-width') ? matches : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
}

// The deck.
const counter = () => screen.getByTestId('deck-counter').textContent
const deck = () => screen.getByRole('region', { name: 'Deck' })
const title = () => within(deck()).getByRole('heading', { level: 2 }).textContent
const primary = () => deck().querySelector('[data-kind="primary"]') as HTMLButtonElement
// The two panes.
const pane = () => screen.getByRole('article', { name: 'Reading pane' })
const reading = () => within(pane()).getByRole('heading', { level: 2 }).textContent
const readingPrimary = () => pane().querySelector('[data-kind="primary"]') as HTMLButtonElement
const rows = () => [...screen.getByRole('region', { name: 'Messages' }).querySelectorAll('[data-message]')]
const rowIds = () => rows().map((r) => r.getAttribute('data-message'))
const chosen = () => screen.getByRole('region', { name: 'Messages' }).querySelector('[data-selected]')?.getAttribute('data-message')
const rail = () => screen.getByRole('navigation', { name: 'Folders' })
const place = (box: string) => rail().querySelector(`[data-box="${box}"]`) as HTMLButtonElement
const values = () => screen.getAllByTestId('hero-value').map((el) => el.textContent)
const itemCalled = (spy: ReturnType<typeof vi.spyOn>, n = 0) => (spy.mock.calls[n] as unknown[])[0] as InboxItem

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
  resetSampleInbox()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  // @ts-expect-error jsdom has no matchMedia; put it back the way it was
  delete window.matchMedia
})

describe('Inbox, two panes', () => {
  it('opens as a list on the left and the first message in the reading pane, with one primary and two hero numbers', async () => {
    mock()
    open()
    expect(screen.getByRole('heading', { level: 1, name: 'Inbox' })).toBeInTheDocument()
    await waitFor(() => expect(rows()).toHaveLength(12))
    expect(values()).toEqual(['12', '16'])
    // Ranked: the notice first, new before stale.
    expect(rowIds()).toEqual(['in-1', 'in-2', 'in-3', 'in-4', 'in-5', 'in-6', 'in-9', 'in-7', 'in-8', 'in-10', 'in-11', 'in-12'])
    expect(rows()[1]).toHaveTextContent('Northwind Sample Co')
    expect(rows()[1]).toHaveTextContent('Senior PMM at Northwind Sample Co')
    expect(rows()[1]).toHaveTextContent('JOB')
    expect(rows()[1]).toHaveTextContent('20h')
    expect(rows()[1].querySelector('[data-dot]')).toHaveAttribute('data-dot', 'solid')
    expect(rows()[11].querySelector('[data-dot]')).toHaveAttribute('data-dot', 'hollow')
    expect(rows()[6]).toHaveTextContent('Late')
    expect(chosen()).toBe('in-1')
    expect(reading()).toBe('Outlook needs signing in again')
    const main = screen.getByRole('main')
    expect(main.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    expect(readingPrimary()).toHaveTextContent('Fix')
    expect(main.querySelectorAll('svg, canvas, img')).toHaveLength(0)
    // The left side: Inbox with its count, the owner's folder, then the three looking-back views.
    expect(within(rail()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Inbox12', 'Clients1', 'Candidates4', 'Job leads4', 'Other3', 'Hold for later', 'New folder', 'Sent for you', 'Done', 'Binned'])
  })

  it('an automatic folder shows only its kind of item, and is in the address', async () => {
    mock()
    open()
    await waitFor(() => expect(rows()).toHaveLength(12))
    await userEvent.click(within(rail()).getByRole('button', { name: /^Job leads/ }))
    await waitFor(() => expect(rows()).toHaveLength(4))
    expect(place('auto:leads')).toHaveAttribute('aria-current', 'true')
    expect(rows().every((r) => /JOB$|LEAD$/.test(r.textContent ?? ''))).toBe(true)
  })

  it('j and k move the selection; d acts on the chosen one and opens the next; Undo puts it back', async () => {
    const { actOn, undo } = mock()
    open()
    await waitFor(() => expect(chosen()).toBe('in-1'))
    await userEvent.keyboard('j')
    expect(chosen()).toBe('in-2')
    expect(reading()).toBe('Senior PMM at Northwind Sample Co')
    expect(readingPrimary()).toHaveTextContent('Chased')
    expect(within(pane()).getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(within(pane()).getByRole('link', { name: 'Open source' })).toBeInTheDocument()
    expect(within(pane()).getByText('Found by the jobs agent, sample week')).toBeInTheDocument()
    await userEvent.keyboard('jk')
    expect(chosen()).toBe('in-2')
    await userEvent.keyboard('d')
    expect(actOn).toHaveBeenCalledTimes(1)
    expect(itemCalled(actOn).id).toBe('in-2')
    expect(actOn.mock.calls[0][1]).toBe('done')
    expect(rowIds()).not.toContain('in-2')
    expect(chosen()).toBe('in-3')
    expect(reading()).toBe('Director of PMM at Contoso Demo Inc')
    await userEvent.click(within(pane()).getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(itemCalled(undo).id).toBe('in-2')
    expect(rowIds()).toContain('in-2')
    expect(chosen()).toBe('in-2')
  })

  it('T-INBX-3 x asks why with three reasons, Other and Keep it; a reason bins it', async () => {
    const { actOn } = mock()
    open('/inbox?card=item:in-2')
    await waitFor(() => expect(chosen()).toBe('in-2'))
    await userEvent.keyboard('x')
    const why = screen.getByRole('group', { name: 'Why' })
    expect(within(why).getAllByRole('button').map((b) => b.textContent)).toEqual(['Not a fit', 'Already known', 'Filled', 'Other', 'Keep it'])
    expect(actOn).not.toHaveBeenCalled()
    await userEvent.click(within(why).getByRole('button', { name: 'Not a fit' }))
    expect(actOn.mock.calls[0][1]).toBe('bin')
    expect(actOn.mock.calls[0][2]).toEqual({ binReason: 'Not a fit' })
    expect(chosen()).toBe('in-3')
  })

  it('a ?card=item:id link opens that message, in its folder when it has one', async () => {
    mock({ items: waitingItems().map((i) => (i.id === 'in-5' ? { ...i, folderId: 'folder-1' } : i)) })
    open('/inbox?card=item:in-5')
    await waitFor(() => expect(chosen()).toBe('in-5'))
    expect(reading()).toBe('Ben Sample was promoted')
    expect(place('folder:folder-1')).toHaveAttribute('aria-current', 'true')
    expect(rowIds()).toEqual(['in-5'])
    expect(within(rail()).getByRole('button', { name: /^Inbox/ })).toHaveTextContent('Inbox11')
    expect(within(rail()).getByRole('button', { name: /^Hold for later/ })).toHaveTextContent('Hold for later1')
  })

  it('a draft edited in the reading pane is saved with the action, and Reset restores the original', async () => {
    const { actOn } = mock()
    open('/inbox?card=item:in-2')
    await waitFor(() => expect(chosen()).toBe('in-2'))
    await userEvent.keyboard('e')
    const box = within(pane()).getByRole('textbox', { name: 'Draft' })
    expect(box).toHaveFocus()
    await userEvent.keyboard(' Best, Jason')
    expect(within(pane()).getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    await userEvent.click(readingPrimary())
    expect(actOn.mock.calls[0][2]).toEqual({ draft: expect.stringMatching(/Best, Jason$/) })
  })

  it('T-INBX-4 items that arrive while the page is open wait behind a quiet N new line', async () => {
    const { items } = mock()
    open()
    await waitFor(() => expect(rows()).toHaveLength(12))
    const extra = Array.from({ length: 5 }, (_, n) => ({ ...waitingItems()[1], id: `late-${n}`, title: `Late arrival ${n}` }))
    items.mockResolvedValue([...waitingItems(), ...extra])
    vi.setSystemTime(new Date('2026-11-11T10:02:00Z'))
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(await screen.findByRole('button', { name: '5 new' })).toBeInTheDocument()
    expect(rows()).toHaveLength(12)
    expect(values()[0]).toBe('17')
    await userEvent.click(screen.getByRole('button', { name: '5 new' }))
    expect(rows()).toHaveLength(17)
  })

  it('Snooze asks until when; Pass on asks for the colleague and the split; Approve asks for a day', async () => {
    const { actOn } = mock()
    open()
    await waitFor(() => expect(chosen()).toBe('in-1'))
    await userEvent.keyboard('s')
    const until = screen.getByRole('group', { name: 'Until' })
    expect(within(until).getAllByRole('button').map((b) => b.textContent)).toEqual(['Tomorrow', 'Thursday', 'Next Monday'])
    await userEvent.click(within(until).getByRole('button', { name: 'Next Monday' }))
    expect(actOn.mock.calls[0][1]).toBe('snooze')
    expect(actOn.mock.calls[0][2]).toEqual({ snoozedUntil: '2026-11-16' })

    await userEvent.click(screen.getByRole('button', { name: /Sales role at Fabrikam/ }))
    expect(reading()).toBe('Sales role at Fabrikam Test Ltd')
    await userEvent.click(readingPrimary())
    const form = screen.getByRole('form', { name: 'Pass on' })
    await userEvent.click(within(form).getByRole('button', { name: 'Pass on' }))
    expect(within(form).getByText("Add the colleague's name")).toBeInTheDocument()
    expect(actOn).toHaveBeenCalledTimes(1)
    await userEvent.type(within(form).getByLabelText('Colleague'), 'Sam Colleague')
    await userEvent.type(within(form).getByLabelText('Split'), 'Half each')
    await userEvent.click(within(form).getByRole('button', { name: 'Pass on' }))
    expect(actOn.mock.calls[1][1]).toBe('pass')
    expect(actOn.mock.calls[1][2]).toEqual({ colleague: 'Sam Colleague', split: 'Half each' })

    expect(reading()).toBe('Post: what a PMM interview loop gets wrong')
    expect(readingPrimary()).toHaveTextContent('Approve')
    await userEvent.click(readingPrimary())
    const when = screen.getByRole('group', { name: 'For when' })
    await userEvent.click(within(when).getByRole('button', { name: 'Tomorrow' }))
    expect(actOn.mock.calls[2][1]).toBe('approve')
    expect(actOn.mock.calls[2][2]).toEqual({ on: '2026-11-12' })
  })

  it('filters the list by type', async () => {
    mock()
    open()
    await waitFor(() => expect(rows()).toHaveLength(12))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Show' }), 'job_lead')
    expect(rowIds()).toEqual(['in-2', 'in-3', 'in-4'])
  })

  it('INBX-5 Clear old items bins the stale ones after one confirmation that counts them by type', async () => {
    const { binStale } = mock()
    open()
    await waitFor(() => expect(rows()).toHaveLength(12))
    await userEvent.click(screen.getByRole('button', { name: 'Clear old items' }))
    expect(screen.getByText('Bin 1 call, 1 follow-up?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Bin them' }))
    expect(binStale).toHaveBeenCalledWith(['in-11', 'in-12'])
    expect(rows()).toHaveLength(10)
    expect(screen.queryByRole('button', { name: 'Clear old items' })).not.toBeInTheDocument()
  })

  it('a failed write puts the item back and says so once', async () => {
    mock({ fail: true })
    open('/inbox?card=item:in-2')
    await waitFor(() => expect(chosen()).toBe('in-2'))
    await userEvent.click(readingPrimary())
    expect(await screen.findByRole('status')).toHaveTextContent('That did not save. Try again.')
    expect(rowIds()).toContain('in-2')
  })

  it('Sent for you lists what was sent automatically, marked Auto, with no primary', async () => {
    mock()
    open('/inbox?view=sent')
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(rows()[0]).toHaveTextContent('Thank-you sent to Dev Madeup')
    expect(rows()[0]).toHaveTextContent('Auto')
    expect(place('sent')).toHaveAttribute('aria-current', 'true')
    expect(reading()).toBe('Thank-you sent to Dev Madeup')
    expect(screen.getByRole('main').querySelectorAll('[data-kind="primary"]')).toHaveLength(0)
  })

  it('Done and Binned look back with no primary; a binned item can be put back', async () => {
    const { undo } = mock()
    vi.spyOn(data, 'inboxClosed').mockImplementation(async (view) =>
      view === 'done'
        ? freshSampleInbox().filter((i) => i.id === 'in-14')
        : [{ ...waitingItems()[1], status: 'binned', binReason: 'Not a fit' }],
    )
    open('/inbox?show=done')
    await waitFor(() => expect(rowIds()).toEqual(['in-14']))
    expect(screen.getByRole('main').querySelectorAll('[data-kind="primary"]')).toHaveLength(0)
    await userEvent.click(place('binned'))
    await waitFor(() => expect(rowIds()).toEqual(['in-2']))
    expect(within(pane()).getByText('Binned: Not a fit')).toBeInTheDocument()
    await userEvent.click(within(pane()).getByRole('button', { name: 'Put back' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(itemCalled(undo).status).toBe('new')
    expect(await screen.findByText('Nothing binned in the last 30 days')).toBeInTheDocument()
  })
})

describe('Inbox folders', () => {
  it('makes a folder, files the chosen message into it from the reading pane, and counts it', async () => {
    const { moveItem } = mock()
    open('/inbox?card=item:in-3')
    await waitFor(() => expect(chosen()).toBe('in-3'))
    await userEvent.click(within(rail()).getByRole('button', { name: 'New folder' }))
    const form = screen.getByRole('form', { name: 'New folder' })
    await userEvent.type(within(form).getByLabelText('New folder'), 'hold FOR later')
    await userEvent.click(within(form).getByRole('button', { name: 'Make it' }))
    expect(within(form).getByText('That name is taken')).toBeInTheDocument()
    await userEvent.clear(within(form).getByLabelText('New folder'))
    await userEvent.type(within(form).getByLabelText('New folder'), 'Hot{Enter}')
    const hot = await within(rail()).findByRole('button', { name: /^Hot/ })
    const hotId = hot.getAttribute('data-box')!.slice(7)

    await userEvent.selectOptions(within(pane()).getByRole('combobox', { name: 'Folder' }), 'Hot')
    expect(moveItem).toHaveBeenCalledWith('in-3', hotId)
    expect(rowIds()).not.toContain('in-3')
    expect(chosen()).toBe('in-4')
    expect(hot).toHaveTextContent('Hot1')
    expect(place('inbox')).toHaveTextContent('Inbox11')

    await userEvent.click(hot)
    await waitFor(() => expect(rowIds()).toEqual(['in-3']))
    expect(reading()).toBe('Director of PMM at Contoso Demo Inc')
  })

  it('a row dragged onto a folder is filed there', async () => {
    const { moveItem } = mock()
    open()
    await waitFor(() => expect(rows()).toHaveLength(12))
    const row = rows()[2] as HTMLElement
    expect(row).toHaveAttribute('draggable', 'true')
    fireEvent.dragOver(place('folder:folder-1'), { dataTransfer: { dropEffect: '' } })
    fireEvent.drop(place('folder:folder-1'), { dataTransfer: { getData: () => 'in-3' } })
    expect(moveItem).toHaveBeenCalledWith('in-3', 'folder-1')
    expect(rowIds()).not.toContain('in-3')
    expect(place('folder:folder-1')).toHaveTextContent('Hold for later1')
  })

  it('renames a folder, and deleting it returns its items to Inbox', async () => {
    const { deleteFolder } = mock({ items: waitingItems().map((i) => (i.id === 'in-6' ? { ...i, folderId: 'folder-1' } : i)) })
    open('/inbox?folder=folder-1')
    await waitFor(() => expect(rowIds()).toEqual(['in-6']))
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const name = screen.getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Client chats{Enter}')
    expect(place('folder:folder-1')).toHaveTextContent('Client chats1')

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Delete Client chats? Its items go back to Inbox.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))
    expect(deleteFolder).toHaveBeenCalledWith('folder-1')
    expect(within(rail()).queryByRole('button', { name: /Client chats/ })).not.toBeInTheDocument()
    expect(place('inbox')).toHaveAttribute('aria-current', 'true')
    await waitFor(() => expect(rowIds()).toContain('in-6'))
    expect(place('inbox')).toHaveTextContent('Inbox12')
  })
})

describe('Inbox deck', () => {
  it('T-INBX-1 the deck is one link away and opens on 01 of 12 with one primary button, the notice first', async () => {
    mock()
    open()
    await waitFor(() => expect(rows()).toHaveLength(12))
    await userEvent.click(screen.getByRole('button', { name: 'Deck' }))
    await waitFor(() => expect(counter()).toBe('01 of 12'))
    const main = screen.getByRole('main')
    expect(main.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    expect(title()).toBe('Outlook needs signing in again')
    expect(primary()).toHaveTextContent('Fix')
    expect(screen.getByRole('img', { name: '0 of 12' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(rows()).toHaveLength(12)
  })

  it('T-INBX-2 d on a job lead in the deck marks it done and the meter gains a tick', async () => {
    const { actOn } = mock()
    open('/inbox?view=deck')
    await waitFor(() => expect(counter()).toBe('01 of 12'))
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(title()).toBe('Senior PMM at Northwind Sample Co')
    await userEvent.keyboard('d')
    expect(itemCalled(actOn).id).toBe('in-2')
    expect(actOn.mock.calls[0][1]).toBe('done')
    expect(title()).toBe('Director of PMM at Contoso Demo Inc')
    expect(counter()).toBe('02 of 12')
    expect(screen.getByRole('img', { name: '1 of 12' })).toBeInTheDocument()
  })

  it('T-INBX-3 in the deck, Bin and then Undo within 8 seconds puts it back', async () => {
    const { undo } = mock()
    open('/inbox?view=deck')
    await waitFor(() => expect(counter()).toBe('01 of 12'))
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await userEvent.keyboard('x')
    await userEvent.click(within(screen.getByRole('group', { name: 'Why' })).getByRole('button', { name: 'Not a fit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(itemCalled(undo).id).toBe('in-2')
    expect(undo.mock.calls[0][1]).toBe('bin')
    expect(title()).toBe('Senior PMM at Northwind Sample Co')
  })
})

describe('Inbox on a phone', () => {
  it('shows the list; tapping a message opens it full screen with Back', async () => {
    pretendPhone(true)
    mock()
    open()
    await waitFor(() => expect(rows()).toHaveLength(12))
    expect(screen.queryByRole('article', { name: 'Reading pane' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Senior PMM at Northwind/ }))
    expect(reading()).toBe('Senior PMM at Northwind Sample Co')
    expect(screen.queryByRole('region', { name: 'Messages' })).not.toBeInTheDocument()
    await userEvent.click(within(pane()).getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(rows()).toHaveLength(12))
    expect(screen.queryByRole('article', { name: 'Reading pane' })).not.toBeInTheDocument()
  })
})
