import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchGroupWord, type SearchHit } from '../lib/capture'
import { data } from '../lib/data'
import { Card } from './Card'
import { Field } from './Field'
import { Icon, type IconName } from './Icon'
import { EmptyLine } from './Quiet'
import { TextLink } from './TextLink'

const icon: Record<SearchHit['kind'], IconName> = { person: 'user', job_lead: 'briefcase', referral: 'people', follow_up: 'clock' }
const order: SearchHit['kind'][] = ['person', 'job_lead', 'referral', 'follow_up']

// Search (25.7): a small window in the centre, opened with / or the
// magnifier at the top right of the tabs. Results group under plain labels,
// three each. A last row, Look in the CRM, opens the CRM's own search when
// RecOS knows its address.
export function Search({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const crm = import.meta.env.VITE_CRM_SEARCH_URL as string | undefined

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits(null)
      return
    }
    let live = true
    const t = setTimeout(() => {
      void data.search(q).then((h) => {
        if (live) setHits(h)
      })
    }, 150)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [query])

  const groups = order.map((k) => ({ kind: k, hits: (hits ?? []).filter((h) => h.kind === k).slice(0, 3) })).filter((g) => g.hits.length > 0)

  return (
    <Card
      label="Search"
      title="Find"
      sections={[
        { body: <Field label="Name, company or role" value={query} onChange={setQuery} autoFocus placeholder="Type two letters or more" /> },
        {
          body:
            hits === null ? (
              <EmptyLine text="People, job leads, referrals and follow-ups held in RecOS" />
            ) : groups.length === 0 ? (
              <EmptyLine text="Nothing by that name" />
            ) : (
              <div className="flex flex-col gap-6">
                {groups.map((g) => (
                  <section key={g.kind} className="flex flex-col gap-1">
                    <h3 className="label-caps text-ink-2">{searchGroupWord[g.kind]}</h3>
                    <ul className="flex flex-col divide-y divide-rule" aria-label={searchGroupWord[g.kind]}>
                      {g.hits.map((h) => (
                        <li key={h.id}>
                          <button
                            type="button"
                            onClick={() => {
                              onClose()
                              navigate(h.route)
                            }}
                            className="flex min-h-11 w-full items-center gap-3 text-left text-body text-ink hover:bg-paper"
                          >
                            <Icon name={icon[h.kind]} size={14} className="text-ink-3" />
                            <span>{h.title}</span>
                            {h.detail && <span className="truncate text-ink-2">{h.detail}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ),
        },
      ]}
      links={crm ? <TextLink label="Look in the CRM" href={`${crm}${encodeURIComponent(query.trim())}`} icon="open" /> : undefined}
      onClose={onClose}
    />
  )
}
