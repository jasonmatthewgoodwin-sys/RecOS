import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data } from '../../lib/data'
import { freshSampleMembers, sampleLists } from '../../lib/sample'

// P1-39: the two lists under People (29.1 as restructured, T-PEO-1 to 4) on
// the invented sample members.

const session = { firstName: 'Jason', role: 'owner' as const }

function mock() {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 3, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  vi.spyOn(data, 'lists').mockResolvedValue(sampleLists)
  vi.spyOn(data, 'members').mockResolvedValue(freshSampleMembers())
  vi.spyOn(data, 'touches').mockResolvedValue([{ id: 't1', touchedOn: '2026-11-07', channel: 'phone', kind: 'call', note: 'Talked about the Boston role' }])
  return {
    reply: vi.spyOn(data, 'logReply').mockResolvedValue(),
    tier: vi.spyOn(data, 'moveTier').mockResolvedValue(),
    remove: vi.spyOn(data, 'removeFromList').mockResolvedValue(),
    dnc: vi.spyOn(data, 'setDoNotContact').mockResolvedValue(),
    notes: vi.spyOn(data, 'saveNotes').mockResolvedValue(),
    add: vi.spyOn(data, 'addPerson').mockResolvedValue(),
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

describe('People, Senior network', () => {
  it('T-PEO-1 opens /people on Senior network: two numbers, this week first, 8 rows or fewer', async () => {
    mock()
    open('/people')
    expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Senior network' })).toHaveAttribute('aria-current', 'page')
    await waitFor(() => expect(values()).toEqual(['06', '2/50']))
    expect(screen.getByRole('main').querySelectorAll('[data-hero-stat]')).toHaveLength(2)
    expect(screen.getByRole('img', { name: '1 of 20' })).toBeInTheDocument()
    // Signals first, then late premier, then late championship, then League One cycles.
    expect(rows()[0]).toHaveTextContent('Gia Imaginary')
    expect(rows()[1]).toHaveTextContent('Ben Sample')
    expect(rows().length).toBeLessThanOrEqual(8)
    expect(screen.getByText('PROMOTED')).toBeInTheDocument()
    expect(screen.getAllByText('Late').length).toBeGreaterThan(0)
    expect(screen.getByRole('main').querySelectorAll('[data-kind="primary"]')).toHaveLength(0)
  })

  it('All groups everyone under the three tiers with 7 rows and Show more, and the top candidates are a separate page', async () => {
    mock()
    open('/people/senior-network?show=all')
    await waitFor(() => expect(rows()).toHaveLength(7))
    const dividers = [...screen.getByRole('main').querySelectorAll('[data-divider]')].map((d) => d.textContent)
    expect(dividers).toEqual(['Premier', 'Championship', 'League One'])
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(rows()).toHaveLength(8)
    expect(screen.queryByRole('button', { name: /^Ada Example/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Top candidates' }))
    await waitFor(() => expect(values()).toEqual(['04', '3/50']))
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByRole('button', { name: /^Ada Example/ })).toBeInTheDocument()
  })

  it('T-PEO-2 Logged a reply on a late member: dot turns hollow, last touch is today, Due falls by one', async () => {
    const { reply } = mock()
    open('/people')
    await waitFor(() => expect(values()[0]).toBe('06'))
    const cara = screen.getByRole('button', { name: /^Cara Placeholder/ })
    expect(cara.querySelector('[data-dot]')).toHaveAttribute('data-dot', 'solid')
    await userEvent.click(within(cara.closest('li')!).getByRole('button', { name: 'Logged a reply' }))
    expect(reply).toHaveBeenCalledWith('p-cara')
    await waitFor(() => expect(values()[0]).toBe('05'))
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    const after = screen.getByRole('button', { name: /^Cara Placeholder/ })
    expect(after.querySelector('[data-dot]')).toHaveAttribute('data-dot', 'hollow')
    expect(after.closest('li')).toHaveTextContent('Today')
  })

  it('T-PEO-3 the person card shows no email or phone, moves tier with a reason, and keeps history', async () => {
    const { tier } = mock()
    open('/people/senior-network?card=person:p-ben')
    const card = await screen.findByRole('dialog', { name: 'Ben Sample' })
    expect(card.textContent).not.toMatch(/@|\+44|\d{3}[ -]\d{3}/)
    expect(within(card).getByRole('link', { name: 'Open in CRM' })).toBeInTheDocument()
    expect(within(card).getByText('PROMOTED')).toBeInTheDocument()
    expect(await within(card).findByText('Talked about the Boston role')).toBeInTheDocument()
    expect(within(card).getByText('2 jobs briefed, 0 referrals given, 0 introductions')).toBeInTheDocument()
    expect(card.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    const pills = within(card).getByRole('group', { name: 'Tier' })
    expect(within(pills).getByRole('button', { name: 'Premier' })).toHaveAttribute('aria-current', 'true')
    await userEvent.click(within(pills).getByRole('button', { name: 'Championship' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Move to Championship' }))
    expect(within(card).getByText('Say why, in a line')).toBeInTheDocument()
    expect(tier).not.toHaveBeenCalled()
    await userEvent.type(within(card).getByLabelText('Why'), 'Gone quiet since the move')
    await userEvent.click(within(card).getByRole('button', { name: 'Move to Championship' }))
    expect(tier).toHaveBeenCalledWith('m-ben', 'championship', 'Gone quiet since the move')
  })

  it('T-PEO-4 Do not contact asks once, then removes them from the list', async () => {
    const { dnc } = mock()
    open('/people/senior-network?card=person:p-cara')
    const card = await screen.findByRole('dialog', { name: 'Cara Placeholder' })
    await userEvent.click(within(card).getByRole('button', { name: 'Do not contact' }))
    expect(within(card).getByText(/their drafts are cancelled/)).toBeInTheDocument()
    expect(dnc).not.toHaveBeenCalled()
    const confirm = within(card).getAllByRole('button', { name: 'Do not contact' }).at(-1)!
    await userEvent.click(confirm)
    await waitFor(() => expect(dnc).toHaveBeenCalledWith('p-cara'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^Cara Placeholder/ })).not.toBeInTheDocument()
  })

  it('Add person asks for a name, company and tier, and nothing more (29.4)', async () => {
    const { add } = mock()
    open('/people')
    await waitFor(() => expect(values()[0]).toBe('06'))
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }))
    const form = screen.getByRole('form', { name: 'Add person' })
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(within(form).getByText('Add their name')).toBeInTheDocument()
    await userEvent.type(within(form).getByLabelText('Name'), 'Sam Newperson')
    await userEvent.type(within(form).getByLabelText('Company'), 'Acme Pretend')
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Tier' }), 'championship')
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(add).toHaveBeenCalledWith({ name: 'Sam Newperson', title: '', company: 'Acme Pretend', tier: 'championship', why: '', listId: 'list-senior' }))
  })
})
