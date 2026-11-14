// The desk runs on UK time whatever the device is set to (sections 2.3 and 26).

const UK = 'Europe/London'

export type UkClock = {
  weekday: string // Monday
  day: number // 14
  month: string // November
  hour: number // 0 to 23
  minute: number
  /** 1 Monday to 7 Sunday */
  isoDay: number
  /** 2026-11-14 */
  date: string
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function ukClock(at: Date): UkClock {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const monthNumber = new Intl.DateTimeFormat('en-GB', { timeZone: UK, month: '2-digit' }).format(at)
  const weekday = get('weekday')
  const day = Number(get('day'))
  return {
    weekday,
    day,
    month: get('month'),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    isoDay: DAYS.indexOf(weekday) + 1,
    date: `${get('year')}-${monthNumber}-${String(day).padStart(2, '0')}`,
  }
}

/** SATURDAY 14 NOVEMBER. Capitals come from the label style, not the text. */
export function dateLine(at: Date): string {
  const c = ukClock(at)
  return `${c.weekday} ${c.day} ${c.month}`
}

/** Morning, Afternoon or Evening. Changes at 12:00 and 18:00 UK time (HOME-6). */
export function greeting(at: Date): 'Morning' | 'Afternoon' | 'Evening' {
  const { hour } = ukClock(at)
  if (hour < 12) return 'Morning'
  if (hour < 18) return 'Afternoon'
  return 'Evening'
}

export function isWeekend(at: Date): boolean {
  return ukClock(at).isoDay >= 6
}

/** 14:30 in UK time. */
export function ukTime(at: Date): string {
  const c = ukClock(at)
  return `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`
}

/** The weekday name of a plain date such as 2026-11-09. */
export function weekdayOf(date: string): string {
  return ukClock(new Date(`${date}T12:00:00Z`)).weekday
}
