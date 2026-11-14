import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { HeroStat } from '../../components/HeroStat'
import { PillButton } from '../../components/PillButton'
import { skyClass, toneForCount } from '../../lib/tone'
import { data } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { nextLine } from '../../lib/nextLine'
import { useQuery } from '../../lib/query'
import { dateLine, greeting, isWeekend } from '../../lib/time'
import { CallsCard, PrepCard } from './CallsCard'

// Home: the date, a greeting, four numbers, one sentence and one button.
// Nothing else (sections 3.5 and 26). It is a doorway, not a dashboard.

function useNow(): Date {
  // The clock is read when the page opens and when focus returns. Nothing
  // changes while the owner is looking at it (HOME-2, HOME-4).
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const onFocus = () => setNow(new Date())
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
  return now
}

export function Home({ firstName }: { firstName: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const now = useNow()

  // The third number opens a card listing the calls; Prep on a row, or
  // Start when a call is near, opens its prep card (26.4). Both are
  // addressed by the query string so the back button closes them.
  const cardParam = params.get('card')
  const callsOpen = cardParam === 'calls'
  const prepId = cardParam?.startsWith('prep:') ? cardParam.slice(5) : null

  function openCard(value: string) {
    setParams(
      (p) => {
        p.set('card', value)
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

  // Four small queries in parallel. Each shows when ready. One that fails
  // shows a dash and does not block the others (HOME-1).
  const needsYou = useQuery('home.needsYou', data.needsYou)
  const followUps = useQuery('home.followUps', data.followUpsDue)
  const calls = useQuery('home.calls', data.callsToday)
  const week = useQuery('home.week', data.weekTargets)

  const settled = [needsYou, followUps, calls, week].every((q) => q.status !== 'loading')
  const line = settled
    ? nextLine({ now, needsYou: needsYou.data, followUps: followUps.data, calls: calls.data, week: week.data })
    : null

  const n1 = needsYou.data === undefined ? undefined : twoDigits(needsYou.data)
  const n2 = followUps.data === undefined ? undefined : twoDigits(followUps.data.due)
  const n3 = calls.data === undefined || isWeekend(now) ? undefined : twoDigits(calls.data.length)

  const dayTone = toneForCount(needsYou.data, (followUps.data?.late ?? 0) > 0 || (needsYou.data ?? 0) > 0)

  return (
    <div className="flex flex-col">
      {/* The sky: a tall soft band across the top of the sheet, the day's state as its warm core, the plain sheet below (26). */}
      <div aria-hidden data-band={dayTone} className={`-mx-6 -mt-6 mb-10 h-56 rounded-t-sheet sm:-mx-16 sm:-mt-16 sm:mb-14 sm:h-80 ${skyClass[dayTone]}`} />
      <p className="label-caps text-ink-2">{dateLine(now)}</p>
      <h1 className="mt-2 text-title text-ink">
        {greeting(now)}
        {firstName ? `, ${firstName}` : ''}
      </h1>

      <div className="mt-16 grid grid-cols-2 gap-x-8 gap-y-12 sm:mt-24 md:grid-cols-4">
        <HeroStat label="Needs you" value={n1?.text} plus={n1?.plus} tone={toneForCount(needsYou.data, true)} icon="inbox" onClick={() => navigate('/inbox')} />
        <HeroStat label="Follow-ups" value={n2?.text} plus={n2?.plus} tone={toneForCount(followUps.data?.due, (followUps.data?.late ?? 0) > 0)} icon="clock" onClick={() => navigate('/leads/follow-ups')} />
        <HeroStat label="Calls today" value={n3?.text} plus={n3?.plus} tone={toneForCount(isWeekend(now) ? 0 : calls.data?.length)} icon="phone" onClick={() => openCard('calls')} />
        <HeroStat
          label="This week"
          value={week.data ? `${week.data.hit}/${week.data.total}` : undefined}
          meter={week.data ? { filled: week.data.hit, total: week.data.total } : undefined}
          tone={week.data ? (week.data.hit >= week.data.total ? 'clear' : 'pending') : undefined}
          icon="numbers"
          onClick={() => navigate('/numbers/this-week')}
        />
      </div>

      <hr className="mt-16 border-rule" />

      <div className="mt-8 flex min-h-11 flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body text-ink" data-testid="next-line">
          {line?.text ?? ''}
        </p>
        {line?.to && <PillButton kind="primary" label="Start" onClick={() => navigate(line.to!)} />}
      </div>

      {/* The lower third of the sheet is empty, on purpose. */}
      <div aria-hidden className="h-24 sm:h-40" />

      {callsOpen && <CallsCard calls={calls.data ?? []} onPrep={(id) => openCard(`prep:${id}`)} onClose={closeCard} />}
      {prepId && <PrepFor id={prepId} onClose={closeCard} />}
    </div>
  )
}

/** The prep card for one call. Reads the calls and, for a client update, what the owner is waiting on. */
function PrepFor({ id, onClose }: { id: string; onClose: () => void }) {
  const calls = useQuery('home.calls', data.callsToday)
  const week = useQuery('home.week', data.weekTargets)
  const followUps = useQuery('leads.followUps', data.followUps)
  const call = calls.data?.find((c) => c.id === id)
  if (!call) return null
  const waitingOn = (followUps.data ?? []).filter((f) => f.status === 'open' && f.direction === 'waiting')
  return <PrepCard call={call} waitingOn={waitingOn} week={week.data} onClose={onClose} />
}
