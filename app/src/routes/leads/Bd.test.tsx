import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { data } from '../../lib/data'
import { freshSampleCoaching, freshSampleReferrals, freshSampleWiderLeads } from '../../lib/sample'

// P1-34: Coaching (28.3, T-LEAD-5), Referrals (28.4) and Wider business
// (28.8, T-LEAD-4) on the invented sample rows.

const session = { firstName: 'Jason', role: 'owner' as const }

function mock() {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 3, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  vi.spyOn(data, 'coachingSessions').mockResolvedValue(freshSampleCoaching())
  vi.spyOn(data, 'referrals').mockResolvedValue(freshSampleReferrals())
  vi.spyOn(data, 'widerLeads').mockResolvedValue(freshSampleWiderLeads())
  return {
    followUp: vi.spyOn(data, 'markCoachingFollowedUp').mockResolvedValue(),
    referral: vi.spyOn(data, 'setReferralStage').mockResolvedValue(),
    pass: vi.spyOn(data, 'passWiderLead').mockResolvedValue(),
    status: vi.spyOn(data, 'setWiderLeadStatus').mockResolvedValue(),
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Coaching, under People', () => {
  it('shows this week against five with a meter, what is booked, and the sessions newest first', async () => {
    mock()
    open('/people/coaching')
    expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Coaching' })).toHaveAttribute('aria-current', 'page')
    await waitFor(() => expect(values()).toEqual(['1/5', '02']))
    expect(screen.getByRole('img', { name: '1 of 5' })).toBeInTheDocument()
    expect(rows()).toHaveLength(4)
    expect(rows()[0]).toHaveTextContent('Nia Pretend')
    expect(rows()[0].closest('li')).toHaveTextContent('Thu 12:00')
    // Held and not followed up: a solid dot. Followed up: hollow.
    const eve = screen.getByRole('button', { name: /^Eve Invented/ })
    expect(eve.querySelector('[data-dot]')).toHaveAttribute('data-dot', 'solid')
    expect(screen.getByRole('button', { name: /^Oli Fictional/ }).querySelector('[data-dot]')).toHaveAttribute('data-dot', 'hollow')
    expect(screen.getByRole('main').querySelectorAll('[data-kind="primary"]')).toHaveLength(0)
  })

  it('T-LEAD-5 the card for a held session shows two answers and two marked Not asked, and Follow up marks it', async () => {
    const { followUp } = mock()
    open('/people/coaching')
    await waitFor(() => expect(rows()).toHaveLength(4))
    await userEvent.click(screen.getByRole('button', { name: /^Eve Invented/ }))
    const card = await screen.findByRole('dialog', { name: 'Eve Invented' })
    expect(within(card).getByText('Two Series B companies in the Bay Area')).toBeInTheDocument()
    expect(within(card).getAllByText('Not asked')).toHaveLength(2)
    expect(within(card).getByText('Lead with the launch story, not the title')).toBeInTheDocument()
    expect(card.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    await userEvent.click(within(card).getByRole('button', { name: 'Follow up' }))
    await waitFor(() => expect(followUp).toHaveBeenCalledWith('co-eve'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^Eve Invented/ }).querySelector('[data-dot]')).toHaveAttribute('data-dot', 'hollow')
  })
})

describe('Referrals', () => {
  it('counts the ones to contact, lists oldest first with the referrer, and Contacted moves the row', async () => {
    const { referral } = mock()
    open('/leads/referrals')
    await waitFor(() => expect(values()).toEqual(['02']))
    expect(rows()[0]).toHaveTextContent('Hal Hypothetical')
    expect(rows()[0]).toHaveTextContent('From Eve Invented')
    expect(rows()[0].closest('li')).toHaveTextContent('3d')
    expect(screen.getByRole('main').querySelector('[data-divider]')).toHaveTextContent('In touch')
    const hal = rows()[0].closest('li')!
    await userEvent.click(within(hal).getByRole('button', { name: 'Contacted' }))
    expect(referral).toHaveBeenCalledWith('rf-hal', 'contacted')
    await waitFor(() => expect(values()).toEqual(['01']))
    expect(screen.getByRole('button', { name: /^Hal Hypothetical/ }).querySelector('[data-dot]')).toHaveAttribute('data-dot', 'hollow')
  })

  it('the card has the context, an opening message naming the referrer, one primary and Not relevant', async () => {
    const { referral } = mock()
    open('/leads/referrals')
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    await userEvent.click(screen.getByRole('button', { name: /^Pat Example/ }))
    const card = await screen.findByRole('dialog', { name: 'Pat Example' })
    expect(within(card).getByText('Hiring two PMMs in the new year.')).toBeInTheDocument()
    expect((within(card).getByRole('textbox', { name: 'Opening message' }) as HTMLTextAreaElement).value).toContain('Dev Madeup suggested we speak')
    expect(card.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
    await userEvent.click(within(card).getByRole('button', { name: 'Not relevant' }))
    await waitFor(() => expect(referral).toHaveBeenCalledWith('rf-pat', 'not_relevant'))
  })
})

describe('Wider business', () => {
  it('shows what is to pass on and what was passed this quarter, spotted first', async () => {
    mock()
    open('/leads/wider')
    await waitFor(() => expect(values()).toEqual(['02', '01']))
    expect(rows()).toHaveLength(3)
    expect(rows()[0]).toHaveTextContent('Account Executive')
    expect(rows()[0]).toHaveTextContent('Fabrikam Test Ltd, US')
    expect(rows()[1]).toHaveTextContent('Hiring in customer success')
    expect(rows()[1]).toHaveTextContent('Existing client')
    expect(rows()[2].closest('li')).toHaveTextContent('Passed to Sam Colleague')
    expect(rows()[2].querySelector('[data-dot]')).toHaveAttribute('data-dot', 'hollow')
  })

  it('T-LEAD-4 passing with no split is refused in place with the reason; with both it passes and closes', async () => {
    const { pass } = mock()
    open('/leads/wider')
    await waitFor(() => expect(rows()).toHaveLength(3))
    await userEvent.click(screen.getByRole('button', { name: /^Account Executive/ }))
    const card = await screen.findByRole('dialog', { name: 'Account Executive' })
    await userEvent.type(within(card).getByLabelText('Pass to'), 'Sam Colleague')
    await userEvent.click(within(card).getByRole('button', { name: 'Pass on' }))
    expect(within(card).getByText('Agree the split first')).toBeInTheDocument()
    expect(pass).not.toHaveBeenCalled()
    expect((within(card).getByRole('textbox', { name: 'Introduction' }) as HTMLTextAreaElement).value).toContain('Hi Sam, Fabrikam Test Ltd is looking for an Account Executive')
    await userEvent.type(within(card).getByLabelText('Split'), 'Half each')
    await userEvent.click(within(card).getByRole('button', { name: 'Pass on' }))
    await waitFor(() => expect(pass).toHaveBeenCalledWith('wider-fabrikam', 'Sam Colleague', 'Half each'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(values()).toEqual(['01', '02']))
  })

  it('the status pills move a lead on, and Passed needs the two fields', async () => {
    const { status, pass } = mock()
    open('/leads/wider')
    await waitFor(() => expect(rows()).toHaveLength(3))
    await userEvent.click(screen.getByRole('button', { name: /^Hiring in customer success/ }))
    const card = await screen.findByRole('dialog')
    const pills = within(card).getByRole('group', { name: 'Status' })
    expect(within(pills).getByRole('button', { name: 'Spotted' })).toHaveAttribute('aria-current', 'true')
    await userEvent.click(within(pills).getByRole('button', { name: 'Passed' }))
    expect(within(card).getByText("Add the colleague's name")).toBeInTheDocument()
    expect(pass).not.toHaveBeenCalled()
    await userEvent.click(within(pills).getByRole('button', { name: 'Not pursued' }))
    await waitFor(() => expect(status).toHaveBeenCalledWith('wider-initech', 'not_pursued'))
  })
})
