import { describe, expect, it } from 'vitest'
import type { InboxItem } from './data'
import {
  ageWord,
  approveChoices,
  boxCounts,
  byDeckOrder,
  countByType,
  deckOf,
  folderBox,
  folderIdOf,
  folderNameProblem,
  inBox,
  oldestDays,
  snoozeChoices,
  waiting,
  whoOf,
  autoBox,
  autoFolderOf,
  autoOf,
} from './inbox'
import { freshSampleInbox, resetSampleInbox, sampleSource } from './sample'
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

describe('two panes and folders (Jason, 2026-11-14)', () => {
  const items = freshSampleInbox().map((i) => (i.id === 'in-3' || i.id === 'in-11' ? { ...i, folderId: 'f1' } : i))

  it('Inbox holds the unfiled waiting items, a folder its own, and the counts match', () => {
    expect(inBox(items, 'inbox').map((i) => i.id)).not.toContain('in-3')
    expect(inBox(items, 'inbox')).toHaveLength(10)
    expect(inBox(items, folderBox('f1')).map((i) => i.id).sort()).toEqual(['in-11', 'in-3'])
    expect(inBox(items, 'sent')).toEqual([])
    const c = boxCounts(items)
    expect(c.inbox).toBe(10)
    expect(c.folders).toEqual({ f1: 2 })
    expect(c.auto.clients + c.auto.candidates + c.auto.leads + c.auto.other).toBe(10)
    expect(folderIdOf(folderBox('f1'))).toBe('f1')
    expect(folderIdOf('done')).toBeNull()
  })

  it('the automatic folders split the unfiled items by what they are, and a live search makes a company a client', () => {
    expect(autoFolderOf({ type: 'client_nudge', company: null })).toBe('clients')
    expect(autoFolderOf({ type: 'job_lead', company: 'Northwind Sample Co' })).toBe('leads')
    expect(autoFolderOf({ type: 'follow_up', company: 'Contoso' })).toBe('candidates')
    expect(autoFolderOf({ type: 'follow_up', company: ' contoso ' }, new Set(['contoso']))).toBe('clients')
    expect(autoFolderOf({ type: 'content_draft', company: null })).toBe('other')
    const leads = inBox(items, autoBox('leads'))
    expect(leads.length).toBeGreaterThan(0)
    expect(leads.every((i) => !i.folderId && (i.type === 'job_lead' || i.type === 'wider_lead'))).toBe(true)
    expect(autoOf(autoBox('other'))).toBe('other')
    expect(autoOf('inbox')).toBeNull()
    expect(folderNameProblem('clients', [])).toBe('That name is already a folder here')
  })

  it('a row says who, and how old in a few characters', () => {
    const now = new Date('2026-11-11T10:00:00Z')
    expect(ageWord('2026-11-11T09:59:40Z', now)).toBe('now')
    expect(ageWord('2026-11-11T09:20:00Z', now)).toBe('40m')
    expect(ageWord('2026-11-11T07:00:00Z', now)).toBe('3h')
    expect(ageWord('2026-11-09T10:00:00Z', now)).toBe('2d')
    expect(ageWord('2026-10-21T10:00:00Z', now)).toBe('3w')
    expect(whoOf(items.find((i) => i.id === 'in-2')!)).toBe('Northwind Sample Co')
    expect(whoOf(items.find((i) => i.id === 'in-1')!)).toBe('RecOS')
  })

  it('a folder name is 1 to 40 characters and not taken, whatever the case', () => {
    expect(folderNameProblem('  ', [])).toBe('Give it a name')
    expect(folderNameProblem('x'.repeat(41), [])).toBe('Keep it to 40 characters')
    expect(folderNameProblem(' hold FOR later ', ['Hold for later'])).toBe('That name is taken')
    expect(folderNameProblem('Hot', ['Hold for later'])).toBeUndefined()
  })

  it('sample mode: make, rename, file into and delete a folder; its items go back to Inbox', async () => {
    resetSampleInbox()
    const hot = await sampleSource.createInboxFolder('Hot')
    await expect(sampleSource.createInboxFolder('hot')).rejects.toThrow('That name is taken')
    await sampleSource.renameInboxFolder(hot.id, 'Warm')
    expect((await sampleSource.inboxFolders()).map((f) => f.name)).toEqual(['Hold for later', 'Warm'])
    await sampleSource.moveInboxItem('in-2', hot.id)
    expect((await sampleSource.inboxItems()).find((i) => i.id === 'in-2')?.folderId).toBe(hot.id)
    await sampleSource.deleteInboxFolder(hot.id)
    expect((await sampleSource.inboxFolders()).map((f) => f.name)).toEqual(['Hold for later'])
    expect((await sampleSource.inboxItems()).find((i) => i.id === 'in-2')?.folderId).toBeNull()
    expect((await sampleSource.inboxClosed('done')).map((i) => i.id)).toEqual(['in-14'])
    resetSampleInbox()
  })
})
