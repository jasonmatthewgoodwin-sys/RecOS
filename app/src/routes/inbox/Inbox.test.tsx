import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data, type InboxItem } from '../../lib/data'
import { freshSampleInbox } from '../../lib/sample'

// Acceptance tests T-INBX-1 to 5 (section 27.11), the bin reasons, the
// snooze and approve choices, Pass on, the card and Sent for you. Everything
// runs on the invented sample inbox.

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
  return { items, actOn, undo, binStale }
}

function open(path = '/inbox') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SignedIn session={session} />
    </MemoryRouter>,
  )
}

const counter = () => screen.getByTestId('deck-counter').textContent
const deck = () => screen.getByRole('region', { name: 'Deck' })
const title = () => within(deck()).getByRole('heading', { level: 2 }).textContent
const primary = () => deck().querySelector('[data-kind="primary"]') as HTMLButtonElement
const values = () => screen.getAllByTestId('hero-value').map((el) => el.textContent)
const itemCalled = (spy: ReturnType<typeof vi.spyOn>, n = 0) => (spy.mock.calls[n] as unknown[])[0] as InboxItem

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Inbox deck', () => {
  it('T-INBX-1 opens on 01 of 12 with one primary button, the notice first, and two hero numbers', async () => {
    mock()
    open()
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument()
    await waitFor(() => expect(counter()).toBe('01 of 12'))
    expect(values()).toEqual(['12', '16'])
    const main = screen.getByRole('main')
    expect(main.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    expect(main.querySelectorAll('svg, canvas, img')).toHaveLength(0)
    expect(title()).toBe('Outlook needs signing in again')
    expect(within(deck()).getByText('NOTICE')).toBeInTheDocument()
    expect(primary()).toHaveTextContent('Fix')
    expect(screen.getByRole('img', { name: '0 of 12' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'List' })).toBeInTheDocument()
  })

  it('T-INBX-2 d on a job lead marks it done: the record moves, the next item shows, the meter gains a tick', async () => {
    const { actOn } = mock()
    open()
    await waitFor(() => expect(counter()).toBe('01 of 12'))
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(title()).toBe('Senior PMM at Northwind Sample Co')
    expect(within(deck()).getByText('JOB')).toBeInTheDocument()
    expect(primary()).toHaveTextContent('Chased')
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open source' })).toBeInTheDocument()
    await userEvent.keyboard('d')
    expect(actOn).toHaveBeenCalledTimes(1)
    expect(itemCalled(actOn).id).toBe('in-2')
    expect(actOn.mock.calls[0][1]).toBe('done')
    expect(title()).toBe('Director of PMM at Contoso Demo Inc')
    expect(counter()).toBe('02 of 12')
    expect(screen.getByRole('img', { name: '1 of 12' })).toBeInTheDocument()
  })

  it('T-INBX-3 Bin asks why with three reasons and Other; Undo within 8 seconds puts it back', async () => {
    const { actOn, undo } = mock()
    open()
    await waitFor(() => expect(counter()).toBe('01 of 12'))
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await userEvent.keyboard('x')
    const why = screen.getByRole('group', { name: 'Why' })
    expect(within(why).getAllByRole('button').map((b) => b.textContent)).toEqual(['Not a fit', 'Already known', 'Filled', 'Other'])
    expect(actOn).not.toHaveBeenCalled()
    await userEvent.click(within(why).getByRole('button', { name: 'Not a fit' }))
    expect(actOn.mock.calls[0][1]).toBe('bin')
    expect(actOn.mock.calls[0][2]).toEqual({ binReason: 'Not a fit' })
    expect(title()).toBe('Director of PMM at Contoso Demo Inc')
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(itemCalled(undo).id).toBe('in-2')
    expect(undo.mock.calls[0][1]).toBe('bin')
    expect(title()).toBe('Senior PMM at Northwind Sample Co')
    expect(counter()).toBe('01 of 12')
  })

  it('a draft edited in the deck is saved with the action, and Reset restores the original', async () => {
    const { actOn } = mock()
    open()
    await waitFor(() => expect(counter()).toBe('01 of 12'))
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await userEvent.keyboard('e')
    const box = screen.getByRole('textbox', { name: 'Draft' })
    expect(box).toHaveFocus()
    await userEvent.keyboard(' Best, Jason')
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    await userEvent.click(primary())
    expect(actOn.mock.calls[0][2]).toEqual({ draft: expect.stringMatching(/Best, Jason$/) })
  })

  it('T-INBX-4 items that arrive while the deck is open wait behind a quiet N new line', async () => {
    const { items } = mock()
    open()
    await waitFor(() => expect(counter()).toBe('01 of 12'))
    const extra = Array.from({ length: 5 }, (_, n) => ({ ...waitingItems()[1], id: `late-${n}`, title: `Late arrival ${n}` }))
    items.mockResolvedValue([...waitingItems(), ...extra])
    // Lists refresh when the window regains focus, at most once a minute (25.5).
    vi.setSystemTime(new Date('2026-11-11T10:02:00Z'))
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(await screen.findByRole('button', { name: '5 new' })).toBeInTheDocument()
    expect(counter()).toBe('01 of 12')
    expect(values()[0]).toBe('17')
    await userEvent.click(screen.getByRole('button', { name: '5 new' }))
    expect(counter()).toBe('01 of 17')
  })

  it('Snooze asks until when; Pass on asks for the colleague and the split; Approve asks for a day', async () => {
    const { actOn } = mock()
    open()
    await waitFor(() => expect(counter()).toBe('01 of 12'))
    await userEvent.keyboard('s')
    const until = screen.getByRole('group', { name: 'Until' })
    expect(within(until).getAllByRole('button').map((b) => b.textContent)).toEqual(['Tomorrow', 'Thursday', 'Next Monday'])
    await userEvent.click(within(until).getByRole('button', { name: 'Next Monday' }))
    expect(actOn.mock.calls[0][1]).toBe('snooze')
    expect(actOn.mock.calls[0][2]).toEqual({ snoozedUntil: '2026-11-16' })

    // Skip to the wider lead. Order: Northwind, Contoso, Globex, Ben, Eve, nudge, Fabrikam.
    for (let i = 0; i < 6; i++) await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(title()).toBe('Sales role at Fabrikam Test Ltd')
    await userEvent.click(primary())
    const form = screen.getByRole('form', { name: 'Pass on' })
    await userEvent.click(within(form).getByRole('button', { name: 'Pass on' }))
    expect(within(form).getByText("Add the colleague's name")).toBeInTheDocument()
    expect(within(form).getByText('Agree the split first')).toBeInTheDocument()
    expect(actOn).toHaveBeenCalledTimes(1)
    await userEvent.type(within(form).getByLabelText('Colleague'), 'Sam Colleague')
    await userEvent.type(within(form).getByLabelText('Split'), 'Half each')
    await userEvent.click(within(form).getByRole('button', { name: 'Pass on' }))
    expect(actOn.mock.calls[1][1]).toBe('pass')
    expect(actOn.mock.calls[1][2]).toEqual({ colleague: 'Sam Colleague', split: 'Half each' })

    expect(title()).toBe('Post: what a PMM interview loop gets wrong')
    expect(primary()).toHaveTextContent('Approve')
    await userEvent.click(primary())
    const when = screen.getByRole('group', { name: 'For when' })
    await userEvent.click(within(when).getByRole('button', { name: 'Tomorrow' }))
    expect(actOn.mock.calls[2][1]).toBe('approve')
    expect(actOn.mock.calls[2][2]).toEqual({ on: '2026-11-12' })
  })

  it('INBX-5 Clear old items bins the stale ones after one confirmation that counts them by type', async () => {
    const { binStale } = mock()
    open()
    await waitFor(() => expect(counter()).toBe('01 of 12'))
    await userEvent.click(screen.getByRole('button', { name: 'Clear old items' }))
    expect(screen.getByText('Bin 1 call, 1 follow-up?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Bin them' }))
    expect(binStale).toHaveBeenCalledWith(['in-11', 'in-12'])
    expect(counter()).toBe('01 of 10')
    expect(screen.queryByRole('button', { name: 'Clear old items' })).not.toBeInTheDocument()
  })

  it('a failed write puts the item back and says so once', async () => {
    mock({ fail: true })
    open()
    await waitFor(() => expect(counter()).toBe('01 of 12'))
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await userEvent.click(primary())
    expect(await screen.findByRole('status')).toHaveTextContent('That did not save. Try again.')
  })
})

describe('Inbox list and card', () => {
  it('T-INBX-5 List shows 7 rows and Show more, dots by status, the type as meta and Late where due', async () => {
    mock()
    open('/inbox?view=list')
    await waitFor(() => expect(screen.getByRole('main').querySelectorAll('[data-row]')).toHaveLength(7))
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument()
    const rows = screen.getByRole('main').querySelectorAll('[data-row]')
    expect(rows[0]).toHaveTextContent('Outlook needs signing in again')
    expect(rows[0]).toHaveTextContent('Fix')
    expect(rows[1].querySelector('[data-dot]')).toHaveAttribute('data-dot', 'solid')
    expect(screen.getByText('NOTICE')).toBeInTheDocument()
    expect(screen.getByText('Late')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    const all = screen.getByRole('main').querySelectorAll('[data-row]')
    expect(all).toHaveLength(12)
    expect(all[all.length - 1].querySelector('[data-dot]')).toHaveAttribute('data-dot', 'hollow')
  })

  it('filters the list by type, and a row opens the card with the same primary and a quiet foot line', async () => {
    const { actOn } = mock()
    open('/inbox?view=list')
    await waitFor(() => expect(screen.getByRole('main').querySelectorAll('[data-row]')).toHaveLength(7))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Show' }), 'job_lead')
    expect(screen.getByRole('main').querySelectorAll('[data-row]')).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: /^Senior PMM at Northwind/ }))
    const card = await screen.findByRole('dialog', { name: 'Senior PMM at Northwind Sample Co' })
    expect(within(card).getByText('JOB')).toBeInTheDocument()
    expect(within(card).getByText('Found by the jobs agent, sample week')).toBeInTheDocument()
    expect(card.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    await userEvent.click(within(card).getByRole('button', { name: 'Chased' }))
    await waitFor(() => expect(actOn).toHaveBeenCalledTimes(1))
    expect(itemCalled(actOn).id).toBe('in-2')
  })

  it('Sent for you lists what was sent automatically, marked Auto, with Open only', async () => {
    mock()
    open('/inbox?view=sent')
    const rows = await waitFor(() => {
      const r = screen.getByRole('main').querySelectorAll('[data-row]')
      expect(r).toHaveLength(1)
      return r
    })
    expect(rows[0]).toHaveTextContent('Thank-you sent to Dev Madeup')
    expect(screen.getByText('Auto')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Thank-you sent/ }))
    const card = await screen.findByRole('dialog')
    expect(card.querySelectorAll('[data-kind="primary"]')).toHaveLength(0)
  })
})
