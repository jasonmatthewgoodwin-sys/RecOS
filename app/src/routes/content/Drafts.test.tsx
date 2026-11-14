import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { draftText, draftsDeck, insightLine, splitDraft } from '../../lib/content'
import { data, type ContentItem } from '../../lib/data'
import { freshSampleContent } from '../../lib/sample'

// P1-44, the Drafts deck (31.2, T-CONT-1 to T-CONT-3): highest ranked first,
// the source word, NEEDS TIDYING with its reason, Approve, and the list.

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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Drafts deck', () => {
  it('opens on the highest ranked draft with its source word, three quiet lines and one button, Approve', async () => {
    const { update } = mock()
    open()
    await waitFor(() => expect(counter()).toBe('01 of 03'))
    expect(title()).toMatch(/^Four in ten PMM job posts/)
    expect(within(deck()).getByText('News')).toBeInTheDocument()
    const forYou = within(deck()).getByRole('group', { name: 'For you only' }).textContent
    expect(forYou).toContain('On the talent market')
    expect(forYou).toContain('41% of PMM roles now ask for AI tooling')
    expect(primary().textContent).toBe('Approve')
    expect(screen.queryByTestId('needs-tidying')).not.toBeInTheDocument()
    await userEvent.click(primary())
    await waitFor(() => expect(update).toHaveBeenCalledWith('c1', { status: 'approved' }))
    expect(counter()).toBe('02 of 03')
    expect(title()).toMatch(/^Most PMM hires stall/)
  })

  it('a draft that failed the format check says Needs tidying and why, in one line', async () => {
    mock(freshSampleContent().filter((c) => !c.formatOk))
    open()
    await waitFor(() => expect(counter()).toBe('01 of 01'))
    expect(screen.getByTestId('needs-tidying').textContent).toBe('Needs tidying. body 32 words, under 40.')
    expect(within(deck()).getByText('PMM')).toBeInTheDocument()
  })

  it('the list is one link away and shows every unreviewed draft', async () => {
    mock()
    open()
    await waitFor(() => expect(counter()).toBe('01 of 03'))
    await userEvent.click(screen.getByRole('button', { name: 'List' }))
    await waitFor(() => expect(document.querySelectorAll('[data-row]')).toHaveLength(3))
    expect(screen.getByRole('button', { name: /^Your portfolio should show/ }).textContent).toContain('Needs tidying')
  })

  it('shows nothing to review when the deck is empty and no insight line under 8 posts with numbers', async () => {
    mock(freshSampleContent().filter((c) => c.status !== 'draft'))
    open()
    expect(await screen.findByText('Nothing to review')).toBeInTheDocument()
    expect(screen.queryByText(/drew/)).not.toBeInTheDocument()
  })
})

describe('content helpers', () => {
  it('orders the deck by rank then newest, and leaves out ideas, testimonials and what is not a draft', () => {
    const ids = draftsDeck(freshSampleContent()).map((c) => c.id)
    expect(ids).toEqual(['c1', 'c2', 'c3'])
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
    expect(insightLine(rows.map((r) => ({ ...r, inboundMessages: 3 })))).toBeNull()
  })
})
