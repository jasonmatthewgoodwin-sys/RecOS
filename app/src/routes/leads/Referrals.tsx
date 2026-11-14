import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Draft } from '../../components/Draft'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { RowList } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { daysSince, referralOpening } from '../../lib/bd'
import { data, type Referral, type ReferralStage } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'
import { ukClock } from '../../lib/time'

// Referrals (28.4): one number, the new referrals oldest first, Contacted
// and Not relevant on hover, and a card with the context and a draft
// opening message that names the referrer.

const KEY = 'leads.referrals'

export function Referrals() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [today] = useState(() => ukClock(new Date()).date)

  const referrals = useQuery(KEY, data.referrals)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [note, setNote] = useState<string | null>(null)
  const cardId = params.get('card')?.startsWith('referral:') ? params.get('card')!.slice(9) : null

  const tab = sections.find((s) => s.key === 'leads')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))

  const all = referrals.data ?? []
  const fresh = all.filter((r) => r.stage === 'new')
  const chosen = cardId ? all.find((r) => r.id === cardId) : undefined

  function openCard(id: string) {
    setParams(
      (p) => {
        p.set('card', `referral:${id}`)
        return p
      },
      { state: { card: true } },
    )
  }

  function closeCard() {
    if ((location.state as { card?: boolean } | null)?.card) {
      navigate(-1)
      return
    }
    setParams(
      (p) => {
        p.delete('card')
        return p
      },
      { replace: true },
    )
  }

  // The screen first, the server second (25.5). Contacted raises the
  // thank-you follow-up in the database (REF-2).
  async function move(r: Referral, stage: ReferralStage) {
    const before = referrals.data
    setQueryData<Referral[]>(KEY, (rows) =>
      (rows ?? []).map((x) => (x.id === r.id ? { ...x, stage, contactedOn: stage === 'contacted' ? (x.contactedOn ?? today) : x.contactedOn } : x)),
    )
    try {
      await data.setReferralStage(r.id, stage)
      invalidate('home')
    } catch {
      setQueryData<Referral[]>(KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  // New ones first, oldest first (28.4); those already in touch below a hairline.
  const rows = [...all]
    .sort((a, b) => Number(a.stage !== 'new') - Number(b.stage !== 'new') || a.receivedOn.localeCompare(b.receivedOn))
    .map((r) => ({
      id: r.id,
      dot: r.stage === 'new' ? ('solid' as const) : ('hollow' as const),
      title: r.referredName,
      detail: r.referredCompany ?? undefined,
      detailWord: `From ${r.referredByName}`,
      meta: `${daysSince(r.receivedOn, today)}d`,
      section: r.stage === 'new' ? undefined : 'In touch',
      actions:
        r.stage === 'new'
          ? [
              { label: 'Contacted', onClick: () => void move(r, 'contacted') },
              { label: 'Not relevant', onClick: () => void move(r, 'not_relevant') },
            ]
          : [],
      onOpen: () => openCard(r.id),
    }))

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={tab.label} tabs={tabs} />

      <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:flex md:gap-x-16">
        <HeroStat label="To contact" value={referrals.data ? twoDigits(fresh.length).text : undefined} />
      </div>

      <RowList icon="people" rows={rows} state={referrals.status} emptyText="No referrals waiting" />

      {chosen && (
        <Card
          key={chosen.id}
          label="Referral"
          title={chosen.referredName}
          sections={[
            {
              body: (
                <p className="text-ink-2">
                  {[chosen.referredTitle, chosen.referredCompany].filter(Boolean).join(', ')}
                  {chosen.referredTitle || chosen.referredCompany ? '. ' : ''}From {chosen.referredByName}
                </p>
              ),
            },
            ...(chosen.context ? [{ label: 'From the call', body: <p>{chosen.context}</p> }] : []),
            ...(chosen.stage === 'new'
              ? [
                  {
                    body: (
                      <div className="max-w-prose">
                        <Draft
                          label="Opening message"
                          text={drafts[chosen.id] ?? referralOpening(chosen)}
                          original={referralOpening(chosen)}
                          onChange={(t) => setDrafts((d) => ({ ...d, [chosen.id]: t }))}
                        />
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
          primaryAction={chosen.stage === 'new' ? { label: 'Contacted', onClick: () => void move(chosen, 'contacted').then(closeCard) } : undefined}
          links={
            chosen.stage === 'new' ? (
              <>
                <TextLink label="Copy" onClick={() => void navigator.clipboard?.writeText(drafts[chosen.id] ?? referralOpening(chosen))} />
                <TextLink label="Not relevant" onClick={() => void move(chosen, 'not_relevant').then(closeCard)} />
              </>
            ) : undefined
          }
          foot={`Received ${chosen.receivedOn}${chosen.contactedOn ? `, contacted ${chosen.contactedOn}` : ''}`}
          onClose={closeCard}
        />
      )}

      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
