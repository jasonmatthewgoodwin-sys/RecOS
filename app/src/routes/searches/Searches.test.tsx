import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data, research, searchIntake } from '../../lib/data'
import { createSampleSearchResearch, type SearchResearch } from '../../lib/searchResearch'
import { invalidate } from '../../lib/query'
import { freshSampleSearches, resetSampleContent, resetSampleLeads, resetSampleMembers, resetSampleSearches, sampleSource } from '../../lib/sample'
import { healthOf, numberLine } from '../../lib/searches'
import { sections, settings } from '../../lib/sections'

// Searches (30, 31.1), A-star (31.1), Testimonials (31.2) and Campaigns
// (28.7 under Content), built 15 November 2026 so that no tab says it is
// coming in a later phase.

// The file readers for a job description are stood in for (0060).
vi.mock('mammoth', () => ({ default: { extractRawText: vi.fn(async () => ({ value: 'Head of Product Marketing\n\nOwn the launch calendar and the messaging house for two product lines.' })) } }))
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument: vi.fn() }))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf.worker.js' }))

const session = { firstName: 'Jason', role: 'owner' as const }

// The research jobs, the role type and the job description go to a stand-in, never a project.
let stand: SearchResearch
function mockResearch() {
  stand = createSampleSearchResearch({
    addSearch: async () => 's-new',
    saveNote: (searchId, tab, content, structured) => sampleSource.saveSearchNote(searchId, tab, content, structured),
    pool: async () => (await sampleSource.members()).map((m) => ({ personId: m.personId, name: m.name, title: m.title, company: m.company })),
    onSearch: async (id) => (await sampleSource.searchCandidates()).filter((c) => c.searchId === id).map((c) => c.personId),
    delayMs: 200,
  })
  for (const k of ['startSearch', 'requestSearchJob', 'searchJobs', 'searchIntake', 'saveRoleType', 'saveJd'] as const) {
    vi.spyOn(research, k).mockImplementation(((...args: unknown[]) => (stand[k] as (...a: unknown[]) => unknown)(...args)) as never)
  }
}

function mock() {
  mockResearch()
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 3, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  for (const k of ['searches', 'searchCandidates', 'searchNotes', 'calls', 'aStarSuggestions', 'warmSpecs', 'campaigns', 'contentItems', 'members', 'agents', 'kpiThisWeek', 'jobLeads', 'spokenTo', 'specRequests'] as const) {
    vi.spyOn(data, k).mockImplementation((...args: unknown[]) => (sampleSource[k] as (...a: unknown[]) => Promise<unknown>)(...args) as never)
  }
  return {
    search: vi.spyOn(data, 'updateSearch').mockImplementation((id, patch) => sampleSource.updateSearch(id, patch)),
    add: vi.spyOn(data, 'addSearch').mockImplementation((input) => sampleSource.addSearch(input)),
    cand: vi.spyOn(data, 'updateCandidate').mockImplementation((id, patch) => sampleSource.updateCandidate(id, patch)),
    addCand: vi.spyOn(data, 'addCandidate').mockImplementation((searchId, personId) => sampleSource.addCandidate(searchId, personId)),
    note: vi.spyOn(data, 'saveSearchNote').mockImplementation((a, b, c, d) => sampleSource.saveSearchNote(a, b, c, d)),
    call: vi.spyOn(data, 'updateCall').mockImplementation((id, patch) => sampleSource.updateCall(id, patch)),
    verdict: vi.spyOn(data, 'aStarVerdict').mockImplementation((id, v) => sampleSource.aStarVerdict(id, v)),
    warm: vi.spyOn(data, 'setWarmSpec').mockImplementation((id, on) => sampleSource.setWarmSpec(id, on)),
    spec: vi.spyOn(data, 'requestSpec').mockImplementation((id, ask) => sampleSource.requestSpec(id, ask)),
    run: vi.spyOn(data, 'requestRun').mockResolvedValue(),
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

  it('opens the workspace with Pre-brief, Brief, Pipeline and Calls; the brief is read, not typed, and says what is still to find out', async () => {
    const m = mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/open')
    await user.click(await screen.findByText('Head of Product Marketing'))
    const dialog = await screen.findByRole('dialog')
    const nav = within(dialog).getByRole('navigation', { name: 'Workspace' })
    for (const t of ['Pre-brief', 'Brief', 'Pipeline', 'Calls', 'Offer', 'Close']) expect(within(nav).getByRole('button', { name: t })).toBeInTheDocument()
    expect(within(dialog).getByText(/3 in play/)).toBeInTheDocument()
    expect(within(dialog).getByText(/From Spott/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Brief' }))
    expect(await within(dialog).findByText('The last head moved to a VP role in-house')).toBeInTheDocument()
    expect(within(dialog).queryByRole('textbox')).toBeNull()
    expect(within(dialog).getByTestId('still-to-find')).toHaveTextContent(/Still to find out: .*nice to have, .*timeline/)
    expect(within(dialog).getByRole('button', { name: 'Refresh from Spott and calls' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Calls' }))
    expect(within(dialog).getAllByRole('link', { name: 'Open the call notes' }).length).toBeGreaterThan(0)
    expect(within(dialog).getByText(/ran pricing for the platform line/)).toBeInTheDocument()
    // Every other Granola call sits under the search's own, and one can be moved here.
    expect(within(dialog).getByText(/Other calls, \d/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Show' }))
    const others = within(dialog).getByRole('list', { name: 'Other calls' })
    expect(within(others).getByText('Someone New')).toBeInTheDocument()
    await user.click(within(others).getAllByRole('button', { name: 'This search' })[0])
    await waitFor(() => expect(m.call).toHaveBeenCalledWith(expect.any(String), { searchId: 's-northwind', matchConfidence: 'confirmed' }))
  })

  it('long text in the workspace reads as dot points', async () => {
    mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/open')
    await user.click(await screen.findByText('Head of Product Marketing'))
    const dialog = await screen.findByRole('dialog')
    const stands = within(dialog).getByRole('list', { name: 'Where it stands' })
    expect(stands.children.length).toBeGreaterThan(0)
    // The card is nearly the width of the screen, so there is less to scroll.
    expect(dialog.className).toMatch(/calc\(100vw/)
  })

  it('moves a candidate a stage and refuses a submission without consent', async () => {
    const m = mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/open?card=search:s-contoso&tab=pipeline')
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('button', { name: /Finn Fictional/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Shortlist' }))
    await waitFor(() => expect(m.cand).toHaveBeenCalledWith('sc-5', { stage: 'shortlist' }))
    expect(await screen.findByText('Agreed to be put forward must be on first.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('switch', { name: 'Agreed to be put forward' }))
    await user.click(within(dialog).getByRole('button', { name: 'Shortlist' }))
    await waitFor(() => expect(m.cand).toHaveBeenLastCalledWith('sc-5', { stage: 'shortlist' }))
    expect((await sampleSource.searchCandidates()).find((c) => c.id === 'sc-5')?.stage).toBe('shortlist')
  })

  it('the pipeline is a board: ten columns left to right, cards with days in stage and late feedback, Rejected and Withdrew behind a link', async () => {
    mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await sampleSource.updateCandidate('sc-3', { stage: 'withdrew', outcomeReason: 'Took another role' })
    open('/searches/open?card=search:s-northwind&tab=pipeline')
    const dialog = await screen.findByRole('dialog')
    const board = await within(dialog).findByRole('list', { name: 'Pipeline board' })
    const columns = within(board).getAllByRole('heading', { level: 4 }).map((h) => h.firstChild?.textContent)
    expect(columns).toEqual(['Application', 'Sourced', 'Longlist', 'Shortlist', 'Interview 1', 'Interview 2', 'Interview 3', 'Interview 4', 'Offer', 'Placed'])
    // The board scrolls sideways in its own pane.
    expect(board.parentElement?.className).toMatch(/overflow-x-auto/)
    const offer = within(board).getByRole('listitem', { name: 'Offer' })
    expect(within(offer).getByText('Ada Example')).toBeInTheDocument()
    expect(within(offer).getByText('Senior PMM, Northwind Sample Co')).toBeInTheDocument()
    expect(within(offer).getByText('2d')).toBeInTheDocument()
    expect(within(board).queryByText('Eve Invented')).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Rejected and withdrew, 1' }))
    expect(within(within(dialog).getByRole('list', { name: 'Rejected and withdrew' })).getByText('Eve Invented')).toBeInTheDocument()
    // What good looks like starts from the brief.
    const panel = within(dialog).getByRole('region', { name: 'Recommended candidates' })
    await user.click(within(panel).getByRole('button', { name: 'Find candidates' }))
    expect(within(panel).getByLabelText('Must-haves')).toHaveValue('B2B SaaS, launches at scale, has managed two or more')
  })

  it('a card moves by drag and drop or by its Move to menu, and the stage is saved; feedback late shows on the card', async () => {
    const m = mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/open?card=search:s-contoso&tab=pipeline')
    const dialog = await screen.findByRole('dialog')
    const board = await within(dialog).findByRole('list', { name: 'Pipeline board' })
    // Ben has waited on feedback for a week: the solid dot and the word.
    const ben = board.querySelector('[data-candidate-card="sc-4"]') as HTMLElement
    expect(within(ben).getByText(/Feedback \dd/)).toHaveAttribute('data-overdue')
    // The keyboard way: Move to.
    await user.selectOptions(within(board).getByLabelText('Move Ben Sample to'), 'Interview 1')
    await waitFor(() => expect(m.cand).toHaveBeenCalledWith('sc-4', { stage: 'interview_1' }))
    expect(within(within(board).getByRole('listitem', { name: 'Interview 1' })).getByText('Ben Sample')).toBeInTheDocument()
    // Dragging Finn to Interview 2.
    const finn = board.querySelector('[data-candidate-card="sc-5"]') as HTMLElement
    const target = within(board).getByRole('listitem', { name: 'Interview 2' })
    fireEvent.dragStart(finn)
    fireEvent.dragOver(target)
    fireEvent.drop(target)
    await waitFor(() => expect(m.cand).toHaveBeenCalledWith('sc-5', { stage: 'interview_2' }))
    expect((await sampleSource.searchCandidates()).find((c) => c.id === 'sc-5')?.stage).toBe('interview_2')
  })

  it('a card dropped on the shortlist without agreement opens the candidate instead of saving', async () => {
    const m = mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/open?card=search:s-globex&tab=pipeline')
    const dialog = await screen.findByRole('dialog')
    const board = await within(dialog).findByRole('list', { name: 'Pipeline board' })
    await user.selectOptions(within(board).getByLabelText('Move Cara Placeholder to'), 'Shortlist')
    expect(await screen.findByText('Turn on Agreed to be put forward for Cara Placeholder first.')).toBeInTheDocument()
    expect(within(dialog).getByRole('switch', { name: 'Agreed to be put forward' })).toBeInTheDocument()
    expect(m.cand).not.toHaveBeenCalled()
  })

  it('Pre-brief: the role type takes a choice or his own words, saves, and is not reset', async () => {
    mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/open?card=search:s-contoso&tab=prebrief')
    const dialog = await screen.findByRole('dialog')
    const field = (await within(dialog).findByLabelText('Role type')) as HTMLInputElement
    await user.click(field)
    await user.type(field, 'Head of Product Marketing, EMEA and US')
    await user.tab()
    await waitFor(async () => expect((await searchIntake('s-contoso')).roleType).toBe('Head of Product Marketing, EMEA and US'))
    // Clicking it again keeps what was saved.
    await user.click(field)
    expect(field.value).toBe('Head of Product Marketing, EMEA and US')
    act(() => invalidate('searches.intake.s-contoso'))
    await waitFor(() => expect((within(dialog).getByLabelText('Role type') as HTMLInputElement).value).toBe('Head of Product Marketing, EMEA and US'))
    // One of the choices by its words is saved as its code, and its questions follow.
    await user.clear(field)
    await user.type(field, 'Technical PMM{Enter}')
    await waitFor(async () => expect((await searchIntake('s-contoso')).roleType).toBe('technical_pmm'))
    expect(await within(dialog).findByText('For a technical PMM')).toBeInTheDocument()
  })

  it('Pre-brief: a job description is pasted or read from a Word file, with the word count, Replace and Clear', async () => {
    mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/open?card=search:s-fabrikam&tab=prebrief')
    const dialog = await screen.findByRole('dialog')
    const box = await within(dialog).findByLabelText('Job description')
    await user.type(box, 'Own launches for two product lines.')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByTestId('jd-words')).toHaveTextContent('On file, 6 words')
    expect((await searchIntake('s-fabrikam')).jdText).toBe('Own launches for two product lines.')
    // Replace it from a file: only the text is kept.
    const doc = new File(['zip'], 'Head of PMM.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    await user.upload(within(dialog).getByLabelText('Job description file'), doc)
    await waitFor(() => expect(within(dialog).getByTestId('jd-words')).toHaveTextContent('On file, 16 words, read from Head of PMM.docx'))
    expect((await searchIntake('s-fabrikam')).jdText).toMatch(/^Head of Product Marketing\n\nOwn the launch calendar/)
    await user.click(within(dialog).getByRole('button', { name: 'Clear' }))
    await waitFor(async () => expect((await searchIntake('s-fabrikam')).jdText).toBeNull())
    expect(await within(dialog).findByLabelText('Job description')).toBeInTheDocument()
  })

  it('Recommended candidates: Find candidates asks the agent with his answers, and each one can be added or hidden', async () => {
    mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/open?card=search:s-contoso&tab=pipeline')
    const dialog = await screen.findByRole('dialog')
    const panel = await within(dialog).findByRole('region', { name: 'Recommended candidates' })
    // With people on the board the form waits behind a link, so the board stays in view.
    expect(within(panel).queryByRole('form')).toBeNull()
    await user.click(within(panel).getByRole('button', { name: 'Find candidates' }))
    const form = within(panel).getByRole('form', { name: 'What does a good candidate look like?' })
    for (const label of ['Must-haves', 'Nice-to-haves', 'Target companies or backgrounds', 'Deal-breakers', 'Level and location']) expect(within(form).getByLabelText(label)).toBeInTheDocument()
    await user.type(within(form).getByLabelText('Must-haves'), 'Launches at a B2B SaaS company')
    await user.click(within(form).getByRole('button', { name: 'Find candidates' }))
    expect(await within(panel).findByText('Working: the research agent answers within a few hours')).toBeInTheDocument()
    // The stand-in answers a moment later; the screen looks again every half a minute.
    await waitFor(async () => expect((await sampleSource.searchNotes('s-contoso')).some((n) => n.tab === 'match')).toBe(true), { timeout: 3000 })
    await waitFor(async () => expect((await stand.searchJobs('s-contoso'))[0].status).toBe('ready'))
    act(() => {
      invalidate('searches.jobs.s-contoso')
      invalidate('searches.notes.s-contoso')
    })
    const list = await within(panel).findByRole('list', { name: 'Recommended' })
    expect(within(list).getByText('Cara Placeholder')).toBeInTheDocument()
    expect(within(list).getByText('Strong fit')).toBeInTheDocument()
    expect(within(list).getAllByText(/^Gap: /).length).toBe(4)
    // Nobody already on the search is recommended.
    expect(within(list).queryByText('Ben Sample')).toBeNull()
    const cara = list.querySelector('[data-match="p-cara"]') as HTMLElement
    await user.click(within(cara).getByRole('button', { name: 'Add to pipeline' }))
    const board = within(dialog).getByRole('list', { name: 'Pipeline board' })
    expect(await within(within(board).getByRole('listitem', { name: 'Sourced' })).findByText('Cara Placeholder')).toBeInTheDocument()
    expect(await within(cara).findByText('On the board')).toBeInTheDocument()
    const kit = list.querySelector('[data-match="p-kit"]') as HTMLElement
    await user.click(within(kit).getByRole('button', { name: 'Not for this one' }))
    await waitFor(() => expect(within(list).queryByText('Kit Sample')).toBeNull())
    const note = (await sampleSource.searchNotes('s-contoso')).find((n) => n.tab === 'match')
    expect((note?.structured as { dismissed?: string[] }).dismissed).toEqual(['p-kit'])
  })

  it('interview prep on the pipeline writes a draft with the booking link, or the email alone', async () => {
    mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/open?card=search:s-contoso&tab=pipeline')
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('button', { name: 'Interview prep' }))
    const panel = within(dialog).getByRole('region', { name: 'Interview prep' })
    await user.type(within(panel).getByLabelText('Candidate'), 'Finn Fictional')
    const draft = within(panel).getByLabelText('Draft') as HTMLTextAreaElement
    expect(draft.value).toContain('Hi Finn,')
    expect(draft.value).toContain('calendly.com/jason3search/interview-prep-feedback')
    await user.click(within(panel).getByRole('button', { name: 'Prep email' }))
    expect((within(panel).getByLabelText('Draft') as HTMLTextAreaElement).value).not.toContain('calendly.com')
    expect(within(panel).getByRole('button', { name: 'Open in Outlook' })).toBeInTheDocument()
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

  it('Spec lists everyone spoken to from the calls, with Good candidate, the calls and the matches on the card, and Find matches asks the agent', async () => {
    const m = mock()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    open('/searches/warm-specs')
    expect(await screen.findByText('Finn Fictional')).toBeInTheDocument()
    expect(screen.getByText('Ada Example')).toBeInTheDocument()
    await user.click(screen.getByText('Ada Example'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('switch', { name: 'Good candidate' })).toBeChecked()
    expect(within(dialog).getByText('Your calls')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('link', { name: 'Open the call notes' }).length).toBeGreaterThan(0)
    expect(within(dialog).getByText('Matches')).toBeInTheDocument()
    expect(within(dialog).getByText(/Northwind Sample Co, Senior PMM/)).toBeInTheDocument()
    expect(within(dialog).getByText('launch planning')).toBeInTheDocument()
    expect(within(dialog).queryByText(/@/)).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Find matches again' }))
    await waitFor(() => expect(m.spec).toHaveBeenCalledWith('p-ada', expect.objectContaining({ cvWhere: 'spott' })))
    await user.click(within(dialog).getByRole('switch', { name: 'Good candidate' }))
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
