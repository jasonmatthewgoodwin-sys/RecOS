import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data } from '../../lib/data'
import { freshSampleSignals, sampleLists } from '../../lib/sample'

// P1-40: the Signals page and card (29.2, T-PEO-6).

const session = { firstName: 'Jason', role: 'owner' as const }

function mock() {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 3, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  vi.spyOn(data, 'lists').mockResolvedValue(sampleLists)
  vi.spyOn(data, 'signals').mockResolvedValue(freshSampleSignals())
  return {
    status: vi.spyOn(data, 'setSignalStatus').mockResolvedValue(),
    add: vi.spyOn(data, 'addSignalToList').mockResolvedValue(),
  }
}

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SignedIn session={session} />
    </MemoryRouter>,
  )
}

const values = () => screen.getAllByTestId('hero-value').map((el) => el.textContent)
const rows = () => screen.getByRole('main').querySelectorAll('[data-row]')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Signals', () => {
  it('lists this week strongest first with the change in plain words, and Ignore clears a row', async () => {
    const { status } = mock()
    open('/people/signals')
    await waitFor(() => expect(values()).toEqual(['05']))
    expect(screen.getByRole('main').querySelectorAll('[data-hero-stat]')).toHaveLength(1)
    expect(rows()).toHaveLength(5)
    expect(rows()[0]).toHaveTextContent('Ben Sample')
    expect(rows()[0]).toHaveTextContent('Now VP Product Marketing at Contoso Demo Inc')
    expect(rows()[0].querySelector('[data-dot]')).toHaveAttribute('data-dot', 'solid')
    expect(rows()[3].querySelector('[data-dot]')).toHaveAttribute('data-dot', 'hollow')
    expect(rows()[0].closest('li')).toHaveTextContent('PROMOTED 1d')
    await userEvent.click(within(rows()[4].closest('li')!).getByRole('button', { name: 'Ignore' }))
    expect(status).toHaveBeenCalledWith('sig-tam', 'ignored')
    await waitFor(() => expect(values()).toEqual(['04']))
  })

  it('T-PEO-6 the card for someone already on a list has no Add to league; Get in touch marks it actioned', async () => {
    const { status, add } = mock()
    open('/people/signals?card=signal:sig-ben')
    const card = await screen.findByRole('dialog', { name: 'Ben Sample' })
    expect(within(card).getByText('Why it matters')).toBeInTheDocument()
    expect(within(card).getByRole('textbox', { name: 'Draft' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Add to league' })).not.toBeInTheDocument()
    expect(card.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    await userEvent.click(within(card).getByRole('button', { name: 'Get in touch' }))
    await waitFor(() => expect(status).toHaveBeenCalledWith('sig-ben', 'actioned'))
    expect(add).not.toHaveBeenCalled()
  })

  it('Add to league on a new name puts them on the senior network at League One', async () => {
    const { add } = mock()
    open('/people/signals?card=signal:sig-gia')
    const card = await screen.findByRole('dialog', { name: 'Gia Imaginary' })
    await userEvent.click(within(card).getByRole('button', { name: 'Add to league' }))
    await waitFor(() => expect(add).toHaveBeenCalledWith(expect.objectContaining({ id: 'sig-gia' }), 'list-senior'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^Gia Imaginary/ })).not.toBeInTheDocument()
  })
})
