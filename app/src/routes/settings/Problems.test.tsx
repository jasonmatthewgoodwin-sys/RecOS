import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { AuthProvider } from '../../lib/auth'
import { data } from '../../lib/data'
import { queueOf, shortAgent, snippet } from '../../lib/problems'
import { freshSampleProblems, resetSampleProblems, sampleSource } from '../../lib/sample'

// Problem reports (the bug handover of 14 November 2026, in RecOS terms):
// the flag on every page opens the window, the report captures its context,
// the queue in Settings shows open ones newest first, a window works them.

const owner = { firstName: 'Jason', role: 'owner' as const }

function mock() {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 3, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  vi.spyOn(data, 'problems').mockImplementation(sampleSource.problems)
  vi.spyOn(data, 'problemNotes').mockImplementation(sampleSource.problemNotes)
  return {
    report: vi.spyOn(data, 'reportProblem').mockImplementation((input) => sampleSource.reportProblem(input)),
    update: vi.spyOn(data, 'updateProblem').mockImplementation((id, patch) => sampleSource.updateProblem(id, patch)),
    addNote: vi.spyOn(data, 'addProblemNote').mockImplementation((id, body, author) => sampleSource.addProblemNote(id, body, author)),
  }
}

function open(path: string) {
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
  resetSampleProblems()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Report a problem', () => {
  it('opens from the flag on any page, needs a description, captures the page and browser, and says the reference', async () => {
    const { report } = mock()
    open('/numbers/this-week?x=1')
    await userEvent.click(screen.getByRole('button', { name: 'Report a problem' }))
    const dialog = await screen.findByRole('dialog', { name: 'Something wrong?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }))
    expect(within(dialog).getByText('Say what happened.')).toBeInTheDocument()
    expect(report).not.toHaveBeenCalled()
    await userEvent.type(within(dialog).getByLabelText('What happened'), 'The meter shows five ticks for four targets.')
    await userEvent.selectOptions(within(dialog).getByLabelText('How bad'), 'low')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(report).toHaveBeenCalledTimes(1))
    const input = report.mock.calls[0][0]
    expect(input).toMatchObject({ title: null, description: 'The meter shows five ticks for four targets.', severity: 'low', reporterName: 'Jason', route: '/numbers/this-week?x=1' })
    expect(input.userAgent.length).toBeGreaterThan(0)
    expect(input.viewport).toMatch(/^\d+x\d+$/)
    expect(await screen.findByRole('dialog', { name: 'Raised as BUG-4' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('Settings, Problems', () => {
  it('shows the open reports newest first with their state and how bad, hides closed ones until asked, and sorts worst first', async () => {
    mock()
    open('/settings/problems')
    await waitFor(() => expect(document.querySelectorAll('[data-row]')).toHaveLength(2))
    const rows = () => Array.from(document.querySelectorAll('[data-row]')).map((el) => el.textContent ?? '')
    expect(rows()[0]).toMatch(/^BUG-3/)
    expect(rows()[0]).toContain('New')
    expect(rows()[0]).toContain('High')
    expect(rows()[1]).toMatch(/^BUG-2/)
    expect(screen.getByText('2 open. 1 closed.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show closed' }))
    await waitFor(() => expect(document.querySelectorAll('[data-row]')).toHaveLength(3))
    await userEvent.click(screen.getByRole('button', { name: 'Worst first' }))
    await waitFor(() => expect(rows()[0]).toMatch(/^BUG-3/))
    expect(rows()[2]).toMatch(/^BUG-1/)
  })

  it('a row opens the report with what was captured; the state saves, a note attaches, Resolve stamps and Reopen clears', async () => {
    const { update, addNote } = mock()
    open('/settings/problems')
    await waitFor(() => expect(document.querySelectorAll('[data-row]')).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: /^BUG-2/ }))
    const dialog = await screen.findByRole('dialog', { name: /^BUG-2/ })
    expect(dialog.textContent).toContain('Chrome 142 on Windows')
    expect(dialog.textContent).toContain('/people/signals')
    expect(within(dialog).getByRole('list', { name: 'Notes' }).textContent).toContain('Can reproduce on the laptop')
    await userEvent.type(within(dialog).getByLabelText('Add a note'), 'It is the hover action width')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(addNote).toHaveBeenCalledWith('p2', 'It is the hover action width', 'Jason'))
    await waitFor(() => expect(within(dialog).getByRole('list', { name: 'Notes' }).textContent).toContain('It is the hover action width'))
    await userEvent.type(within(dialog).getByLabelText('Who has it'), 'Mia')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenLastCalledWith('p2', { status: 'in_progress', severity: 'medium', assignee: 'Mia', resolution: null }))
    await userEvent.type(within(dialog).getByLabelText('Resolution'), 'Widened the row')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resolve' }))
    await waitFor(() => expect(update).toHaveBeenLastCalledWith('p2', { status: 'resolved', severity: 'medium', assignee: 'Mia', resolution: 'Widened the row' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Reopen' })).toBeInTheDocument())
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reopen' }))
    await waitFor(() => expect(update).toHaveBeenLastCalledWith('p2', expect.objectContaining({ status: 'new' })))
  })
})

describe('problem helpers', () => {
  it('orders the queue, shortens a browser string and a report', () => {
    const items = freshSampleProblems()
    expect(queueOf(items).map((p) => p.ref)).toEqual([3, 2])
    expect(queueOf(items, { showClosed: true, sort: 'severity' }).map((p) => p.ref)).toEqual([3, 2, 1])
    expect(shortAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')).toBe('Chrome 142 on Windows')
    expect(shortAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1')).toBe('Safari 604 on iOS')
    expect(snippet({ ...items[0], title: null, description: 'x'.repeat(80) })).toHaveLength(70)
  })
})
