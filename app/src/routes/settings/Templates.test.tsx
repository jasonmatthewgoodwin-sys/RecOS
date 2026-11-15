import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data } from '../../lib/data'
import { resetSampleSettings, resetSampleTemplates, sampleSource } from '../../lib/sample'

// 0034 send engine: Settings, Templates (12.5, 20.4, 32.4) and the send log
// behind Send rules. TPL-1: editing an approved template makes a new,
// unapproved version.

const owner = { firstName: 'Jason', role: 'owner' as const }

function mock() {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 3, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  for (const m of ['sendPolicies', 'updateSendPolicy', 'sendingPaused', 'setSendingPaused', 'heldMessages', 'releaseHeld', 'templates', 'addTemplate', 'saveTemplate', 'approveTemplate', 'seedTemplates', 'sendLog', 'sendTest'] as const) {
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
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
  resetSampleSettings()
  resetSampleTemplates()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Settings, Templates', () => {
  it('lists the five starters, Needs approval on the unapproved ones, and Approve clears the word', async () => {
    mock()
    open('/settings/templates')
    await waitFor(() => expect(rows()).toHaveLength(5))
    const needs = Array.from(rows()).filter((r) => r.textContent?.includes('Needs approval'))
    expect(needs).toHaveLength(4)
    const thanks = Array.from(rows()).find((r) => r.textContent?.includes('Thank-you after a call'))!
    expect(thanks).not.toHaveTextContent('Needs approval')
    expect(thanks.querySelector('[data-dot]')).toHaveAttribute('data-dot', 'solid')

    await userEvent.click(Array.from(rows()).find((r) => r.textContent?.includes('CV request'))!)
    const card = await screen.findByRole('dialog')
    expect(card).toHaveTextContent('needs approval')
    expect(within(card).getByText('Preview with sample values')).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Approve' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Approved')
    await waitFor(() => expect(Array.from(rows()).filter((r) => r.textContent?.includes('Needs approval'))).toHaveLength(3))
  })

  it('TPL-1: saving an edit to an approved template makes version 2, unapproved, and keeps version 1 under Earlier versions', async () => {
    mock()
    const save = vi.spyOn(data, 'saveTemplate')
    open('/settings/templates?card=template:t-thanks')
    const card = await screen.findByRole('dialog')
    expect(card).toHaveTextContent('Approved')
    const body = within(card).getByLabelText('Body')
    await userEvent.type(body, ' Best, {{{{my_first_name}}')
    await userEvent.click(within(card).getByRole('button', { name: 'Save as a new version' }))
    expect(save).toHaveBeenCalledWith('t-thanks', expect.objectContaining({ body: expect.stringMatching(/\{\{my_first_name\}\}$/) }))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved as version 2. It needs approval before anything sends by itself.')
    await waitFor(() => expect(rows()).toHaveLength(6))
    expect(screen.getByText('Earlier versions')).toBeInTheDocument()
    const inUse = Array.from(rows()).filter((r) => r.textContent?.includes('Thank-you after a call') && !r.textContent?.includes('version 1'))
    expect(inUse).toHaveLength(1)
    expect(inUse[0]).toHaveTextContent('Needs approval')
  })

  it('an unknown variable blocks saving with a plain error', async () => {
    mock()
    open('/settings/templates?card=template:t-cv')
    const card = await screen.findByRole('dialog')
    await userEvent.type(within(card).getByLabelText('Body'), ' {{{{surname}}')
    expect(within(card).getByText('Unknown variable surname')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('Send a test to yourself queues one email to the owner and says so', async () => {
    mock()
    const test = vi.spyOn(data, 'sendTest')
    open('/settings/send-rules?card=type:thanks_after_call')
    const card = await screen.findByRole('dialog')
    await userEvent.click(within(card).getByRole('button', { name: 'Send a test to yourself' }))
    await waitFor(() => expect(test).toHaveBeenCalledWith('thanks_after_call'))
    expect(await screen.findByRole('status')).toHaveTextContent('Queued to you. The sender picks it up on its next run.')
  })

  it('Send rules opens the send log, one line per decision', async () => {
    mock()
    open('/settings/send-rules')
    await userEvent.click(await screen.findByRole('button', { name: 'Send log' }))
    const card = await screen.findByRole('dialog', { name: 'The last 30 decisions' })
    const lines = within(card).getAllByRole('listitem')
    expect(lines).toHaveLength(5)
    expect(card).toHaveTextContent('Finn Fictional')
    expect(card).toHaveTextContent('Template needs approval')
  })
})
