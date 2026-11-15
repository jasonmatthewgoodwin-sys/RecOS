import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data, type Connection } from '../../lib/data'
import { resetSampleSettings, sampleSource } from '../../lib/sample'
import { Connections } from './Connections'

// Settings, Connections (24.9, 15 November 2026): statuses in words and
// colour, Connect Outlook goes to the start route, a key posts and clears.

const owner = { firstName: 'Sam', role: 'owner' as const }

function mockShell() {
  vi.spyOn(data, 'needsYou').mockResolvedValue(0)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 0, late: 0, lateFromDay: null } as never)
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 0, total: 4 })
}

const at = '2026-11-14T09:30:00Z'
const statuses: Connection[] = [
  { provider: 'outlook', status: 'needs_sign_in', accountLabel: 'Owner Sample (owner@example.test)', connectedAt: at, lastOkAt: at, lastError: 'Microsoft asked for a fresh sign-in.' },
  { provider: 'granola', status: 'connected', accountLabel: 'Granola', connectedAt: at, lastOkAt: at, lastError: null },
]

function page(path = '/settings/connections', go?: (url: string) => void) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Connections go={go} />
    </MemoryRouter>,
  )
}

const row = (name: string) => screen.getByRole('listitem', { name })

beforeEach(() => {
  resetSampleSettings()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Settings, Connections', () => {
  it('is an index tab of Settings and opens from the route', async () => {
    mockShell()
    vi.spyOn(data, 'connections').mockResolvedValue([])
    render(
      <MemoryRouter initialEntries={['/settings/connections']}>
        <SignedIn session={owner} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('list', { name: 'Connections' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Connections' }).length).toBeGreaterThan(0)
  })

  it('shows each app with its status in words, the colour by state, the account and when it was last OK', async () => {
    vi.spyOn(data, 'connections').mockResolvedValue(statuses)
    page()
    await screen.findByRole('list', { name: 'Connections' })
    const outlook = row('Outlook')
    expect(outlook).toHaveTextContent('Needs sign-in')
    expect(outlook).toHaveTextContent('Owner Sample (owner@example.test)')
    expect(outlook).toHaveTextContent('Last OK Sat 09:30')
    expect(outlook).toHaveTextContent('Microsoft asked for a fresh sign-in.')
    expect(outlook.querySelector('.orb-action')).not.toBeNull()
    expect(within(outlook).getByRole('button', { name: 'Sign in again' })).toBeInTheDocument()

    const granola = row('Granola')
    expect(granola).toHaveTextContent('Connected')
    expect(granola.querySelector('.orb-clear')).not.toBeNull()
    expect(within(granola).queryByLabelText('Paste your API key')).toBeNull()
    expect(within(granola).getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()

    const spott = row('Spott')
    expect(spott).toHaveTextContent('Not connected')
    expect(spott.querySelector('.orb-new')).not.toBeNull()
    expect(within(spott).getByLabelText('Paste your API key')).toHaveAttribute('type', 'password')
    expect(spott).toHaveTextContent('In Spott: Settings, API. Only an admin can make one.')
  })

  it('Connect Outlook goes to the start route with a one-time state', async () => {
    vi.spyOn(data, 'connections').mockResolvedValue([])
    const url = 'https://project.example.test/functions/v1/outlook/start?state=abc123'
    const start = vi.spyOn(data, 'outlookStartUrl').mockResolvedValue(url)
    const go = vi.fn()
    page('/settings/connections', go)
    await screen.findByRole('list', { name: 'Connections' })
    const connect = within(row('Outlook')).getByRole('button', { name: 'Connect Outlook' })
    expect(connect).toHaveAttribute('data-kind', 'primary')
    await userEvent.click(connect)
    expect(start).toHaveBeenCalledOnce()
    expect(go).toHaveBeenCalledWith(url)
  })

  it('a key posts to the server, the field clears and the status refreshes; the key is never shown back', async () => {
    const save = vi.spyOn(data, 'saveConnectionKey').mockImplementation(sampleSource.saveConnectionKey)
    vi.spyOn(data, 'connections').mockImplementation(sampleSource.connections)
    vi.spyOn(data, 'disconnect').mockImplementation(sampleSource.disconnect)
    page()
    await screen.findByRole('list', { name: 'Connections' })
    const granola = row('Granola')
    await userEvent.click(within(granola).getByRole('button', { name: 'Disconnect' }))
    await waitFor(() => expect(row('Granola')).toHaveTextContent('Not connected'))
    expect(screen.getByRole('status')).toHaveTextContent('Granola is disconnected.')

    const field = within(row('Granola')).getByLabelText('Paste your API key')
    await userEvent.type(field, 'grn_invented_key_0001')
    await userEvent.click(within(row('Granola')).getByRole('button', { name: 'Save' }))
    expect(save).toHaveBeenCalledWith('granola', 'grn_invented_key_0001')
    await waitFor(() => expect(row('Granola')).toHaveTextContent('Connected'))
    expect(screen.getByRole('status')).toHaveTextContent('Granola is connected.')
    expect(document.body).not.toHaveTextContent('grn_invented_key_0001')
  })

  it('a refused key clears the field and says why in the row', async () => {
    vi.spyOn(data, 'connections').mockResolvedValue([])
    vi.spyOn(data, 'saveConnectionKey').mockRejectedValue(new Error('Spott did not accept that key.'))
    page()
    await screen.findByRole('list', { name: 'Connections' })
    const field = within(row('Spott')).getByLabelText('Paste your API key')
    await userEvent.type(field, 'spott_invented_key_0001')
    await userEvent.click(within(row('Spott')).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(row('Spott')).toHaveTextContent('Spott did not accept that key.'))
    expect(field).toHaveValue('')
  })

  it('says quietly how the Outlook sign-in came back', async () => {
    vi.spyOn(data, 'connections').mockResolvedValue([])
    const { unmount } = page('/settings/connections?outlook=connected')
    expect(await screen.findByRole('status')).toHaveTextContent('Outlook is connected.')
    unmount()
    page('/settings/connections?outlook=error&reason=declined')
    expect(await screen.findByRole('status')).toHaveTextContent('Outlook did not connect: permission was not given. Try again.')
  })

  it('works in sample mode: Connect Outlook comes straight back connected', async () => {
    vi.spyOn(data, 'connections').mockImplementation(sampleSource.connections)
    vi.spyOn(data, 'outlookStartUrl').mockImplementation(sampleSource.outlookStartUrl)
    page()
    await screen.findByRole('list', { name: 'Connections' })
    expect(row('Spott')).toHaveTextContent('Failing')
    await userEvent.click(within(row('Outlook')).getByRole('button', { name: 'Connect Outlook' }))
    await waitFor(() => expect(row('Outlook')).toHaveTextContent('Connected'))
    expect(screen.getByRole('status')).toHaveTextContent('Outlook is connected.')
  })
})
