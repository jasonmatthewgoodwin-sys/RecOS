import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { AuthProvider } from '../../lib/auth'
import { data } from '../../lib/data'
import { resetSampleMembers, resetSampleProfile, resetSampleSettings, sampleSource } from '../../lib/sample'
import { countsWords } from './Data'

// P1-46: Settings, Profile and Data (32.4). T-SET-5 (32.5).

const owner = { firstName: 'Jason', role: 'owner' as const }

function mock() {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 3, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  for (const m of ['appSettings', 'updateAppSettings', 'sharedBlocks', 'updateSharedBlock', 'doNotContact', 'addDoNotContact', 'auditLog', 'personFind', 'personExport', 'personDelete', 'exportEverything'] as const) {
    vi.spyOn(data, m).mockImplementation(sampleSource[m] as never)
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
  resetSampleProfile()
  resetSampleSettings()
  resetSampleMembers()
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete document.documentElement.dataset.theme
})

describe('Settings, Profile', () => {
  it('shows the settings, switches the theme on the root, saves a field when it is left, and keeps the four Home numbers distinct', async () => {
    mock()
    const update = vi.spyOn(data, 'updateAppSettings').mockImplementation(sampleSource.updateAppSettings)
    open('/settings/profile')
    const theme = await screen.findByRole('group', { name: 'Theme' })
    expect(within(theme).getByRole('button', { name: 'Paper' })).toHaveAttribute('aria-current', 'true')
    await userEvent.click(within(theme).getByRole('button', { name: 'Night' }))
    expect(update).toHaveBeenCalledWith({ theme: 'night' })
    expect(document.documentElement.dataset.theme).toBe('night')

    const premier = screen.getByLabelText('Premier')
    expect(premier).toHaveValue('18')
    await userEvent.clear(premier)
    await userEvent.type(premier, '21')
    await userEvent.tab()
    await waitFor(() => expect(update).toHaveBeenCalledWith({ leagueDays: { premier: 21, championship: 30, leagueOne: 49 } }))

    const second = screen.getByLabelText('Number 2')
    expect(second).toHaveValue('follow_ups')
    await userEvent.selectOptions(second, 'needs_you')
    expect(update).toHaveBeenLastCalledWith({ homeStats: ['follow_ups', 'needs_you', 'calls_today', 'this_week'] })

    expect(screen.getByLabelText('Voice rules')).toHaveValue('Short words. No exclamation marks. Say the thing once.')
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
    expect(screen.getByRole('main').querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
  })
})

describe('Settings, Data', () => {
  it('T-SET-5 find a person shows where they appear; delete asks for DELETE, then shows the counts and logs it', async () => {
    mock()
    const remove = vi.spyOn(data, 'personDelete').mockImplementation(sampleSource.personDelete)
    open('/settings/data')
    const find = await screen.findByRole('region', { name: 'Find a person' })
    await userEvent.type(within(find).getByLabelText('Name or email'), 'ben')
    await userEvent.click(within(find).getByRole('button', { name: 'Find' }))
    const found = await within(find).findByRole('list', { name: 'People found' })
    expect(within(found).getAllByRole('listitem')).toHaveLength(1)
    expect(within(found).getByText('Ben Sample')).toBeInTheDocument()
    expect(within(found).getByText(/Appears in 1 list place, 3 touches./)).toBeInTheDocument()

    await userEvent.click(within(found).getByRole('button', { name: 'Delete' }))
    const form = within(found).getByRole('form', { name: 'Delete Ben Sample' })
    await userEvent.click(within(form).getByRole('button', { name: 'Delete for good' }))
    expect(remove).toHaveBeenCalledWith('p-ben', '')
    expect(within(found).getByRole('form', { name: 'Delete Ben Sample' })).toBeInTheDocument()

    await userEvent.type(within(form).getByLabelText('Type DELETE'), 'DELETE')
    await userEvent.click(within(form).getByRole('button', { name: 'Delete for good' }))
    expect(remove).toHaveBeenLastCalledWith('p-ben', 'DELETE')
    expect(await within(find).findByText('Removed Ben Sample: 1 list place, 3 touches, 1 person row. The CRM record was not touched.')).toBeInTheDocument()
    expect(within(find).queryByRole('list', { name: 'People found' })).not.toBeInTheDocument()

    const audit = screen.getByRole('region', { name: 'Audit log' })
    await waitFor(() => expect(within(audit).getAllByRole('listitem')[0]).toHaveTextContent('person delete'))
  })

  it('the do-not-contact list adds an entry; the retention table and integrations are read only', async () => {
    mock()
    const add = vi.spyOn(data, 'addDoNotContact').mockImplementation(sampleSource.addDoNotContact)
    open('/settings/data')
    const list = await screen.findByRole('region', { name: 'Do-not-contact list' })
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2))
    await userEvent.click(within(list).getByRole('button', { name: 'Add' }))
    const form = within(list).getByRole('form', { name: 'Add to the list' })
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(within(form).getByText('A name or a company.')).toBeInTheDocument()
    await userEvent.type(within(form).getByLabelText('Name'), 'Kit Invented')
    await userEvent.type(within(form).getByLabelText('Why'), 'Asked by email')
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(add).toHaveBeenCalledWith({ name: 'Kit Invented', company: '', scope: 'person', reason: 'Asked by email' })
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3))
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Kit Invented')

    expect(screen.getByRole('table', { name: 'Retention periods' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Integrations' })).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Open Connections' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export everything' })).toHaveAttribute('data-kind', 'primary')
  })

  it('counts read in words', () => {
    expect(countsWords({ touches: 2, league_members: 1, people: 1, crm: 'x' })).toBe('1 list place, 2 touches, 1 person row')
    expect(countsWords({})).toBe('nothing else')
  })
})
