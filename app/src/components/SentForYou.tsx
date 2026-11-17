import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from './Card'
import { Dots } from './Quiet'
import { TextLink } from './TextLink'
import { data, type BehalfArea, type BehalfRow } from '../lib/data'
import { useQuery } from '../lib/query'

type Area = BehalfArea | 'leads' | null

const areaWord: Record<string, string> = { linkedin: 'LinkedIn', email: 'Email', campaign: 'Campaigns', leads: 'LinkedIn and campaigns', all: 'Everything' }

const outcomeWord: Record<string, string> = {
  sent: 'Sent', queued: 'Queued', held: 'Held', failed: 'Failed', cancelled: 'Cancelled',
  accepted: 'Accepted', gone: 'Gone', added: 'Added', enrolled: 'Enrolled',
}

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).format(new Date(iso))
const day = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' }).format(new Date(iso))

/** One plain line: since when, how many of each, how many by the agents and how many by you. */
export function behalfSummary(rows: BehalfRow[]): string {
  if (rows.length === 0) return 'Nothing has gone out on your behalf yet.'
  const first = rows.reduce((a, r) => (r.at < a ? r.at : a), rows[0].at)
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.outcome, (counts.get(r.outcome) ?? 0) + 1)
  const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${(outcomeWord[k] ?? k).toLowerCase()}`)
  const auto = rows.filter((r) => r.how === 'auto').length
  return `Since ${day(first)}: ${parts.join(', ')}. ${auto} by the agents on their own, ${rows.length - auto} by you.`
}

// Sent for you (Jason, 17 November 2026): on every tab where an agent
// reaches people, a quiet link to the log of who was contacted, how, when,
// and whether it went by itself. Nothing moves until it is opened.
export function SentForYou({ area }: { area: Area }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TextLink label="Sent for you" onClick={() => setOpen(true)} />
      {open && <SentForYouCard area={area} onClose={() => setOpen(false)} />}
    </>
  )
}

function SentForYouCard({ area, onClose }: { area: Area; onClose: () => void }) {
  const log = useQuery(`behalf.${area ?? 'all'}`, () => data.onYourBehalf(area))
  const navigate = useNavigate()
  const rows = log.data ?? []
  return (
    <Card
      label={areaWord[area ?? 'all']}
      title="Sent for you"
      onClose={onClose}
      links={<TextLink label="The send engine: rules, queue and stop switch" onClick={() => navigate('/settings/send-rules')} />}
      sections={[
        {
          body:
            log.status === 'loading' && !log.data ? (
              <Dots />
            ) : log.status === 'error' ? (
              <p className="text-ink-2">The log could not be read. Try again.</p>
            ) : (
              <p className="text-body text-ink" data-testid="behalf-summary">
                {behalfSummary(rows)}
              </p>
            ),
        },
        ...(rows.length > 0
          ? [
              {
                body: (
                  <ul className="flex flex-col" aria-label="Sent for you">
                    {rows.map((r) => (
                      <li key={r.key} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule py-2" data-how={r.how}>
                        <span className="w-28 shrink-0 font-mono text-label text-ink-2">{when(r.at)}</span>
                        <span className="min-w-0 flex-1 text-body text-ink">
                          {r.toName}
                          <span className="ml-3 text-ink-2">{r.what}</span>
                        </span>
                        <span className="label-caps text-ink">{outcomeWord[r.outcome] ?? r.outcome}</span>
                        <span className="label-caps w-12 text-ink-3">{r.how === 'auto' ? 'Auto' : 'You'}</span>
                        {r.link && <TextLink label="Profile" href={r.link} icon="open" />}
                      </li>
                    ))}
                  </ul>
                ),
              },
            ]
          : []),
      ]}
    />
  )
}
