import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { HeroStat } from '../../components/HeroStat'
import { PillButton } from '../../components/PillButton'
import { TextLink } from '../../components/TextLink'
import { skyClass, toneForCount } from '../../lib/tone'
import { data, type CalendarCall } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { nextLine } from '../../lib/nextLine'
import { useQuery } from '../../lib/query'
import { dateLine, greeting, isWeekend, shiftDate, ukClock } from '../../lib/time'
import { CallsCard, PrepCard, type DayTab } from './CallsCard'

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
        p.delete('day')
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
  const day = useQuery('home.day', data.dayToday)
  const week = useQuery('home.week', data.weekTargets)

  const settled = [needsYou, followUps, calls, week].every((q) => q.status !== 'loading')
  const line = settled
    ? nextLine({ now, needsYou: needsYou.data, followUps: followUps.data, calls: calls.data, week: week.data })
    : null

  const n1 = needsYou.data === undefined ? undefined : twoDigits(needsYou.data)
  // Second number: live searches (Jason, 15 November: Follow-ups no longer has a page).
  // Live is intake, open or offer. The tile turns to action when any live search has gone cold.
  const searches = useQuery('home.searches', data.searches)
  const live = searches.data?.filter((s) => s.status === 'intake' || s.status === 'open' || s.status === 'offer')
  const n2 = live === undefined ? undefined : twoDigits(live.length)
  const anyCold = (live ?? []).some((s) => s.health === 'cold')
  const n3 = calls.data === undefined || isWeekend(now) ? undefined : twoDigits(calls.data.length)

  const dayTone = toneForCount(needsYou.data, (followUps.data?.late ?? 0) > 0 || (needsYou.data ?? 0) > 0)

  return (
    <div className="flex flex-col">
      {/* The sky: a tall soft band across the top of the sheet, the day's state as its warm core, the plain sheet below (26). */}
      <div aria-hidden data-band={dayTone} className={`-mx-5 -mt-5 mb-8 h-44 rounded-t-sheet sm:-mx-10 sm:-mt-8 sm:mb-10 sm:h-64 ${skyClass[dayTone]}`} />
      <p className="label-caps text-ink-2">{dateLine(now)}</p>
      <h1 className="mt-2 text-title text-ink">
        {greeting(now)}
        {firstName ? `, ${firstName}` : ''}
      </h1>

      <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-8 sm:mt-14 md:grid-cols-4">
        <HeroStat label="Needs you" value={n1?.text} plus={n1?.plus} tone={toneForCount(needsYou.data, true)} icon="inbox" onClick={() => navigate('/tasks')} />
        <HeroStat label="Live searches" value={n2?.text} plus={n2?.plus} tone={toneForCount(live?.length, anyCold)} icon="search" onClick={() => navigate('/searches')} />
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

      {/* The day view (Mia, 14 November 2026): one quiet link under the numbers opens the whole day from Outlook. */}
      <div className="mt-4">
        <TextLink label="Your day" icon="calendar" onClick={() => openCard('calls')} />
      </div>

      <hr className="mt-10 border-rule" />

      <div className="mt-6 flex min-h-11 flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body text-ink" data-testid="next-line">
          {line?.text ?? ''}
        </p>
        {line?.to && <PillButton kind="primary" label="Start" onClick={() => navigate(line.to!)} />}
      </div>

      {/* The lower third of the sheet is empty, on purpose. */}
      <div aria-hidden className="h-10 sm:h-16" />

      {callsOpen && <DayView now={now} calls={calls.data ?? []} day={day.data} onPrep={(id) => openCard(`prep:${id}`)} onClose={closeCard} />}
      {prepId && <PrepFor id={prepId} onClose={closeCard} />}
    </div>
  )
}

const isExternal = (c: CalendarCall) => c.isExternal !== false

/**
 * The day view with its seven-day strip (Jason, 15 November 2026): today and
 * the next six days, each with its count of calls with someone outside. The
 * chosen day sits in ?day=YYYY-MM-DD; none, or one outside the seven, is today.
 * Moving between days replaces the address, so Back still closes the card.
 */
function DayView({ now, calls, day, onPrep, onClose }: { now: Date; calls: CalendarCall[]; day?: CalendarCall[]; onPrep: (id: string) => void; onClose: () => void }) {
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const week = useQuery('home.calendarWeek', data.calendarWeek)
  const today = ukClock(now).date
  const dates = [0, 1, 2, 3, 4, 5, 6].map((n) => shiftDate(today, n))
  const asked = params.get('day')
  const selected = asked && dates.includes(asked) ? asked : today

  const todays = day ?? calls
  const eventsOn = (date: string): CalendarCall[] | undefined =>
    date === today ? todays : week.data?.filter((c) => ukClock(new Date(c.startsAt)).date === date)
  const nameOf = (date: string, short: boolean) => {
    if (date === today) return 'Today'
    if (date === dates[1]) return 'Tomorrow'
    const c = ukClock(new Date(`${date}T12:00:00Z`))
    return short ? `${c.weekday.slice(0, 3)} ${c.day}` : `${c.weekday} ${c.day} ${c.month}`
  }
  const days: DayTab[] = dates.map((date) => ({ date, label: nameOf(date, true), count: eventsOn(date)?.filter(isExternal).length }))

  function onDay(date: string) {
    setParams(
      (p) => {
        p.set('day', date)
        return p
      },
      { replace: true, state: location.state },
    )
  }

  return (
    <CallsCard
      calls={calls}
      day={eventsOn(selected) ?? []}
      days={days}
      selected={selected}
      onDay={onDay}
      dayName={nameOf(selected, false)}
      onPrep={onPrep}
      onClose={onClose}
    />
  )
}

/** The prep card for one call. Reads the calls and, for a client update, what the owner is waiting on. */
function PrepFor({ id, onClose }: { id: string; onClose: () => void }) {
  const calls = useQuery('home.calls', data.callsToday)
  const day = useQuery('home.day', data.dayToday)
  const ahead = useQuery('home.calendarWeek', data.calendarWeek)
  const week = useQuery('home.week', data.weekTargets)
  const followUps = useQuery('leads.followUps', data.followUps)
  // A call later today, earlier today or on one of the next six days (0045).
  const call = [...(calls.data ?? []), ...(day.data ?? []), ...(ahead.data ?? [])].find((c) => c.id === id)
  if (!call) return null
  const waitingOn = (followUps.data ?? []).filter((f) => f.status === 'open' && f.direction === 'waiting')
  return <PrepCard call={call} waitingOn={waitingOn} week={week.data} onClose={onClose} />
}
