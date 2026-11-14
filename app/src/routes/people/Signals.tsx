import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Draft } from '../../components/Draft'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { RowList } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { daysSince } from '../../lib/bd'
import { data, type Signal, type SignalStatus } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { signalWord } from '../../lib/people'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'
import { ukClock } from '../../lib/time'

// Signals (29.2): one number, new signals strongest first, Get in touch and
// Ignore on hover, and a card with why it matters, a draft and three choices.
// A signal for someone already on a list offers no Add to league (T-PEO-6).

const KEY = 'people.signals'
const LISTS_KEY = 'people.lists'

/** The change in plain words: Now VP Product Marketing at COMPANY (29.2). */
export function changeWords(s: Signal): string {
  const at = s.company ? ` at ${s.company}` : ''
  switch (s.signalType) {
    case 'new_role':
    case 'promoted':
      return `Now ${s.title ?? 'in a new role'}${at}`
    case 'company_raised':
      return `${s.company ?? 'Their company'} has raised`
    case 'company_hiring':
      return `${s.company ?? 'Their company'} is hiring`
    case 'open_to_work':
      return 'Open to work'
    case 'left_company':
      return `Left ${s.company ?? 'their company'}`
    case 'placed_anniversary':
      return `A year${at}`
    case 'speaker_idea':
      return 'Worth inviting to speak'
    default:
      return s.detail ?? ''
  }
}

/** Why it matters, in one line, from the default actions in 10.4. */
export function whyWords(s: Signal): string {
  switch (s.signalType) {
    case 'new_role':
    case 'promoted':
      return 'New leaders hire in their first quarter. Congratulate them now.'
    case 'company_raised':
      return 'Fresh money means a hiring plan. Ask what it is.'
    case 'company_hiring':
      return 'Chase the job and get the hiring manager on the list.'
    case 'open_to_work':
      return 'A good moment to offer coaching.'
    case 'left_company':
      return 'Check in, and ask who is replacing them.'
    case 'placed_anniversary':
      return 'Keep them warm and ask for referrals.'
    case 'speaker_idea':
      return 'Invite them to speak at the next breakfast.'
    default:
      return s.detail ?? ''
  }
}

/** A short opening the owner edits before it goes anywhere. */
export function draftWords(s: Signal): string {
  const first = (s.personName ?? 'there').split(/\s+/)[0]
  switch (s.signalType) {
    case 'new_role':
    case 'promoted':
      return `Congratulations on the move, ${first}. Well earned. If it would help to talk through the team you are building, I am around.`
    case 'company_raised':
      return `${first}, congratulations on the round. If product marketing is part of the plan, I would be glad to help you think it through.`
    case 'company_hiring':
      return `${first}, I saw the role. I work only on product marketing hires into the US and have two people worth a look.`
    case 'open_to_work':
      return `${first}, I saw you are looking. I do a short exec coaching session for people in product marketing, no strings. Would that be useful?`
    case 'left_company':
      return `${first}, I saw the news. How are you placed, and who is picking things up?`
    case 'placed_anniversary':
      return `${first}, a year already. How has it gone? If you know anyone worth my speaking to, I would be grateful.`
    default:
      return `${first}, I saw your news and wanted to say hello.`
  }
}

export function Signals() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [today] = useState(() => ukClock(new Date()).date)

  const signals = useQuery(KEY, data.signals)
  const lists = useQuery(LISTS_KEY, data.lists)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [note, setNote] = useState<string | null>(null)
  const cardId = params.get('card')?.startsWith('signal:') ? params.get('card')!.slice(7) : null

  const tab = sections.find((s) => s.key === 'people')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))
  const all = signals.data ?? []
  const chosen = cardId ? all.find((s) => s.id === cardId) : undefined
  const senior = lists.data?.find((l) => l.kind === 'leader') ?? lists.data?.[0]

  function openCard(id: string) {
    setParams(
      (p) => {
        p.set('card', `signal:${id}`)
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

  async function move(s: Signal, status: SignalStatus) {
    const before = signals.data
    setQueryData<Signal[]>(KEY, (rows) => (rows ?? []).filter((x) => x.id !== s.id))
    try {
      await data.setSignalStatus(s.id, status)
    } catch {
      setQueryData<Signal[]>(KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  async function addToList(s: Signal) {
    if (!senior) return
    const before = signals.data
    setQueryData<Signal[]>(KEY, (rows) => (rows ?? []).filter((x) => x.id !== s.id))
    try {
      await data.addSignalToList(s, senior.id)
      invalidate('people.members')
    } catch {
      setQueryData<Signal[]>(KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  const rows = all.map((s) => ({
    id: s.id,
    dot: s.strength >= 3 ? ('solid' as const) : ('hollow' as const),
    tone: 'new' as const,
    title: s.personName ?? s.company ?? 'Someone',
    detail: changeWords(s),
    meta: `${signalWord[s.signalType] ?? s.signalType} ${daysSince(s.seenOn, today)}d`,
    actions: [
      { label: 'Get in touch', onClick: () => openCard(s.id) },
      { label: 'Ignore', onClick: () => void move(s, 'ignored') },
    ],
    onOpen: () => openCard(s.id),
  }))

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={tab.label} tabs={tabs} />

      <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:flex md:gap-x-16">
        <HeroStat label="This week" value={signals.data ? twoDigits(all.length).text : undefined} />
      </div>

      <RowList icon="sparkle" rows={rows} state={signals.status} emptyText="No signals this week. Arrives Friday" />

      {chosen && (
        <Card
          key={chosen.id}
          label={signalWord[chosen.signalType] ?? 'Signal'}
          title={chosen.personName ?? chosen.company ?? 'Someone'}
          sections={[
            { body: <p className="text-ink-2">{changeWords(chosen)}{chosen.onList ? '. On the list' : ''}</p> },
            { label: 'Why it matters', body: <p>{whyWords(chosen)}</p> },
            ...(chosen.detail ? [{ label: 'What was seen', body: <p>{chosen.detail}</p> }] : []),
            {
              body: (
                <div className="max-w-prose">
                  <Draft text={drafts[chosen.id] ?? draftWords(chosen)} original={draftWords(chosen)} onChange={(t) => setDrafts((d) => ({ ...d, [chosen.id]: t }))} />
                </div>
              ),
            },
          ]}
          primaryAction={{
            label: 'Get in touch',
            onClick: () => {
              void navigator.clipboard?.writeText(drafts[chosen.id] ?? draftWords(chosen))
              void move(chosen, 'actioned').then(closeCard)
            },
          }}
          links={
            <>
              {!chosen.onList && senior && <TextLink label="Add to league" onClick={() => void addToList(chosen).then(closeCard)} />}
              {chosen.signalType === 'open_to_work' && <TextLink label="Offer coaching" onClick={() => void move(chosen, 'actioned').then(closeCard)} />}
              <TextLink label="Ignore" onClick={() => void move(chosen, 'ignored').then(closeCard)} />
              {chosen.sourceUrl && <TextLink label="Open source" href={chosen.sourceUrl} />}
            </>
          }
          foot={`Seen ${chosen.seenOn}, strength ${chosen.strength}`}
          onClose={closeCard}
        />
      )}

      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
