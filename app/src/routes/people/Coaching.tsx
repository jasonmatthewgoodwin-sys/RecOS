import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { RowList } from '../../components/RowList'
import { bookedThisWeek, bySessionOrder, coachingQuestions, heldThisWeek, sessionMeta } from '../../lib/bd'
import { data, type CoachingSession } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { usePeopleTabs } from '../../lib/peopleTabs'
import { sections } from '../../lib/sections'
import { ukClock } from '../../lib/time'

// Coaching (28.3), under People since 14 November 2026 (docs/decisions.md):
// this week against five, what is booked, the sessions this week and last,
// and a card with the four standing questions and what came of it.

const KEY = 'people.coaching'
const WEEKLY_TARGET = 5

export function Coaching() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [now] = useState(() => new Date())
  const clock = ukClock(now)

  const sessions = useQuery(KEY, data.coachingSessions)
  const [note, setNote] = useState<string | null>(null)
  const cardId = params.get('card')?.startsWith('coaching:') ? params.get('card')!.slice(9) : null

  const tab = sections.find((s) => s.key === 'people')!
  const { tabs } = usePeopleTabs()

  const all = sessions.data ?? []
  const held = heldThisWeek(all, clock)
  const booked = bookedThisWeek(all, clock, now)
  const chosen = cardId ? all.find((s) => s.id === cardId) : undefined

  function openCard(id: string) {
    setParams(
      (p) => {
        p.set('card', `coaching:${id}`)
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

  async function followUp(s: CoachingSession) {
    const before = sessions.data
    setQueryData<CoachingSession[]>(KEY, (rows) => (rows ?? []).map((r) => (r.id === s.id ? { ...r, followedUp: true } : r)))
    try {
      await data.markCoachingFollowedUp(s.id)
      invalidate('home')
    } catch {
      setQueryData<CoachingSession[]>(KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  const rows = [...all].sort(bySessionOrder).map((s) => ({
    id: s.id,
    dot: s.status === 'held' && !s.followedUp ? ('solid' as const) : ('hollow' as const),
    tone: s.status === 'held' ? (s.followedUp ? ('clear' as const) : ('action' as const)) : s.status === 'booked' ? ('pending' as const) : ('clear' as const),
    title: s.personName,
    detail: [s.personTitle, s.personCompany].filter(Boolean).join(', '),
    meta: sessionMeta(s),
    done: s.status === 'cancelled' || s.status === 'no_show',
    onOpen: () => openCard(s.id),
  }))

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={tab.label} tabs={tabs} />

      <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:flex md:gap-x-16">
        <HeroStat
          label="This week"
          value={sessions.data ? `${held}/${WEEKLY_TARGET}` : undefined}
          meter={sessions.data ? { filled: held, total: WEEKLY_TARGET } : undefined}
        />
        <HeroStat label="Booked" value={sessions.data ? twoDigits(booked).text : undefined} />
      </div>

      <RowList icon="user" variant="avatar" rows={rows} state={sessions.status} emptyText="No sessions this week or last" />

      {chosen && (
        <Card
          key={chosen.id}
          label="Coaching"
          title={chosen.personName}
          sections={[
            { body: <p className="text-ink-2">{[chosen.personTitle, chosen.personCompany].filter(Boolean).join(', ')}</p> },
            {
              label: 'Before the session',
              body: (
                <div className="flex flex-col gap-2">
                  <p className="text-ink-2">Not on the league yet. The league arrives in week 4.</p>
                  <ul className="flex flex-col gap-1">
                    {coachingQuestions.map((q) => (
                      <li key={q.key}>{q.question}</li>
                    ))}
                  </ul>
                </div>
              ),
            },
            ...(chosen.status === 'held'
              ? [
                  {
                    label: 'After the session',
                    body: (
                      <dl className="flex flex-col gap-2">
                        {coachingQuestions.map((q) => {
                          const answer = chosen.answers[q.key]
                          return (
                            <div key={q.key} className="flex flex-col">
                              <dt className="text-ink-2">{q.question}</dt>
                              {answer ? <dd>{answer}</dd> : <dd className="text-ink-3">Not asked</dd>}
                            </div>
                          )
                        })}
                        {chosen.adviceGiven && (
                          <div className="flex flex-col">
                            <dt className="text-ink-2">Advice given</dt>
                            <dd>{chosen.adviceGiven}</dd>
                          </div>
                        )}
                      </dl>
                    ),
                  },
                  {
                    label: 'What came of it',
                    body: (
                      <p>
                        <span className="font-mono tabular-nums">{chosen.referralsCount}</span> referrals,{' '}
                        <span className="font-mono tabular-nums">{chosen.leadsCount}</span> leads
                      </p>
                    ),
                  },
                ]
              : []),
          ]}
          primaryAction={chosen.status === 'held' && !chosen.followedUp ? { label: 'Follow up', onClick: () => void followUp(chosen).then(closeCard) } : undefined}
          foot={chosen.followedUp ? 'Followed up' : sessionMeta(chosen)}
          onClose={closeCard}
        />
      )}

      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
