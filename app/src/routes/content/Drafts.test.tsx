import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { draftText, draftsDeck, draftsGallery, insightLine, splitDraft } from '../../lib/content'
import { data, type ContentItem } from '../../lib/data'
import { freshSampleContent } from '../../lib/sample'

// P1-44, reshaped on 14 November 2026: Drafts as a gallery in three groups
// with a window per tile, and the deck one link away (31.2, T-CONT-1 to 3).

const session = { firstName: 'Jason', role: 'owner' as const }

function mock(items: ContentItem[] = freshSampleContent()) {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 6, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  vi.spyOn(data, 'contentItems').mockResolvedValue(items)
  return { update: vi.spyOn(data, 'updateContent').mockResolvedValue() }
}

function open(path = '/content/drafts') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SignedIn session={session} />
    </MemoryRouter>,
  )
}

const counter = () => screen.getByTestId('deck-counter').textContent
const deck = () => screen.getByRole('region', { name: 'Deck' })
const title = () => within(deck()).getByRole('heading', { level: 2 }).textContent
const primary = () => deck().querySelector('[data-kind="primary"]') as HTMLButtonElement
const tiles = () => Array.from(document.querySelectorAll('[data-row]')).map((el) => el.textContent ?? '')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Drafts gallery', () => {
  it('opens as tiles in three groups, New by rank, then Approved, then Scheduled, with Needs tidying on a tile', async () => {
    mock()
    open()
    await waitFor(() => expect(tiles()).toHaveLength(5))
    expect(tiles()[0]).toMatch(/^Four in ten PMM job posts/)
    expect(tiles()[1]).toMatch(/^Most PMM hires stall/)
    expect(tiles()[2]).toMatch(/^Your portfolio should show/)
    expect(tiles()[2]).toContain('Needs tidying')
    expect(tiles()[3]).toMatch(/^Three questions a CMO should ask before hiring a PMM\.Calls/)
    expect(tiles()[4]).toMatch(/^Three questions a CMO should ask before hiring a PMM\.Calls, On 2026-11-12/)
    expect(screen.getByText('3 new, 1 approved, 1 scheduled')).toBeInTheDocument()
    const sections = Array.from(document.querySelectorAll('main h3, main [data-section]')).map((el) => el.textContent)
    expect(sections.join(' ')).toMatch(/New/)
  })

  it('a tile opens a window with the whole post and the quiet lines; Approve moves it to Approved', async () => {
    const { update } = mock()
    open()
    await waitFor(() => expect(tiles()).toHaveLength(5))
    await userEvent.click(screen.getByRole('button', { name: /^Four in ten PMM job posts/ }))
    const card = await screen.findByRole('dialog', { name: /^Four in ten PMM job posts/ })
    expect(within(card).getByText('News, new')).toBeInTheDocument()
    expect(within(card).getByRole('group', { name: 'For you only' }).textContent).toContain('41% of PMM roles now ask for AI tooling')
    expect((within(card).getByLabelText('Post') as HTMLTextAreaElement).value).toMatch(/^The brief says senior/)
    await userEvent.click(within(card).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('c1', { status: 'approved' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('2 new, 2 approved, 1 scheduled')).toBeInTheDocument()
  })

  it('an approved tile schedules onto a day, and a scheduled one points at the calendar', async () => {
    const { update } = mock()
    open()
    await waitFor(() => expect(tiles()).toHaveLength(5))
    await userEvent.click(screen.getAllByRole('button', { name: /^Three questions a CMO/ })[0])
    const card = await screen.findByRole('dialog', { name: /^Three questions a CMO/ })
    expect(within(card).getByText('Calls, approved')).toBeInTheDocument()
    await userEvent.type(within(card).getByLabelText('Day'), '2026-11-18')
    await userEvent.click(within(card).getByRole('button', { name: 'Schedule' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('c4', { status: 'planned', plannedFor: '2026-11-18' }))
    await waitFor(() => expect(screen.getByText('3 new, 0 approved, 2 scheduled')).toBeInTheDocument())
    await userEvent.click(screen.getAllByRole('button', { name: /^Three questions a CMO/ })[1])
    const planned = await screen.findByRole('dialog', { name: /^Three questions a CMO/ })
    expect(within(planned).getByText('Planned for 2026-11-18')).toBeInTheDocument()
    await userEvent.click(within(planned).getByRole('button', { name: 'Open on the calendar' }))
    expect(await screen.findByRole('dialog', { name: 'Wednesday 18 November' })).toBeInTheDocument()
  })

  it('Bin asks why first', async () => {
    const { update } = mock()
    open()
    await waitFor(() => expect(tiles()).toHaveLength(5))
    await userEvent.click(screen.getByRole('button', { name: /^Most PMM hires stall/ }))
    const card = await screen.findByRole('dialog', { name: /^Most PMM hires stall/ })
    await userEvent.click(within(card).getByRole('button', { name: 'Bin' }))
    expect(update).not.toHaveBeenCalled()
    await userEvent.selectOptions(within(card).getByLabelText('Why'), 'Not my voice')
    await userEvent.click(within(card).getByRole('button', { name: 'Bin it' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('c2', { status: 'binned', heldReason: 'Not my voice' }))
  })
})

describe('Drafts deck', () => {
  it('is one link away: highest ranked first, the source word, one button, Approve', async () => {
    const { update } = mock()
    open('/content/drafts?view=deck')
    await waitFor(() => expect(counter()).toBe('01 of 03'))
    expect(title()).toMatch(/^Four in ten PMM job posts/)
    expect(within(deck()).getByText('News')).toBeInTheDocument()
    expect(primary().textContent).toBe('Approve')
    await userEvent.click(primary())
    await waitFor(() => expect(update).toHaveBeenCalledWith('c1', { status: 'approved' }))
    expect(counter()).toBe('02 of 03')
  })

  it('a draft that failed the format check says Needs tidying and why, in one line', async () => {
    mock(freshSampleContent().filter((c) => !c.formatOk))
    open('/content/drafts?view=deck')
    await waitFor(() => expect(counter()).toBe('01 of 01'))
    expect(screen.getByTestId('needs-tidying').textContent).toBe('Needs tidying. body 32 words, under 40.')
  })
})

describe('content helpers', () => {
  it('orders the deck by rank then newest, and groups the gallery new, approved, scheduled, without events', () => {
    const items = freshSampleContent()
    expect(draftsDeck(items).map((c) => c.id)).toEqual(['c1', 'c2', 'c3'])
    expect(draftsGallery(items).map((g) => `${g.group}:${g.item.id}`)).toEqual(['new:c1', 'new:c2', 'new:c3', 'approved:c4', 'scheduled:c7'])
  })

  it('splits the edited text back into a body and a close', () => {
    const c = freshSampleContent()[0]
    expect(splitDraft(draftText(c))).toEqual({ body: c.body, closeLine: c.closeLine })
    expect(splitDraft('Only a body')).toEqual({ body: 'Only a body', closeLine: null })
  })

  it('says one line only with 8 posts that have numbers and a clear difference', () => {
    const base = freshSampleContent()[0]
    const posted = (i: number, withData: boolean, messages: number): ContentItem => ({ ...base, id: `p${i}`, status: 'posted', dataPoint: withData ? 'x' : null, inboundMessages: messages })
    const rows = [...Array.from({ length: 4 }, (_, i) => posted(i, true, 4)), ...Array.from({ length: 4 }, (_, i) => posted(10 + i, false, 2))]
    expect(insightLine(rows)).toBe('Your posts with a data point drew twice the messages.')
    expect(insightLine(rows.slice(0, 7))).toBeNull()
  })
})
