import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../App'
import { AuthProvider } from '../lib/auth'
import { captureProblem } from '../lib/capture'
import { data } from '../lib/data'
import { resetSampleMembers, sampleSource } from '../lib/sample'

// P1-35: search and quick capture as windows in the centre (25.7), by key and by icon.

const owner = { firstName: 'Jason', role: 'owner' as const }

function mock() {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 3, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  vi.spyOn(data, 'search').mockImplementation(sampleSource.search)
  vi.spyOn(data, 'lists').mockImplementation(sampleSource.lists)
  vi.spyOn(data, 'members').mockImplementation(sampleSource.members)
  vi.spyOn(data, 'touches').mockImplementation(sampleSource.touches)
  return { capture: vi.spyOn(data, 'capture').mockImplementation(sampleSource.capture) }
}

function open(path = '/home') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <SignedIn session={owner} />
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
  resetSampleMembers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('quick capture', () => {
  it('opens with c, offers five pills, refuses an empty field in words, saves a follow-up and goes to the list', async () => {
    const { capture } = mock()
    open()
    await userEvent.keyboard('c')
    const dialog = await screen.findByRole('dialog', { name: 'Add something' })
    expect(within(dialog).getAllByRole('button', { name: /Referral|Follow-up|Idea|Job lead|Number/ })).toHaveLength(5)
    expect(within(dialog).getByRole('button', { name: /Follow-up/ })).toHaveAttribute('aria-current', 'true')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getByText('Who is needed.')).toBeInTheDocument()
    expect(capture).not.toHaveBeenCalled()
    await userEvent.type(within(dialog).getByLabelText('Who'), 'Ben Sample')
    await userEvent.type(within(dialog).getByLabelText('What you owe them'), 'The role outline')
    await userEvent.type(within(dialog).getByLabelText('By'), '2026-11-13')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(capture).toHaveBeenCalledWith('follow_up', { personName: 'Ben Sample', reason: 'The role outline', dueOn: '2026-11-13' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add something' })).not.toBeInTheDocument())
    expect(await screen.findByRole('heading', { name: 'Business development' })).toBeInTheDocument()
  })

  it('the plus at the top right opens it too, and a number needs a whole number', async () => {
    mock()
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Quick capture' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add something' })
    await userEvent.click(within(dialog).getByRole('button', { name: /Number/ }))
    expect(within(dialog).getByLabelText('Which')).toBeInTheDocument()
    expect(captureProblem('number', { kpi: 'posts_chased', amount: '0', reason: 'x' })).toEqual({ key: 'amount', message: 'A whole number, not zero.' })
    expect(captureProblem('number', { kpi: 'posts_chased', amount: '-1', reason: 'x' })).toBeNull()
  })
})

describe('search', () => {
  it('opens with / and lists people, job leads and follow-ups under plain labels, three each', async () => {
    mock()
    open()
    await userEvent.keyboard('/')
    const dialog = await screen.findByRole('dialog', { name: 'Find' })
    await userEvent.type(within(dialog).getByLabelText('Name, company or role'), 'ben')
    const people = await within(dialog).findByRole('list', { name: 'People' })
    expect(within(people).getByRole('button', { name: /^Ben Sample/ })).toBeInTheDocument()
    await userEvent.click(within(people).getByRole('button', { name: /^Ben Sample/ }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Find' })).not.toBeInTheDocument())
    expect(await screen.findByRole('heading', { name: 'People' })).toBeInTheDocument()
    expect(await screen.findByRole('dialog', { name: 'Ben Sample' }, { timeout: 3000 })).toBeInTheDocument()
  })
})
