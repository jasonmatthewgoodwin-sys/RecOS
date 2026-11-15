import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedIn } from '../../App'
import { agentsFor, lastRanWords } from '../../lib/agents'
import { data } from '../../lib/data'
import { nextOutreach } from '../../lib/outreach'
import { freshSampleAccounts, freshSampleLeads, freshSampleReferrals, freshSampleSignals, resetSampleAccounts, resetSampleLeads, sampleSource } from '../../lib/sample'

// Jason's notes of 14 November 2026: the outreach ladder on a job lead, the
// three call questions and the conversion on a referral, UK to US, the
// group's clients and the owner's accounts, and the agent behind every tab.

const session = { firstName: 'Jason', role: 'owner' as const }

function mock() {
  vi.spyOn(data, 'needsYou').mockResolvedValue(7)
  vi.spyOn(data, 'followUpsDue').mockResolvedValue({ due: 3, late: 3, lateFromDay: 'Monday' })
  vi.spyOn(data, 'callsToday').mockResolvedValue([])
  vi.spyOn(data, 'weekTargets').mockResolvedValue({ hit: 2, total: 4 })
  vi.spyOn(data, 'jobLeads').mockImplementation(sampleSource.jobLeads)
  vi.spyOn(data, 'chasedThisWeek').mockResolvedValue({ total: 7, target: 20 })
  vi.spyOn(data, 'referrals').mockImplementation(sampleSource.referrals)
  vi.spyOn(data, 'signals').mockResolvedValue(freshSampleSignals())
  vi.spyOn(data, 'widerLeads').mockImplementation(sampleSource.widerLeads)
  vi.spyOn(data, 'accounts').mockImplementation(sampleSource.accounts)
  vi.spyOn(data, 'agents').mockImplementation(sampleSource.agents)
  return {
    outreach: vi.spyOn(data, 'setOutreach').mockImplementation((id, patch) => sampleSource.setOutreach(id, patch)),
    update: vi.spyOn(data, 'updateReferral').mockImplementation((id, patch) => sampleSource.updateReferral(id, patch)),
    convert: vi.spyOn(data, 'referralToJobLead').mockImplementation((id) => sampleSource.referralToJobLead(id)),
    account: vi.spyOn(data, 'updateAccount').mockImplementation((id, patch) => sampleSource.updateAccount(id, patch)),
    wider: vi.spyOn(data, 'addWiderLead').mockImplementation((input) => sampleSource.addWiderLead(input)),
    run: vi.spyOn(data, 'requestRun').mockResolvedValue(),
    setup: vi.spyOn(data, 'updateAgentSetup').mockImplementation((code, patch) => sampleSource.updateAgentSetup(code, patch)),
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
  resetSampleLeads()
  resetSampleAccounts()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Business development tabs', () => {
  it('has Jobs, Referrals and leads, UK to US and Wider business; Follow-ups still opens by its route', async () => {
    mock()
    open('/leads/jobs')
    await screen.findByRole('heading', { name: 'Business development' })
    const names = screen.getAllByRole('link').map((l) => l.textContent).filter((t) => ['Jobs', 'Referrals and leads', 'UK to US', 'Wider business', 'Follow-ups', 'Campaigns'].includes(t ?? ''))
    expect(names).toEqual(['Jobs', 'Referrals and leads', 'UK to US', 'Wider business'])
  })
})

describe('The outreach ladder', () => {
  it('shows the strip on a job card, stages the connection note, and marks the next step by hand', async () => {
    const { outreach } = mock()
    const first = freshSampleLeads()[0]
    open(`/leads/jobs?card=job:${first.id}`)
    const card = await screen.findByRole('dialog', { name: first.role })
    expect(within(card).getByRole('list', { name: 'Outreach' })).toBeInTheDocument()
    expect(card.querySelector('[data-outreach]')).toHaveAttribute('data-outreach', 'connection_sent')
    expect(within(card).getByText(/^Connection sent 2026-11-10\. UK to US$/)).toBeInTheDocument()
    await userEvent.type(within(card).getByLabelText('First message, once connected'), 'Thanks for connecting. One question on your PMM hire.')
    await userEvent.click(within(card).getByRole('button', { name: 'Mark connected' }))
    await waitFor(() => expect(outreach).toHaveBeenCalledWith(first.id, { outreachStage: 'connected' }))
    await waitFor(() => expect(card.querySelector('[data-outreach]')).toHaveAttribute('data-outreach', 'connected'))
    await userEvent.click(within(card).getByRole('button', { name: 'Mark messaged' }))
    await waitFor(() => expect(outreach).toHaveBeenLastCalledWith(first.id, expect.objectContaining({ outreachStage: 'messaged' })))
    await waitFor(() => expect(within(card).getByLabelText('How they replied')).toBeInTheDocument())
    await userEvent.selectOptions(within(card).getByLabelText('How they replied'), 'not_interested')
    await userEvent.click(within(card).getByRole('button', { name: 'Mark replied' }))
    await waitFor(() => expect(outreach).toHaveBeenLastCalledWith(first.id, { outreachStage: 'replied', replyOutcome: 'not_interested' }))
    expect(nextOutreach('replied')).toBeNull()
  })
})

describe('Referrals and leads', () => {
  it('asks the three call questions on the card and turns a company lead into a job lead', async () => {
    const { update, convert } = mock()
    const pat = freshSampleReferrals().find((r) => r.id === 'rf-pat')!
    open('/leads/referrals?card=referral:rf-pat')
    const card = await screen.findByRole('dialog', { name: pat.referredName })
    await userEvent.selectOptions(within(card).getByLabelText('Sourced through'), 'direct')
    await waitFor(() => expect(update).toHaveBeenCalledWith('rf-pat', { sourcedVia: 'direct' }))
    await userEvent.type(within(card).getByLabelText('Hiring manager'), 'Pat Example')
    await userEvent.tab()
    await waitFor(() => expect(update).toHaveBeenCalledWith('rf-pat', { hiringManagerName: 'Pat Example' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Make it a job lead' }))
    await waitFor(() => expect(convert).toHaveBeenCalledWith('rf-pat'))
    const lead = await screen.findByRole('dialog', { name: 'Product marketing hire' })
    expect(lead.textContent).toContain('Globex Fiction')
    expect(within(lead).getByText('Not contacted yet')).toBeInTheDocument()
  })
})

describe('UK to US', () => {
  it('gathers the flagged lead and the flagged signal under two numbers', async () => {
    mock()
    open('/leads/uk-us')
    await waitFor(() => expect(screen.getAllByTestId('hero-value').map((e) => e.textContent)).toEqual(['01', '01']))
    const rows = Array.from(document.querySelectorAll('[data-row]')).map((r) => r.textContent ?? '')
    expect(rows.some((r) => r.includes('Wonka Imaginary Ltd'))).toBe(true)
    expect(rows.some((r) => r.includes('Connection sent'))).toBe(true)
  })
})

describe('Accounts', () => {
  it('lists open doors first and introduces a colleague, which raises a wider lead', async () => {
    const { account, wider } = mock()
    open('/leads/wider')
    // Accounts sit under Wider business only (15 November 2026); the first hero number on the group's clients block is open doors.
    const group = await screen.findByRole('region', { name: "The group's clients" })
    await waitFor(() => expect(group.querySelectorAll('[data-row]').length).toBe(2))
    const rows = Array.from(group.querySelectorAll('[data-row]')).map((r) => r.textContent ?? '')
    expect(rows[0]).toMatch(/Contoso Demo Inc|Initech Mock/)
    expect(rows[0]).toContain('Open door')
    await userEvent.click(screen.getByRole('button', { name: /^Contoso Demo Inc/ }))
    const card = await screen.findByRole('dialog', { name: 'Contoso Demo Inc' })
    await userEvent.click(within(card).getByRole('button', { name: 'Introduce' }))
    expect(within(card).getByText('Say who takes it')).toBeInTheDocument()
    await userEvent.type(within(card).getByLabelText('Colleague'), 'Sam Church')
    await userEvent.type(within(card).getByLabelText('Split'), 'Half each')
    await userEvent.click(within(card).getByRole('button', { name: 'Introduce' }))
    await waitFor(() => expect(account).toHaveBeenCalledWith('acc-1', { introducedTo: 'Sam Church' }))
    expect(wider).toHaveBeenCalledWith(expect.objectContaining({ company: 'Contoso Demo Inc', accountId: 'acc-1', existingClient: true, notes: 'Split: Half each' }))
    await waitFor(() => expect(within(group).getByRole('button', { name: /^Contoso Demo Inc/ })).not.toHaveTextContent('Open door'))
  })

  it('the two lists also sit under Wider business', async () => {
    mock()
    open('/leads/wider')
    expect(await screen.findByRole('region', { name: "The group's clients" })).toBeInTheDocument()
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Your accounts' })).getByRole('button', { name: /^Initech Mock/ })).toBeInTheDocument())
    expect(freshSampleAccounts()).toHaveLength(4)
  })
})

describe('The agent behind the page', () => {
  it('opens from the header with when it last ran, what it connects to, its criteria to edit, and Run now', async () => {
    const { run, setup } = mock()
    open('/leads/jobs')
    await screen.findByRole('heading', { name: 'Business development' })
    await userEvent.click(screen.getByRole('button', { name: 'Agent' }))
    const card = await screen.findByRole('dialog', { name: 'Jobs pipeline' })
    expect(within(card).getByText(/^On, Collect Tuesday/)).toBeInTheDocument()
    expect(within(card).getByText(/Last ran .*, 4 new/)).toBeInTheDocument()
    expect(within(card).getByRole('list', { name: 'Jobs pipeline connects to' }).textContent).toContain('The LinkedIn scraper')
    const days = within(card).getByLabelText('Days to look back')
    expect(days).toHaveValue('7')
    await userEvent.clear(days)
    await userEvent.type(days, '10')
    await userEvent.click(within(card).getByRole('button', { name: 'Save criteria' }))
    await waitFor(() => expect(setup).toHaveBeenCalledWith('a3_jobs', { criteria: { lookback_days: 10, icp: 'B2B software, US, product marketing' } }))
    await userEvent.click(within(card).getByRole('button', { name: 'Run now' }))
    await waitFor(() => expect(run).toHaveBeenCalledWith('a3_jobs'))
    expect(within(card).getByText('Asked. It runs at the top of its schedule.')).toBeInTheDocument()
  })

  it('maps pages to agents and says when one last ran in plain words', () => {
    expect(agentsFor('/leads/jobs')).toEqual(['a3_jobs'])
    expect(agentsFor('/leads/uk-us')).toEqual(['a4_signals', 'a3_jobs'])
    expect(agentsFor('/content/drafts')).toEqual(['a2_content'])
    expect(agentsFor('/settings/agents')).toEqual([])
    expect(lastRanWords(null)).toBe('Not run yet')
    expect(lastRanWords({ startedAt: '2026-11-11T07:00:00Z', status: 'ok', itemsCreated: 4 }, new Date('2026-11-11T10:00:00Z'))).toBe('Last ran 3 h ago, 4 new')
    expect(lastRanWords({ startedAt: '2026-11-08T07:00:00Z', status: 'failed', itemsCreated: 0 }, new Date('2026-11-11T10:00:00Z'))).toBe('Last ran 3 days ago, failed')
  })
})
