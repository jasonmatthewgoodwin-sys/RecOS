import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HeroStat } from '../../components/HeroStat'
import { PillButton } from '../../components/PillButton'
import { data } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { nextLine } from '../../lib/nextLine'
import { useQuery } from '../../lib/query'
import { dateLine, greeting, isWeekend } from '../../lib/time'

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
  const now = useNow()

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

  return (
    <div className="flex flex-col">
      <p className="label-caps text-ink-2">{dateLine(now)}</p>
      <h1 className="mt-2 text-title text-ink">
        {greeting(now)}
        {firstName ? `, ${firstName}` : ''}
      </h1>

      <div className="mt-16 grid grid-cols-2 gap-x-8 gap-y-12 sm:mt-24 md:grid-cols-4">
        <HeroStat label="Needs you" value={n1?.text} plus={n1?.plus} onClick={() => navigate('/inbox')} />
        <HeroStat label="Follow-ups" value={n2?.text} plus={n2?.plus} onClick={() => navigate('/leads/follow-ups')} />
        <HeroStat label="Calls today" value={n3?.text} plus={n3?.plus} />
        <HeroStat
          label="This week"
          value={week.data ? `${week.data.hit}/${week.data.total}` : undefined}
          meter={week.data ? { filled: week.data.hit, total: week.data.total } : undefined}
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
    </div>
  )
}
