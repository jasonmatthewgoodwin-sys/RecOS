import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data } from '../../lib/data'
import { freshSampleContent, freshSampleInbox, resetSampleContent, sampleSource } from '../../lib/sample'
import { eventsOrder } from './Events'

// Content, Events (Jason, 14 November 2026): his own events, added by hand
// and on the calendar; ideas for events from the agent, made into an event
// or binned. One calendar for posts and events.

const session = { firstName: 'Jason', role: 'owner' as const }

function mock() {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 6, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  vi.spyOn(data, 'contentItems').mockImplementation(sampleSource.contentItems)
  vi.spyOn(data, 'inboxItems').mockResolvedValue(freshSampleInbox())
  return {
    add: vi.spyOn(data, 'addContent').mockImplementation((input) => sampleSource.addContent(input)),
    update: vi.spyOn(data, 'updateContent').mockImplementation((id, patch) => sampleSource.updateContent(id, patch)),
    act: vi.spyOn(data, 'actOnInbox').mockResolvedValue(),
  }
}

function open(path = '/content/events') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SignedIn session={session} />
    </MemoryRouter>,
  )
}

const values = () => screen.getAllByTestId('hero-value').map((el) => el.textContent)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
  resetSampleContent()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Content, Events', () => {
  it('shows the next event in days, the ideas waiting, the event tiles and the idea rows', async () => {
    mock()
    open()
    await waitFor(() => expect(values()).toEqual(['6d', '01']))
    const yours = screen.getByRole('region', { name: 'Your events' })
    expect(within(yours).getByRole('button', { name: /^PMM breakfast on pricing pages/ }).textContent).toContain('In 6 days')
    const ideas = screen.getByRole('region', { name: 'Ideas for events' })
    expect(within(ideas).getByRole('button', { name: /^Breakfast on pricing pages/ })).toBeInTheDocument()
  })

  it('Add an event opens the composer as an event; a saved event lands on the list and the calendar', async () => {
    const { add } = mock()
    open()
    await waitFor(() => expect(values()).toEqual(['6d', '01']))
    await userEvent.click(screen.getByRole('button', { name: 'Add an event' }))
    const card = await screen.findByRole('dialog', { name: 'Wednesday 11 November' })
    expect(within(card).getByRole('form', { name: 'Add an event' })).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }))
    expect(within(card).getByText('Give the event a name.')).toBeInTheDocument()
    await userEvent.type(within(card).getByLabelText('Name'), 'Happy hour for PMM leads')
    await userEvent.selectOptions(within(card).getByLabelText('Type'), 'happy_hour')
    await userEvent.type(within(card).getByLabelText('Time'), '18:00')
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(add).toHaveBeenCalledWith({ kind: 'event', copy: '', topic: 'Happy hour for PMM leads', eventType: 'happy_hour', eventTime: '18:00', plannedFor: '2026-11-11', status: 'planned' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Your events' })).getByRole('button', { name: /^Happy hour for PMM leads/ })).toBeInTheDocument())
    await waitFor(() => expect(values()[0]).toBe('Today'))
    await userEvent.click(screen.getByRole('link', { name: 'Calendar' }))
    await waitFor(() => expect(within(document.querySelector('[data-day="2026-11-11"]') as HTMLElement).getByRole('button', { name: /^18:00 Happy hour for PMM leads/ })).toBeInTheDocument())
  })

  it('an idea becomes an event with its name filled in and leaves the ideas; Bin puts it in the bin', async () => {
    const { add, act } = mock()
    open()
    await waitFor(() => expect(values()).toEqual(['6d', '01']))
    const ideas = screen.getByRole('region', { name: 'Ideas for events' })
    await userEvent.click(within(ideas).getByRole('button', { name: 'Make it an event' }))
    const card = await screen.findByRole('dialog', { name: 'Wednesday 11 November' })
    expect(within(card).getByLabelText('Name')).toHaveValue('Breakfast on pricing pages')
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(add).toHaveBeenCalledWith(expect.objectContaining({ kind: 'event', topic: 'Breakfast on pricing pages' })))
    await waitFor(() => expect(act).toHaveBeenCalledWith(expect.objectContaining({ id: 'in-10' }), 'done'))
    await waitFor(() => expect(values()[1]).toBe('00'))
  })

  it('orders upcoming events first by day, then held ones newest first', () => {
    const items = freshSampleContent()
    const past = { ...items.find((c) => c.kind === 'event')!, id: 'e-old', status: 'posted' as const, plannedFor: '2026-11-02', postedOn: '2026-11-02' }
    expect(eventsOrder([...items, past], '2026-11-11').map((c) => c.id)).toEqual(['c8', 'e-old'])
  })
})
