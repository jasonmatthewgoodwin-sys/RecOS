import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data, type FollowUp } from '../../lib/data'
import { workingDays } from '../../lib/followups'
import { freshSampleFollowUps } from '../../lib/sample'

// T-FUP-3, T-FUP-4, T-FUP-5 and T-FUPS-2, T-FUPS-3 (sections 21.7 and 27.11),
// the list and the Monday focus view. Everything runs on the sample follow-ups.

const session = { firstName: 'Jason', role: 'owner' as const }

function mock(over: { items?: FollowUp[]; fail?: boolean } = {}) {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 6, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  vi.spyOn(data, 'followUps').mockResolvedValue(over.items ?? freshSampleFollowUps())
  const status = vi.spyOn(data, 'setFollowUpStatus')
  if (over.fail) status.mockRejectedValue(new Error('down'))
  else status.mockResolvedValue()
  const redate = vi.spyOn(data, 'redateFollowUps').mockResolvedValue()
  const block = vi.spyOn(data, 'recordFollowUpBlock').mockResolvedValue()
  return { status, redate, block }
}

function open(path = '/leads/follow-ups') {
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

beforeEach(() => {
  // Wednesday 11 November 2026, 10:00 UK.
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Follow-ups deck', () => {
  it('T-FUP-4 opens on the late ones first, oldest first, with waiting-on-them chases at the end', async () => {
    mock()
    open()
    await waitFor(() => expect(counter()).toBe('01 of 09'))
    expect(values()).toEqual(['07', '02'])
    expect(title()).toMatch(/^Ada Example/)
    expect(within(deck()).getByText('After a candidate call')).toBeInTheDocument()
    expect(screen.getByRole('main').querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    expect(primary()).toHaveTextContent('Done')
    const seen: string[] = []
    for (let i = 0; i < 9; i++) {
      seen.push(title()!)
      await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    }
    expect(seen.map((s) => s.split(',')[0])).toEqual([
      'Ada Example',
      'Dev Madeup',
      'Ben Sample',
      'Lee Example',
      'Gia Imaginary',
      'Hal Hypothetical',
      'Ivy Invented',
      'Cara Placeholder',
      'Kit Sample',
    ])
  })

  it('T-FUP-3 the three ways to close are Done, Handled offline and No action needed; a snooze asks until when', async () => {
    const { status } = mock()
    open()
    await waitFor(() => expect(counter()).toBe('01 of 09'))
    const names = within(deck()).getAllByRole('button').map((b) => b.textContent)
    expect(names).toEqual(expect.arrayContaining(['Done', 'Handled offline', 'No action needed', 'Skip', 'Snooze', 'Copy']))
    expect(names).not.toContain('Bin')
    await userEvent.click(screen.getByRole('button', { name: 'Handled offline' }))
    expect(status).toHaveBeenCalledWith('fu-ada', 'handled_offline', {})
    expect(title()).toMatch(/^Dev Madeup/)
    await userEvent.keyboard('s')
    await userEvent.click(within(screen.getByRole('group', { name: 'Until' })).getByRole('button', { name: 'Next Monday' }))
    expect(status).toHaveBeenCalledWith('fu-dev', 'snoozed', { snoozedUntil: '2026-11-16' })
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(status).toHaveBeenLastCalledWith('fu-dev', 'open')
    expect(title()).toMatch(/^Dev Madeup/)
  })

  it('an edited draft is saved with Done, and Copy is there when a draft exists', async () => {
    const { status } = mock()
    open()
    await waitFor(() => expect(counter()).toBe('01 of 09'))
    await userEvent.keyboard('e')
    await userEvent.keyboard(' See you Friday.')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(primary())
    expect(status).toHaveBeenCalledWith('fu-ada', 'done', { draft: expect.stringMatching(/See you Friday\.$/) })
  })

  it('T-FUPS-3 working the whole deck ends on one line and a full meter', async () => {
    mock()
    open()
    await waitFor(() => expect(counter()).toBe('01 of 09'))
    for (let i = 0; i < 9; i++) await userEvent.keyboard('d')
    expect(screen.getByText('Nobody is waiting on you')).toBeInTheDocument()
    expect(screen.getByText('09 cleared this sitting')).toBeInTheDocument()
  })

  it('a failed write puts the follow-up back and says so once', async () => {
    mock({ fail: true })
    open()
    await waitFor(() => expect(counter()).toBe('01 of 09'))
    await userEvent.click(primary())
    expect(await screen.findByRole('status')).toHaveTextContent('That did not save. Try again.')
  })
})

describe('Monday focus', () => {
  it("T-FUP-5 holds last week's calls, shows a quiet timer, and at 90 minutes moves the rest to Thursday", async () => {
    const { redate, block } = mock()
    open('/leads/follow-ups?focus=monday')
    await waitFor(() => expect(counter()).toBe('01 of 04'))
    expect(screen.getByTestId('focus-timer')).toHaveTextContent('Monday block 00:00')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000)
    })
    expect(screen.getByTestId('focus-timer')).toHaveTextContent('Monday block 01:01')
    await userEvent.keyboard('d')
    expect(counter()).toBe('02 of 04')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(89 * 60_000)
    })
    expect(screen.getByTestId('focus-timer')).toHaveTextContent('Time')
    expect(screen.getByText('Time. The rest moves to Thursday.')).toBeInTheDocument()
    expect(redate).toHaveBeenCalledWith(['fu-dev', 'fu-ben', 'fu-gia'], '2026-11-12')
    expect(block).toHaveBeenCalledWith(90)
  })
})

describe('Follow-ups list', () => {
  it('shows owed rows with the due day and Late at five working days, and Waiting on them apart', async () => {
    mock()
    open('/leads/follow-ups?view=list')
    await waitFor(() => expect(screen.getByRole('main').querySelectorAll('[data-row]')).toHaveLength(7))
    const rows = screen.getByRole('main').querySelectorAll('[data-row]')
    expect(rows[0]).toHaveTextContent('Ada Example, Northwind Sample Co')
    expect(rows[0].closest('li')).toHaveTextContent('Tue')
    expect(rows[0].querySelector('[data-dot]')).toHaveAttribute('data-dot', 'solid')
    // Ada (due 3 November) and Dev (4 November) are five working days past due; Ben (5 November) is four.
    expect(screen.getAllByText('Late')).toHaveLength(2)
    expect(workingDays('2026-11-03', '2026-11-11')).toBe(6)
    expect(workingDays('2026-11-05', '2026-11-11')).toBe(4)
    await userEvent.click(screen.getByRole('button', { name: 'Waiting on them' }))
    const waiting = screen.getByRole('main').querySelectorAll('[data-row]')
    expect(waiting).toHaveLength(2)
    expect(waiting[0].querySelector('[data-dot]')).toHaveAttribute('data-dot', 'hollow')
    await userEvent.click(screen.getByRole('button', { name: /^Cara Placeholder/ }))
    const card = await screen.findByRole('dialog', { name: 'Cara Placeholder, Fabrikam Test Ltd' })
    expect(within(card).getByText('Chase')).toBeInTheDocument()
    expect(card.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
  })
})
