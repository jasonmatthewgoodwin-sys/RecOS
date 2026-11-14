import { describe, expect, it } from 'vitest'
import type { InboxItem } from './data'
import { approveChoices, byDeckOrder, countByType, deckOf, oldestDays, snoozeChoices, waiting } from './inbox'
import { freshSampleInbox } from './sample'
import { ukClock } from './time'

const wed = ukClock(new Date('2026-11-11T10:00:00Z'))
const thu = ukClock(new Date('2026-11-12T10:00:00Z'))
const fri = ukClock(new Date('2026-11-13T10:00:00Z'))

describe('inbox helpers (section 27)', () => {
  it('snooze offers tomorrow, Thursday and next Monday, never today', () => {
    expect(snoozeChoices(wed).map((c) => c.value)).toEqual(['2026-11-12', '2026-11-12', '2026-11-16'])
    expect(snoozeChoices(thu).map((c) => c.value)).toEqual(['2026-11-13', '2026-11-19', '2026-11-16'])
  })

  it('approve offers tomorrow and the next free weekday', () => {
    expect(approveChoices(fri).map((c) => c.value)).toEqual(['2026-11-14', '2026-11-16'])
    expect(approveChoices(wed).map((c) => c.value)).toEqual(['2026-11-12', '2026-11-13'])
  })

  it('orders the deck: notices first, new before stale, highest rank first', () => {
    const deck = deckOf(freshSampleInbox())
    expect(deck[0].type).toBe('system_notice')
    expect(deck[1].title).toBe('Senior PMM at Northwind Sample Co')
    const statuses = deck.map((i) => i.status)
    expect(statuses.lastIndexOf('new')).toBeLessThan(statuses.indexOf('stale'))
    expect(deck.some((i) => i.type === 'auto_sent' || i.status === 'done')).toBe(false)
  })

  it('INBX-6: never more than 30 in the deck', () => {
    const many: InboxItem[] = Array.from({ length: 45 }, (_, n) => ({
      ...freshSampleInbox()[1],
      id: `x${n}`,
      rank: n,
      status: 'new',
    }))
    expect(waiting(many)).toHaveLength(45)
    const deck = deckOf(many)
    expect(deck).toHaveLength(30)
    expect(deck[0].rank).toBe(44)
    expect([...deck].sort(byDeckOrder)).toEqual(deck)
  })

  it('knows how old the oldest waiting item is, and counts by type in words', () => {
    const items = freshSampleInbox()
    expect(oldestDays(items, new Date())).toBe(16)
    expect(oldestDays([], new Date())).toBeNull()
    expect(countByType(items.filter((i) => i.status === 'stale'))).toBe('1 call, 1 follow-up')
  })
})
