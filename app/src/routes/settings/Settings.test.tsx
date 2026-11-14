import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data } from '../../lib/data'
import { resetSampleSettings, sampleSource, setSampleHeld } from '../../lib/sample'

// P1-45: Settings, Agents, Send rules and Targets (32.4). T-SET-1, T-SET-2, T-SET-4 (32.5).

const owner = { firstName: 'Jason', role: 'owner' as const }

function mock() {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 3, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  for (const m of ['agents', 'setAgentEnabled', 'agentRuns', 'agentPrompts', 'saveAgentPrompt', 'activateAgentPrompt', 'createAgentKey', 'revokeAgentKey', 'requestRun', 'sendingPaused', 'setSendingPaused', 'heldMessages', 'releaseHeld', 'sendPolicies', 'updateSendPolicy', 'targets', 'setTarget'] as const) {
    vi.spyOn(data, m).mockImplementation(sampleSource[m] as never)
  }
}

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SignedIn session={owner} />
    </MemoryRouter>,
  )
}

const rows = () => screen.getByRole('main').querySelectorAll('[data-row]')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // A Wednesday.
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
  resetSampleSettings()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Settings, Agents', () => {
  it('lists the seven agents with a solid dot for a failed last run and PAUSED where disabled; the card switches, shows runs and saves a prompt version', async () => {
    mock()
    open('/settings/agents')
    await waitFor(() => expect(rows()).toHaveLength(7))
    const signals = Array.from(rows()).find((r) => r.textContent?.includes('Relationship signals'))!
    expect(signals.querySelector('[data-dot]')).toHaveAttribute('data-dot', 'solid')
    const events = Array.from(rows()).find((r) => r.textContent?.includes('Event ideas'))!
    expect(events).toHaveTextContent('Paused')
    expect(events.closest('li')).toHaveTextContent('Not run yet')

    await userEvent.click(Array.from(rows()).find((r) => r.textContent?.includes('Jobs pipeline'))!)
    const card = await screen.findByRole('dialog', { name: 'Jobs pipeline' })
    expect(within(card).getByRole('switch', { name: 'On' })).toHaveAttribute('aria-checked', 'true')
    const runs = await within(card).findByRole('list', { name: 'Last runs' })
    expect(within(runs).getAllByRole('listitem')).toHaveLength(5)
    expect(within(runs).getAllByRole('listitem')[3]).toHaveTextContent('Partial, 1 item')
    expect(within(card).getByText('12.40 of 50.00')).toBeInTheDocument()
    const prompt = await within(card).findByRole('textbox', { name: 'Version 2' })
    expect(prompt).toHaveValue('Find product marketing job posts in the US that fit the ICP. Score each for fit and name the poster.')
    // A key is shown once, then the card only says when it was made (34.3).
    await userEvent.click(within(card).getByRole('button', { name: 'Create new key' }))
    expect(await within(card).findByTestId('new-key')).toHaveTextContent(/^sample/)
    await userEvent.click(within(card).getByRole('button', { name: 'Done' }))
    expect(within(card).queryByTestId('new-key')).not.toBeInTheDocument()
    expect(within(card).getByText(/Rotate every 90 days/)).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Ask for a run' }))
    expect(await within(card).findByText(/Asked\./)).toBeInTheDocument()

    await userEvent.click(within(card).getByRole('switch', { name: 'On' }))
    await waitFor(() => expect(within(card).getByRole('switch', { name: 'Off' })).toHaveAttribute('aria-checked', 'false'))
    expect(Array.from(rows()).find((r) => r.textContent?.includes('Jobs pipeline'))).toHaveTextContent('Paused')

    await userEvent.type(prompt, ' Leave out agencies.')
    await userEvent.type(within(card).getByLabelText('Note for this version'), 'No agencies')
    await userEvent.click(within(card).getByRole('button', { name: 'Save as new version' }))
    const v3 = await within(card).findByRole('textbox', { name: 'Version 3' })
    expect(v3).toHaveValue('Find product marketing job posts in the US that fit the ICP. Score each for fit and name the poster. Leave out agencies.')
    await userEvent.click(within(card).getByRole('button', { name: 'Version history' }))
    const history = within(card).getByRole('list', { name: 'Version history' })
    expect(within(history).getAllByRole('listitem')).toHaveLength(3)
    expect(within(history).getAllByRole('listitem')[0]).toHaveTextContent('v3No agenciesActive')
  })
})

describe('Settings, Send rules', () => {
  it('T-SET-1 the stop switch reads Sending is off when turned off, and asks about held messages when turned on', async () => {
    mock()
    setSampleHeld(3)
    open('/settings/send-rules')
    const sw = await screen.findByRole('switch', { name: 'Sending is on' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(sw)
    expect(await screen.findByRole('switch', { name: 'Sending is off' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('3 messages are held until sending is on.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: 'Sending is off' }))
    expect(await screen.findByText('3 messages were held while sending was off.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Return them to drafts' }))
    await waitFor(() => expect(screen.queryByText(/held while sending was off/)).not.toBeInTheDocument())
  })

  it('T-SET-2 the card for a spec message greys Automatic and One click and says they are not available', async () => {
    mock()
    open('/settings/send-rules?card=type:spec')
    const card = await screen.findByRole('dialog', { name: 'Spec message' })
    const group = within(card).getByRole('group', { name: 'Level' })
    expect(within(group).getByRole('button', { name: 'Automatic' })).toBeDisabled()
    expect(within(group).getByRole('button', { name: 'One click' })).toBeDisabled()
    expect(within(group).getByRole('button', { name: 'Draft only' })).toHaveAttribute('aria-current', 'true')
    expect(within(card).getByText('Automatic and One click are not available for this type.')).toBeInTheDocument()
    expect(rows()).toHaveLength(23)
    const connect = Array.from(rows()).find((r) => r.textContent?.includes('LinkedIn connection note'))!
    expect(connect).toHaveTextContent('Paused')
  })

  it('a level within the ceiling changes with one click and shows in the row', async () => {
    mock()
    const update = vi.spyOn(data, 'updateSendPolicy').mockImplementation(sampleSource.updateSendPolicy)
    open('/settings/send-rules?card=type:interview_confirmation')
    const card = await screen.findByRole('dialog', { name: 'Interview confirmation' })
    await userEvent.click(within(within(card).getByRole('group', { name: 'Level' })).getByRole('button', { name: 'Automatic' }))
    expect(update).toHaveBeenCalledWith('interview_confirmation', { level: 'automatic' })
    await waitFor(() => expect(within(within(card).getByRole('group', { name: 'Level' })).getByRole('button', { name: 'Automatic' })).toHaveAttribute('aria-current', 'true'))
    const row = Array.from(rows()).find((r) => r.textContent?.includes('Interview confirmation'))!
    expect(row.closest('li')).toHaveTextContent('Automatic')
  })
})

describe('Settings, Targets', () => {
  it('T-SET-4 a target changed on a Wednesday keeps this week on the old target and the row says From Monday', async () => {
    mock()
    const set = vi.spyOn(data, 'setTarget').mockImplementation(sampleSource.setTarget)
    open('/settings/targets')
    const list = await screen.findByRole('list', { name: 'Targets' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(7)
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Job posts chased a week20')
    await userEvent.click(within(list).getByRole('button', { name: 'Change Job posts chased' }))
    const form = within(list).getByRole('form', { name: 'Target for Job posts chased' })
    await userEvent.clear(within(form).getByLabelText('Target'))
    await userEvent.type(within(form).getByLabelText('Target'), '25')
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }))
    expect(set).toHaveBeenCalledWith('posts_chased', 'week', 25)
    await waitFor(() => expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('From Monday 16 November: 25'))
    // Today's figure stays the old one.
    expect(within(list).getByRole('button', { name: 'Change Job posts chased' })).toHaveTextContent('20')
  })
})
