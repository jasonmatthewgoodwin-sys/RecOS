// The one sentence on Home (section 14.9). The first rule that matches wins.
// Rules 2, 6 and 7 take their inputs from later tickets (search health, the
// league and KPI pace). Until those inputs are passed in they never match.

import type { CalendarCall, FollowUpsDue, WeekTargets } from './data'
import { plural } from './format'
import { ukClock, ukTime } from './time'

export type NextLineInput = {
  now: Date
  calls?: CalendarCall[]
  coldSearch?: { id: string; name: string; reason: string }
  followUps?: FollowUpsDue
  needsYou?: number
  leagueDue?: number
  behindPace?: { sentence: string; to: string }
  week?: WeekTargets
}

export type NextLine = {
  text: string
  /** Where Start goes. Null hides the button (HOME-3). */
  to: string | null
}

const SOON_MS = 20 * 60 * 1000

export function nextLine(input: NextLineInput): NextLine {
  const { now } = input
  const clock = ukClock(now)

  // 1. A call starts within 20 minutes.
  const soon = (input.calls ?? [])
    .filter((c) => {
      const wait = new Date(c.startsAt).getTime() - now.getTime()
      return wait >= 0 && wait <= SOON_MS
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]
  if (soon) {
    const who = soon.personName ?? soon.title
    return {
      text: `Your call with ${who} starts at ${ukTime(new Date(soon.startsAt))}`,
      to: `/home?card=prep:${soon.id}`,
    }
  }

  // 2. Any search is cold.
  if (input.coldSearch) {
    const s = input.coldSearch
    return { text: `${s.name} has gone cold: ${s.reason}`, to: `/searches/${s.id}/brief` }
  }

  // 3. Follow-ups are late.
  const fu = input.followUps
  if (fu && fu.late > 0) {
    const what = plural(fu.late, 'follow-up', 'follow-ups')
    const from = fu.lateFromDay ? ` from ${fu.lateFromDay}'s calls` : ''
    return { text: `Start with ${what}${from}`, to: '/leads/follow-ups' }
  }

  // 4. Monday before 11:00.
  if (clock.isoDay === 1 && clock.hour < 11 && fu && fu.due > 0) {
    return {
      text: `Follow-up block: ${plural(fu.due, 'person', 'people')} from last week`,
      to: '/leads/follow-ups?focus=monday',
    }
  }

  // 5. Inbox has new items.
  if (input.needsYou && input.needsYou > 0) {
    const n = input.needsYou
    return { text: n === 1 ? '1 thing needs you' : `${n} things need you`, to: '/inbox' }
  }

  // 6. League members are late.
  if (input.leagueDue && input.leagueDue > 0) {
    const n = input.leagueDue
    return {
      text: n === 1 ? '1 person on the league is due' : `${n} people on the league are due`,
      to: '/people/league',
    }
  }

  // 7. A weekly target is behind pace.
  if (input.behindPace) return { text: input.behindPace.sentence, to: input.behindPace.to }

  // 8. Nothing matches. On a Friday afternoon with every target met, say so (26.7).
  const w = input.week
  if (clock.isoDay === 5 && clock.hour >= 15 && w && w.total > 0 && w.hit >= w.total) {
    return { text: `Week done. ${w.hit} of ${w.total}`, to: null }
  }
  return { text: 'All clear', to: null }
}
