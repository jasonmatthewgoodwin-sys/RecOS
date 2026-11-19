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
  vi.spyOn(data, 'touches').mockResolvedValue([{ id: 't1', touchedOn: '2026-11-07', channel: 'phone', kind: 'call', note: 'Talked about the Boston role', sourceUrl: null }])
  return {
    reply: vi.spyOn(data, 'logReply').mockResolvedValue(),
    tier: vi.spyOn(data, 'moveTier').mockResolvedValue(),
    remove: vi.spyOn(data, 'removeFromList').mockResolvedValue(),
    dnc: vi.spyOn(data, 'setDoNotContact').mockResolvedValue(),
    notes: vi.spyOn(data, 'saveNotes').mockResolvedValue(),
    add: vi.spyOn(data, 'addPerson').mockResolvedValue(),
    profile: vi.spyOn(data, 'saveProfileSummary').mockResolvedValue(),
    pull: vi.spyOn(data, 'askProfilePull').mockResolvedValue(),
    link: vi.spyOn(data, 'saveLinkedIn').mockImplementation(async (_id, url) => ({ linkedinUrl: url || null, queued: Boolean(url) })),
    known: vi.spyOn(data, 'saveHowKnown').mockResolvedValue(),
    detail: vi.spyOn(data, 'saveDetail').mockResolvedValue(),
    rhythm: vi.spyOn(data, 'setRhythm').mockResolvedValue(),
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
const everyone = freshSampleMembers().map((m) => m.name)
const names = () => [...rows()].map((r) => everyone.find((n) => r.textContent?.includes(n)))

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
    // By contact rhythm (19 November 2026): Due is due this week or overdue; on cadence is on track.
    await waitFor(() => expect(values()).toEqual(['03', '5/50']))
    expect(screen.getByRole('main').querySelectorAll('[data-hero-stat]')).toHaveLength(2)
    expect(screen.getByRole('img', { name: '2 of 20' })).toBeInTheDocument()
    // Signals first, then overdue, then due this week.
    expect(names()).toEqual(['Gia Imaginary', 'Ben Sample', 'Cara Placeholder', 'Nia Pretend', 'Lee Example'])
    expect(screen.getByText('PROMOTED')).toBeInTheDocument()
    expect(screen.getAllByText('Overdue')).toHaveLength(2)
    expect([...rows()].filter((r) => within(r as HTMLElement).queryByText('Due'))).toHaveLength(1)
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

  it('T-PEO-2 Logged a reply on an overdue member: dot turns hollow, last contact is today, Due falls by one', async () => {
    const { reply } = mock()
    open('/people')
    await waitFor(() => expect(values()[0]).toBe('03'))
    const cara = screen.getByRole('button', { name: /^Cara Placeholder/ })
    expect(cara.querySelector('[data-dot]')).toHaveAttribute('data-dot', 'solid')
    await userEvent.click(within(cara.closest('li')!).getByRole('button', { name: 'Logged a reply' }))
    expect(reply).toHaveBeenCalledWith('p-cara')
    await waitFor(() => expect(values()[0]).toBe('02'))
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    const after = screen.getByRole('button', { name: /^Cara Placeholder/ })
    expect(after.querySelector('[data-dot]')).toHaveAttribute('data-dot', 'hollow')
    expect(after.closest('li')).toHaveTextContent('Last contact: 11 Nov, LinkedIn message')
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

  it('every person has a way to LinkedIn, and the profile summary can be written or pulled in by the signals agent (14 November 2026)', async () => {
    const { profile, pull } = mock()
    open('/people/senior-network?card=person:p-ben')
    const card = await screen.findByRole('dialog', { name: 'Ben Sample' })
    // Ben has no link held, so the way in is a search by name and company.
    expect(within(card).getByRole('link', { name: 'Find on LinkedIn' })).toHaveAttribute('href', expect.stringContaining('linkedin.com/search/results/people/?keywords=Ben%20Sample'))
    const field = within(card).getByLabelText('In a few lines')
    expect(field).toHaveValue('')
    await userEvent.type(field, 'Director of PMM, Boston.')
    await userEvent.click(within(card).getByRole('button', { name: 'Save profile' }))
    expect(profile).toHaveBeenCalledWith('p-ben', 'Director of PMM, Boston.')
    await userEvent.click(within(card).getByRole('button', { name: 'Pull in from LinkedIn' }))
    expect(pull).toHaveBeenCalledWith('p-ben')
    expect(within(card).getByText('Asked the signals agent. It fills this in on its next run.')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Pull in from LinkedIn' })).not.toBeInTheDocument()
  })

  it('a held LinkedIn link opens as it is, and a pulled-in summary says when', async () => {
    mock()
    open('/people/top-candidates?card=person:p-ada')
    const ada = await screen.findByRole('dialog', { name: 'Ada Example' })
    expect(within(ada).getByRole('link', { name: 'LinkedIn profile' })).toHaveAttribute('href', 'https://example.com/in/ada')
    expect((within(ada).getByLabelText('In a few lines') as HTMLTextAreaElement).value).toContain('Senior PMM at Northwind Sample Co')
    expect(within(ada).getByText(/^Pulled in 2026-11-/)).toBeInTheDocument()
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
    await waitFor(() => expect(values()[0]).toBe('03'))
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

  // ---- 19 November 2026: LinkedIn profile, how you know them, last contact, contact rhythm.

  it('a row shows where they work and live, where the details came from, and the last contact and how', async () => {
    mock()
    open('/people/senior-network?show=all')
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    const cara = screen.getByRole('button', { name: /^Cara Placeholder/ }).closest('li')!
    expect(cara).toHaveTextContent('Head of Marketing, Fabrikam Test Ltd, Austin, United States')
    expect(cara).toHaveTextContent('From LinkedIn, read 3 Nov')
    expect(cara).toHaveTextContent('Last contact: 27 Sep, meeting')
    expect(cara).toHaveTextContent('Overdue')
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    const eve = screen.getByRole('button', { name: /^Eve Invented/ }).closest('li')!
    expect(eve).toHaveTextContent('Waiting for the LinkedIn reader')
    expect(eve).toHaveTextContent('Last contact: 28 Sep, LinkedIn message')
    const nia = screen.getByRole('button', { name: /^Nia Pretend/ }).closest('li')!
    expect(nia).toHaveTextContent('Last contact: 28 Aug, LinkedIn request')
  })

  it('Due or overdue lists only those, overdue first; All puts overdue first within a tier; a list with no rhythm has no such filter', async () => {
    mock()
    open('/people/senior-network')
    await userEvent.click(await screen.findByRole('button', { name: 'Due or overdue' }))
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(names()).toEqual(['Cara Placeholder', 'Nia Pretend', 'Lee Example'])
    // The Due number opens the same filter.
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    await userEvent.click(screen.getAllByTestId('hero-value')[0].closest('button')!)
    await waitFor(() => expect(rows()).toHaveLength(3))
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    // Championship: Cara (overdue) before Lee (due) before Max (on track).
    const order = names()
    expect(order.indexOf('Cara Placeholder')).toBeLessThan(order.indexOf('Lee Example'))
    expect(order.indexOf('Lee Example')).toBeLessThan(order.indexOf('Max Madeup'))
    await userEvent.click(screen.getByRole('link', { name: 'Top candidates' }))
    await waitFor(() => expect(values()).toEqual(['04', '3/50']))
    expect(screen.queryByRole('button', { name: 'Due or overdue' })).not.toBeInTheDocument()
  })

  it('the card takes a LinkedIn profile link, checks its shape and says it is waiting for the reader', async () => {
    const { link } = mock()
    open('/people/senior-network?card=person:p-ben')
    const card = await screen.findByRole('dialog', { name: 'Ben Sample' })
    const field = within(card).getByLabelText('LinkedIn profile link')
    await userEvent.type(field, 'https://example.com/in/ben')
    await userEvent.click(within(card).getByRole('button', { name: 'Save link' }))
    expect(within(card).getByText('Paste a LinkedIn profile link, with linkedin.com/in/ in it')).toBeInTheDocument()
    expect(link).not.toHaveBeenCalled()
    await userEvent.clear(field)
    await userEvent.type(field, 'uk.linkedin.com/in/ben-sample/?trk=x')
    await userEvent.click(within(card).getByRole('button', { name: 'Save link' }))
    expect(link).toHaveBeenCalledWith('p-ben', 'https://www.linkedin.com/in/ben-sample')
    expect(await within(card).findByText('Waiting for the LinkedIn reader')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'LinkedIn profile' })).toHaveAttribute('href', 'https://www.linkedin.com/in/ben-sample')
  })

  it('the card shows how you know them under the name, saves it, keeps hand edits and changes the rhythm', async () => {
    const { known, detail, rhythm } = mock()
    open('/people/senior-network?card=person:p-cara')
    const card = await screen.findByRole('dialog', { name: 'Cara Placeholder' })
    expect(card.querySelector('[data-how-known]')).toHaveTextContent('Placed two PMMs in her team in 2024.')
    expect(within(card).getByText('From LinkedIn, read 3 Nov')).toBeInTheDocument()
    expect(within(card).getByText(/^Typed by you: title\./)).toBeInTheDocument()
    expect(card.querySelector('[data-last-contact]')).toHaveTextContent('Last contact: 27 Sep, meeting. Overdue since 27 Oct')

    const how = within(card).getByLabelText('How you know them')
    await userEvent.clear(how)
    await userEvent.click(how)
    await userEvent.paste('x'.repeat(501))
    expect(within(card).getByText('Keep it to 500 characters. This is 501.')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Save how you know them' })).not.toBeInTheDocument()
    await userEvent.clear(how)
    await userEvent.type(how, 'Former client, now a friend of the desk')
    await userEvent.click(within(card).getByRole('button', { name: 'Save how you know them' }))
    expect(known).toHaveBeenCalledWith('p-cara', 'Former client, now a friend of the desk')

    const city = within(card).getByLabelText('City')
    await userEvent.clear(city)
    await userEvent.type(city, 'Denver')
    await userEvent.tab()
    expect(detail).toHaveBeenCalledWith('p-cara', 'city', 'Denver')
    await waitFor(() => expect(within(card).getByText(/^Typed by you: title, city\./)).toBeInTheDocument())

    const pills = within(card).getByRole('group', { name: 'Contact rhythm' })
    expect(within(pills).getByRole('button', { name: 'Every 30 days' })).toHaveAttribute('aria-current', 'true')
    await userEvent.click(within(pills).getByRole('button', { name: 'Every 90 days' }))
    expect(rhythm).toHaveBeenCalledWith('m-cara', 90)
    await userEvent.click(within(pills).getByRole('button', { name: 'None' }))
    expect(rhythm).toHaveBeenCalledWith('m-cara', null)
    expect(card.textContent).not.toMatch(/@|\+44|\d{3}[ -]\d{3}/)
  })
})
