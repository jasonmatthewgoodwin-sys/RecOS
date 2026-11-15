import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data } from '../../lib/data'
import { freshSampleSearches, resetSampleContent, resetSampleLeads, resetSampleMembers, resetSampleSearches, sampleSource } from '../../lib/sample'
import { healthOf, numberLine } from '../../lib/searches'
import { sections, settings } from '../../lib/sections'

// Searches (30, 31.1), A-star (31.1), Testimonials (31.2) and Campaigns
// (28.7 under Content), built 15 November 2026 so that no tab says it is
// coming in a later phase.

const session = { firstName: 'Jason', role: 'owner' as const }

function mock() {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 3, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  for (const k of ['searches', 'searchCandidates', 'searchNotes', 'calls', 'aStarSuggestions', 'warmSpecs', 'campaigns', 'contentItems', 'members', 'agents', 'kpiThisWeek', 'jobLeads'] as const) {
    vi.spyOn(data, k).mockImplementation((...args: unknown[]) => (sampleSource[k] as (...a: unknown[]) => Promise<unknown>)(...args) as never)
  }
  return {
    search: vi.spyOn(data, 'updateSearch').mockImplementation((id, patch) => sampleSource.updateSearch(id, patch)),
    add: vi.spyOn(data, 'addSearch').mockImplementation((input) => sampleSource.addSearch(input)),
    cand: vi.spyOn(data, 'updateCandidate').mockImplementation((id, patch) => sampleSource.updateCandidate(id, patch)),
    note: vi.spyOn(data, 'saveSearchNote').mockImplementation((a, b, c, d) => sampleSource.saveSearchNote(a, b, c, d)),
    call: vi.spyOn(data, 'updateCall').mockImplementation((id, patch) => sampleSource.updateCall(id, patch)),
    verdict: vi.spyOn(data, 'aStarVerdict').mockImplementation((id, v) => sampleSource.aStarVerdict(id, v)),
    warm: vi.spyOn(data, 'setWarmSpec').mockImplementation((id, on) => sampleSource.setWarmSpec(id, on)),
    content: vi.spyOn(data, 'updateContent').mockImplementation((id, patch) => sampleSource.updateContent(id, patch)),
    campaign: vi.spyOn(data, 'updateCampaign').mockImplementation((id, patch) => sampleSource.updateCampaign(id, patch)),
    addCampaign: vi.spyOn(data, 'addCampaign').mockImplementation((input) => sampleSource.addCampaign(input)),
  }
}

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SignedIn session={session} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
  resetSampleSearches()
  resetSampleMembers()
  resetSampleLeads()
  resetSampleContent()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Every tab is built', () => {
  it('no index page says it is not built yet', async () => {
    mock()
    const pages = [...sections, settings].filter((s) => s.key !== 'home' && s.key !== 'events').flatMap((s) => s.pages.map((p) => `${s.path}/${p.slug}`)).filter((p) => p !== '/settings/profile')
    expect(pages.length).toBeGreaterThan(25)
    for (const path of pages) {
      const view = open(path)
      await waitFor(() => expect(view.container.querySelector('h1')).not.toBeNull())
      expect(view.container.textContent).not.toMatch(/Not built yet/)
      view.unmount()
    }
  }, 120000)
})

describe('Searches, Open', () => {
  it('groups live searches by priority with two numbers and the line of numbers on each', async () => {
    mock()
    open('/searches/open')
    await screen.findByRole('heading', { name: 'Searches' })
    expect(await screen.findByText('Head of Product Marketing')).toBeInTheDocument()
    expect(screen.getByText('Focus')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getAllByText('Cold').length).toBeGreaterThan(0)
    expect(screen.queryByText('Head of Product Marketing, Fabrikam')).not.toBeInTheDocument()
    expect(screen.getByText(/1 dormant/)).toBeInTheDocument()
    const northwind = freshSampleSearches()[0]
    expect(numberLine(northwind)).toBe('10 . 6 . 4 . 1')
  })

  it('opens the workspace with its own tabs and the brief says what is still to ask', async () => {
    mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/open')
    await user.click(await screen.findByText('Head of Product Marketing'))
    const dialog = await screen.findByRole('dialog')
    const nav = within(dialog).getByRole('navigation', { name: 'Workspace' })
    for (const t of ['Brief', 'Pipeline', 'Calls', 'Offer', 'Close']) expect(within(nav).getByRole('button', { name: t })).toBeInTheDocument()
    expect(within(dialog).getByText(/3 in play/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Brief' }))
    expect(await within(dialog).findByTestId('still-to-ask')).toHaveTextContent(/Still to ask: .*nice to have, .*timeline/)
  })

  it('moves a candidate a stage and refuses a submission without consent', async () => {
    const m = mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/open?card=search:s-contoso&tab=pipeline')
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByText('Finn Fictional'))
    await user.click(within(dialog).getByRole('button', { name: 'Submitted' }))
    await waitFor(() => expect(m.cand).toHaveBeenCalledWith('sc-5', { stage: 'submitted' }))
    expect(await screen.findByText('Agreed to be put forward must be on first.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('switch', { name: 'Agreed to be put forward' }))
    await user.click(within(dialog).getByRole('button', { name: 'Submitted' }))
    await waitFor(() => expect(m.cand).toHaveBeenLastCalledWith('sc-5', { stage: 'submitted' }))
    expect((await sampleSource.searchCandidates()).find((c) => c.id === 'sc-5')?.stage).toBe('submitted')
  })

  it('the offer tab moves a search to placed when the offer is accepted', async () => {
    const m = mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/open?card=search:s-northwind&tab=offer')
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('button', { name: 'Accepted' }))
    await waitFor(() => expect(m.cand).toHaveBeenCalledWith('sc-1', { offerStatus: 'accepted' }))
    const s = (await sampleSource.searches()).find((x) => x.id === 's-northwind')
    expect(s?.status).toBe('placed')
  })

  it('New search starts one and lands in its workspace', async () => {
    const m = mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/open')
    await user.click(await screen.findByRole('button', { name: 'New search' }))
    const form = await screen.findByRole('form', { name: 'New search' })
    await user.type(within(form).getByLabelText('Client'), 'Acme Sample')
    await user.type(within(form).getByLabelText('Role'), 'VP Product Marketing')
    await user.click(within(form).getByRole('button', { name: 'Start the search' }))
    await waitFor(() => expect(m.add).toHaveBeenCalled())
    expect(await screen.findByRole('heading', { name: 'VP Product Marketing' })).toBeInTheDocument()
  })

  it('health is read from the dates', () => {
    const s = freshSampleSearches()
    expect(healthOf(s[0], '2026-11-11').health).toBe('warm')
    expect(healthOf(s[2], '2026-11-11').health).toBe('cold')
  })
})

describe('Searches, This week', () => {
  it('lists the calls to write up first with five ticks and lets one be set aside', async () => {
    const m = mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/this-week')
    await screen.findAllByText('To write up')
    expect(screen.getByText('New A-star')).toBeInTheDocument()
    expect(screen.getByText('3/5')).toBeInTheDocument()
    expect(screen.getByText('Finn Fictional')).toBeInTheDocument()
    await user.click(screen.getByText('Someone New'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Confirm the search')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Internal' }))
    await waitFor(() => expect(m.call).toHaveBeenCalledWith('call-2', { skipReason: 'internal' }))
  })

  it('Request CV marks the call and the write-up checks tick by hand', async () => {
    const m = mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/this-week?card=call:call-1')
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('button', { name: 'Request CV' }))
    await waitFor(() => expect(m.call).toHaveBeenCalledWith('call-1', { cvRequested: true }))
    expect(await within(dialog).findByText('CV requested')).toBeInTheDocument()
  })
})

describe('Searches, the candidate pages', () => {
  it('In process shows interview and offer counts and links back to the search', async () => {
    mock()
    open('/searches/in-process')
    await screen.findByText('At interview')
    expect(screen.getByText('At offer')).toBeInTheDocument()
    expect(await screen.findByText('Ada Example')).toBeInTheDocument()
    expect(screen.getByText('Dev Madeup')).toBeInTheDocument()
  })

  it('Warm specs lists the flagged people with the leads they match, and can take one off', async () => {
    const m = mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/warm-specs')
    await user.click(await screen.findByText('Ada Example'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Open leads they match')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Take off the list' }))
    await waitFor(() => expect(m.warm).toHaveBeenCalledWith('p-ada', false))
  })

  it('Placed lists placements with the aftercare date', async () => {
    mock()
    open('/searches/placed')
    expect(await screen.findByText('Hal Hypothetical')).toBeInTheDocument()
    expect(screen.getByText(/Aftercare 20/)).toBeInTheDocument()
  })
})

describe('People, A-star', () => {
  it('shows suggestions one at a time with Good and Not good only', async () => {
    const m = mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/people/a-star')
    expect(await screen.findByRole('heading', { name: 'Zed Fictional' })).toBeInTheDocument()
    expect(screen.getByText('To review')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Good' }))
    await waitFor(() => expect(m.verdict).toHaveBeenCalledWith('as-1', 'good'))
    expect(await screen.findByRole('heading', { name: 'Yas Imaginary' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Not good' }))
    await waitFor(() => expect(m.verdict).toHaveBeenCalledWith('as-2', 'not_good'))
    expect((await sampleSource.members()).some((x) => x.name === 'Zed Fictional')).toBe(true)
  })
})

describe('Content, Testimonials', () => {
  it('shows this quarter as N/3 and marks a request asked', async () => {
    const m = mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/content/testimonials')
    await screen.findByText('This quarter')
    expect(screen.getByText('1/3')).toBeInTheDocument()
    await user.click(screen.getByText('Testimonial from Northwind Sample Co'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Asked 2026/)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Their words'), 'A clear, honest search.')
    await user.click(within(dialog).getByRole('button', { name: 'Mark received' }))
    await waitFor(() => expect(m.content).toHaveBeenCalledWith('c9', expect.objectContaining({ receivedOn: '2026-11-11' })))
  })
})

describe('Content, Campaigns', () => {
  it('is a tab under Content with replies as N of M and steps on a campaign', async () => {
    const m = mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/content/campaigns')
    await screen.findByText('Replies')
    expect(screen.getByRole('link', { name: 'Campaigns' })).toBeInTheDocument()
    await user.click(await screen.findByText(/Ada to the New York/))
    const dialog = await screen.findByRole('dialog')
    const add = within(dialog).getByRole('form', { name: 'Add a step' })
    await user.type(within(add).getByLabelText('Step'), 'Send the two-line profile')
    await user.click(within(add).getByRole('button', { name: 'Add step' }))
    await waitFor(() => expect(m.campaign).toHaveBeenCalledWith('cp-1', expect.objectContaining({ steps: expect.arrayContaining([expect.objectContaining({ note: 'Send the two-line profile' })]) })))
  })
})
