import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Field } from '../../components/Field'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { EmptyLine } from '../../components/Quiet'
import { RowList } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { data, type Member, type Tier } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { byTierOrder, onCadence, signalWord, sinceWord, thisWeek, tierSeats, tierShort, tierWord, tiers } from '../../lib/people'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'
import { ukClock } from '../../lib/time'
import { EditLists } from './EditLists'
import { PersonCard } from './PersonCard'
import { usePeopleTabs } from '../../lib/peopleTabs'

// One list under People (29.1 as restructured on 14 November 2026): two
// numbers, this week's suggestions or everyone by tier, and the person card.

const MEMBERS_KEY = 'people.members'
const LISTS_KEY = 'people.lists'

type Filter = 'week' | 'all'

export function PeopleList({ listKey }: { listKey: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [now] = useState(() => new Date())
  const today = ukClock(now).date

  const lists = useQuery(LISTS_KEY, data.lists)
  const members = useQuery(MEMBERS_KEY, data.members)
  const filter: Filter = params.get('show') === 'all' ? 'all' : 'week'
  const cardId = params.get('card')?.startsWith('person:') ? params.get('card')!.slice(7) : null
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', title: '', company: '', tier: 'league_one' as Tier, why: '' })
  const [problem, setProblem] = useState<string | undefined>()
  const [note, setNote] = useState<string | null>(null)

  const tab = sections.find((s) => s.key === 'people')!
  const { tabs } = usePeopleTabs()
  const [editing, setEditing] = useState(false)
  const list = lists.data?.find((l) => l.key === listKey)
  const mine = (members.data ?? []).filter((m) => list && m.listId === list.id)

  const due = mine.filter((m) => m.state !== 'fine').length
  const cadence = onCadence(mine)
  const seats = list?.seats ?? 50
  const chosen = cardId ? mine.find((m) => m.personId === cardId) : undefined

  function setFilter(next: Filter) {
    setParams((p) => {
      if (next === 'week') p.delete('show')
      else p.set('show', 'all')
      p.delete('card')
      return p
    })
  }

  function openCard(personId: string) {
    setParams(
      (p) => {
        p.set('card', `person:${personId}`)
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

  function patch(id: string, change: Partial<Member>) {
    setQueryData<Member[]>(MEMBERS_KEY, (rows) => (rows ?? []).map((m) => (m.id === id ? { ...m, ...change } : m)))
  }

  // The screen is changed first and kept as it is: the server does the same
  // (LEA-2, LEA-6), and nothing shifts under the cursor (25.5).
  async function run(before: Member[] | undefined, work: () => Promise<void>, failText: string) {
    try {
      await work()
      invalidate('home')
    } catch {
      setQueryData<Member[]>(MEMBERS_KEY, () => before ?? [])
      setNote(failText)
    }
  }

  // PEO-1: Logged a reply records a LinkedIn touch for today. The dot turns
  // hollow and the cadence resets on screen first (T-PEO-2).
  function reply(m: Member) {
    const before = members.data
    patch(m.id, { lastTouchOn: today, state: 'fine', daysLate: -1, missedCycles: 0 })
    void run(before, () => data.logReply(m.personId), 'That did not save. Try again.')
  }

  function moveTier(m: Member, tier: Tier, reason: string) {
    const before = members.data
    patch(m.id, { tier, why: reason })
    void run(before, () => data.moveTier(m.id, tier, reason), 'That did not save. Try again.')
  }

  function saveNotes(m: Member, notes: string) {
    const before = members.data
    patch(m.id, { notesForNextContact: notes })
    void run(before, () => data.saveNotes(m.personId, notes), 'That did not save. Try again.')
  }

  function remove(m: Member, reason: string) {
    const before = members.data
    setQueryData<Member[]>(MEMBERS_KEY, (rows) => (rows ?? []).filter((x) => x.id !== m.id))
    closeCard()
    void run(before, () => data.removeFromList(m.id, reason), 'That did not save. Try again.')
  }

  function doNotContact(m: Member) {
    const before = members.data
    setQueryData<Member[]>(MEMBERS_KEY, (rows) => (rows ?? []).filter((x) => x.id !== m.id))
    closeCard()
    void run(before, () => data.setDoNotContact(m.personId), 'That did not save. Try again.')
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!list) return
    if (!form.name.trim()) {
      setProblem('Add their name')
      return
    }
    setProblem(undefined)
    try {
      await data.addPerson({ ...form, listId: list.id })
      invalidate('people')
      setAdding(false)
      setForm({ name: '', title: '', company: '', tier: 'league_one', why: '' })
    } catch {
      setNote('That did not save. Try again.')
    }
  }

  const row = (m: Member) => ({
    id: m.id,
    dot: m.state === 'late' ? ('solid' as const) : ('hollow' as const),
    tone: m.liveSignal ? ('new' as const) : m.state === 'late' ? ('action' as const) : m.state === 'fine' ? ('clear' as const) : ('pending' as const),
    title: m.name,
    detail: [m.title, m.company].filter(Boolean).join(', '),
    meta: `${tierShort[m.tier]} ${sinceWord(m.lastTouchOn, today)}`,
    word: m.state === 'late' ? 'Late' : m.liveSignal ? signalWord[m.liveSignal] : undefined,
    actions: [
      { label: 'Logged a reply', onClick: () => reply(m) },
      { label: 'Open', onClick: () => openCard(m.personId) },
    ],
    onOpen: () => openCard(m.personId),
    leadId: m.personId,
  })

  const weekRows = thisWeek(mine).map(row)
  const allRows = [...mine].sort((a, b) => (a.groupName ?? '').localeCompare(b.groupName ?? '') || byTierOrder(a, b)).map((m) => {
    const inTier = mine.filter((x) => x.tier === m.tier).length
    const over = inTier > tierSeats[m.tier] ? `, ${inTier} of ${tierSeats[m.tier]} seats` : ''
    return { ...row(m), section: m.groupName ?? `${tierWord[m.tier]}${over}` }
  })

  const empty = members.status === 'ready' && mine.length === 0

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={tab.label} tabs={tabs} aside={<TextLink label="Edit tabs" icon="pen" onClick={() => setEditing(true)} />} />

      <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:flex md:gap-x-16">
        <HeroStat label="Due" value={members.data ? twoDigits(due).text : undefined} onClick={() => setFilter('week')} />
        <HeroStat
          label="On cadence"
          value={members.data ? `${cadence}/${seats}` : undefined}
          meter={members.data ? { filled: Math.round((cadence / seats) * 20), total: 20 } : undefined}
          onClick={() => setFilter('all')}
        />
      </div>

      {empty ? (
        <div className="flex flex-col items-start gap-6">
          <EmptyLine text="Start with 20 names." />
          {!adding && <PillButton kind="primary" label="Add person" onClick={() => setAdding(true)} />}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <nav aria-label="Show" className="flex gap-x-6">
            <TextLink label="This week" active={filter === 'week'} onClick={() => setFilter('week')} />
            <TextLink label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
          </nav>
          <RowList icon="user" variant="avatar"
            rows={filter === 'week' ? weekRows : allRows}
            state={members.status}
            emptyText={filter === 'week' ? 'Everyone is on cadence' : 'Nobody on this list yet'}
            limit={filter === 'week' ? 8 : 7}
          />
          {!adding && (
            <div>
              <TextLink label="Add person" onClick={() => setAdding(true)} />
            </div>
          )}
        </div>
      )}

      {adding && (
        <form onSubmit={add} className="flex max-w-sm flex-col gap-6" aria-label="Add person">
          <Field label="Name" value={form.name} onChange={(v) => { setForm((f) => ({ ...f, name: v })); setProblem(undefined) }} error={problem} autoFocus />
          <Field label="Title" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} />
          <Field label="Company" value={form.company} onChange={(v) => setForm((f) => ({ ...f, company: v }))} />
          <Field
            label="Tier"
            kind="choice"
            value={form.tier}
            onChange={(v) => setForm((f) => ({ ...f, tier: v as Tier }))}
            choices={tiers.map((t) => ({ value: t, label: tierWord[t] }))}
          />
          <Field label="Why" value={form.why} onChange={(v) => setForm((f) => ({ ...f, why: v }))} placeholder="Why they are on the list" />
          <div className="flex items-center gap-6">
            <PillButton kind={empty ? 'primary' : 'plain'} type="submit" label="Add" />
            <TextLink label="Not now" onClick={() => setAdding(false)} />
          </div>
        </form>
      )}

      {chosen && (
        <PersonCard
          key={chosen.id}
          member={chosen}
          list={list}
          today={today}
          onReply={() => reply(chosen)}
          onTier={(tier, reason) => moveTier(chosen, tier, reason)}
          onNotes={(notes) => saveNotes(chosen, notes)}
          onRemove={(reason) => remove(chosen, reason)}
          onDoNotContact={() => doNotContact(chosen)}
          onClose={closeCard}
        />
      )}

      {editing && lists.data && <EditLists lists={lists.data} onClose={() => setEditing(false)} onNote={setNote} />}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}

/** A list reached by its tab: /people/<key with dashes>. */
export function PeopleListByKey() {
  const { listKey = '' } = useParams()
  return <PeopleList listKey={listKey.replace(/-/g, '_')} />
}
