import { useState, type ReactNode } from 'react'
import { Board } from '../../components/Board'
import { Card } from '../../components/Card'
import { Deck } from '../../components/Deck'
import { Draft } from '../../components/Draft'
import { Field } from '../../components/Field'
import { FileTab } from '../../components/FileTab'
import { HeroStat } from '../../components/HeroStat'
import { IndexTabs } from '../../components/IndexTab'
import { MessageRow } from '../../components/MessageRow'
import { Note } from '../../components/Note'
import { NumberLine } from '../../components/NumberLine'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { Row } from '../../components/Row'
import { RowList } from '../../components/RowList'
import { Switch } from '../../components/Switch'
import { TextLink } from '../../components/TextLink'
import { TickMeter } from '../../components/TickMeter'
import { freshSampleTasks } from '../../lib/sample'
import { columns } from '../../lib/tasks'
import { getTheme, setTheme } from '../../theme/tokens'

// The component gallery (FE-3): every shared component in every state, for
// visual checks. Open /gallery while running `npm run dev`. It is not part of
// the built app, so the calm rules for screens do not apply to this page.

function Block({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-6 border-t border-rule py-8">
      <h2 className="label-caps text-ink-2">{name}</h2>
      {children}
    </section>
  )
}

const noop = () => {}

const sampleRows = Array.from({ length: 9 }, (_, i) => ({
  id: String(i),
  dot: (i < 3 ? 'solid' : 'hollow') as 'solid' | 'hollow',
  title: `Sample row ${i + 1}`,
  detail: 'A quiet detail',
  meta: `0${i + 1}:00`,
}))

const dividedRows = [
  { id: 'd1', dot: 'solid' as const, title: 'Senior PMM', detail: 'Northwind Sample Co', meta: 'New York 2d' },
  { id: 'd2', dot: 'solid' as const, title: 'Head of Product Marketing', detail: 'Acme Pretend Ltd', detailWord: 'Existing client', meta: 'Austin 4d' },
  { id: 'd3', dot: 'solid' as const, title: 'Marketing Manager', detail: 'Dunder Mock Paper', meta: 'Scranton 8d', section: 'Lower fit' },
]

type SampleItem = { id: string; type: string; title: string; why: string; draft?: string }

const deckItems: SampleItem[] = [
  {
    id: 'a',
    type: 'JOB',
    title: 'Senior PMM at Northwind Sample Co',
    why: 'B2B SaaS, about 400 people, New York. Posted two days ago.',
    draft: 'Hi, I saw the Senior PMM role. I work only on product marketing hires and have two people worth a look.',
  },
  { id: 'b', type: 'SIGNAL', title: 'Ben Sample was promoted', why: 'Now VP. Likely to build a team.' },
  { id: 'c', type: 'REFERRAL', title: 'Eve Invented named someone to speak to', why: 'Mentioned on a call this week.' },
]

function DeckSample() {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  return (
    <Deck
      items={deckItems}
      renderItem={(item) => (
        <div className="flex flex-col gap-4">
          <p className="label-caps text-ink-2">{item.type}</p>
          <h3 className="text-title text-ink">{item.title}</h3>
          <p className="text-body text-ink-2">{item.why}</p>
          {item.draft !== undefined && (
            <Draft text={drafts[item.id] ?? item.draft} original={item.draft} onChange={(t) => setDrafts({ ...drafts, [item.id]: t })} />
          )}
        </div>
      )}
      primaryAction={{ label: (item) => (item.type === 'JOB' ? 'Chased' : 'Done'), onClick: noop }}
      onBin={noop}
      binReasons={() => ['Not a fit', 'Already known', 'Filled']}
      onSnooze={noop}
      snoozeChoices={[
        { label: 'Tomorrow', value: '1' },
        { label: 'Thursday', value: '2' },
        { label: 'Next Monday', value: '3' },
      ]}
      links={() => <TextLink label="Open source" href="https://example.com" />}
      onList={noop}
    />
  )
}

function CardSample() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative min-h-[32rem] rounded-sheet border border-rule p-8">
      <PillButton label="Open card" onClick={() => setOpen(true)} />
      <p className="mt-4 text-body text-ink-2">The page behind stays put. Esc closes it.</p>
      {open && (
        <Card
          label="Job"
          title="Senior PMM at Northwind Sample Co"
          sections={[
            { label: 'Why', body: 'B2B SaaS, about 400 people, New York. Posted two days ago.' },
            { label: 'Matched', body: 'Ada Example. Senior PMM in New York, open to a move' },
          ]}
          primaryAction={{ label: 'Chased', onClick: () => setOpen(false) }}
          links={
            <>
              <TextLink label="Snooze" onClick={noop} />
              <TextLink label="Bin" onClick={noop} />
            </>
          }
          foot="Found by the jobs agent. LinkedIn post"
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function NoteSample() {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative min-h-40 rounded-sheet border border-rule p-8">
      <PillButton label="Show note" onClick={() => setShown(true)} />
      {shown && <Note text="Outlook needs signing in again" link={{ label: 'Fix', onClick: noop }} onClose={() => setShown(false)} />}
    </div>
  )
}

function SwitchSample() {
  const [a, setA] = useState(true)
  const [b, setB] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <Switch on={a} label="Thank-you emails send on their own" onChange={setA} />
      <Switch on={b} label="Night theme" onChange={setB} />
      <Switch on={false} label="LinkedIn messages (draft only)" onChange={noop} disabled />
    </div>
  )
}

function FieldSample() {
  const [name, setName] = useState('')
  const [date, setDate] = useState('2026-11-16')
  const [choice, setChoice] = useState('')
  return (
    <div className="grid max-w-md gap-8">
      <Field label="Colleague" value={name} onChange={setName} placeholder="Who takes it" />
      <Field label="Due" value={date} onChange={setDate} kind="date" />
      <Field
        label="Reason"
        value={choice}
        onChange={setChoice}
        kind="choice"
        placeholder="Choose one"
        choices={[
          { value: 'no_reply', label: 'No reply' },
          { value: 'filled', label: 'Filled' },
          { value: 'other', label: 'Other' },
        ]}
      />
      <Field label="Split" value="" onChange={noop} error="Agree the split first" />
    </div>
  )
}

function DraftSample() {
  const original = 'Congratulations on the move to VP, Ben. Well earned.'
  const [text, setText] = useState(original)
  return (
    <div className="max-w-md">
      <Draft text={text} original={original} onChange={setText} />
    </div>
  )
}

function MessageRowSample() {
  const [chosen, setChosen] = useState('m2')
  const rows = [
    { id: 'm1', dot: 'solid' as const, who: 'Northwind Sample Co', title: 'Senior PMM at Northwind Sample Co', type: 'JOB', age: '20h' },
    { id: 'm2', dot: 'solid' as const, who: 'Contoso Demo Inc', title: 'Ben Sample was promoted', type: 'SIGNAL', age: '8h' },
    { id: 'm3', dot: 'solid' as const, who: 'Fabrikam Test Ltd', title: 'Cara Placeholder owes feedback on two CVs', type: 'NUDGE', age: '2d', word: 'Late' },
    { id: 'm4', dot: 'hollow' as const, who: 'Globex Fiction', title: 'Dev Madeup is waiting on feedback', type: 'FOLLOW-UP', age: '2w' },
    { id: 'm5', dot: 'hollow' as const, who: 'Sent for you', title: 'Thank-you sent to Dev Madeup', type: 'AUTO', age: '08:02', word: 'Auto' },
  ]
  return (
    <ul className="max-w-sm border-t border-rule">
      {rows.map((r) => (
        <MessageRow key={r.id} {...r} selected={chosen === r.id} onSelect={() => setChosen(r.id)} />
      ))}
    </ul>
  )
}

export function Gallery() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between pb-8">
        <h1 className="text-title text-ink">Gallery</h1>
        <TextLink label="Switch theme" onClick={() => setTheme(getTheme() === 'night' ? 'paper' : 'night')} />
      </div>

      <Block name="FileTab: rest, with dot. The active state shows in the row above this sheet">
        <div className="flex items-end gap-1">
          <FileTab label="Rest" route="/gallery/none" />
          <FileTab label="Waiting" route="/gallery/none-2" hasDot />
        </div>
      </Block>

      <Block name="IndexTab: active and rest">
        <IndexTabs
          tabs={[
            { label: 'Gallery', route: '/gallery' },
            { label: 'Rest', route: '/gallery/none' },
            { label: 'Another', route: '/gallery/none-2' },
          ]}
        />
      </Block>

      <Block name="HeroStat: value, over 99, with meter, loading or empty">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <HeroStat label="Needs you" value="07" onClick={noop} />
          <HeroStat label="Over 99" value="99" plus />
          <HeroStat label="This week" value="2/4" meter={{ filled: 2, total: 4 }} />
          <HeroStat label="Loading" />
        </div>
      </Block>

      <Block name="TickMeter: 4, 20 and the 40 tick limit">
        <TickMeter filled={2} total={4} />
        <TickMeter filled={13} total={20} />
        <TickMeter filled={31} total={40} />
      </Block>

      <Block name="Row: solid, hollow, Late, Cold, Auto, done, with actions (hover or focus)">
        <ul className="border-t border-rule">
          <Row dot="solid" title="Needs you" detail="A solid dot" meta="09:30" />
          <Row dot="hollow" title="Fine, nothing to do" detail="A hollow dot" meta="10:00" />
          <Row dot="solid" title="Owed since last week" word="Late" meta="MON" />
          <Row dot="solid" title="A search going quiet" word="Cold" />
          <Row dot="hollow" title="Thank-you email" word="Auto" meta="08:02" />
          <Row dot="hollow" title="Dealt with" done meta="FRI" />
          <Row
            dot="solid"
            title="Hover or tab to this row"
            actions={[
              { label: 'Snooze', onClick: noop },
              { label: 'Bin', onClick: noop },
            ]}
          />
        </ul>
      </Block>

      <Block name="RowList: 9 rows with Show more, a labelled divider, loading, empty, error">
        <RowList rows={sampleRows} />
        <RowList rows={dividedRows} />
        <RowList state="loading" />
        <RowList rows={[]} emptyText="All clear" />
        <RowList state="error" />
      </Block>

      <Block name="MessageRow: the Inbox list. New, chosen, older, Late, Auto">
        <MessageRowSample />
      </Block>

      <Block name="PillButton: primary, plain, busy, disabled, current (a row of stage pills)">
        <div className="flex flex-wrap gap-4">
          <PillButton kind="primary" label="Start" />
          <PillButton label="Plain" />
          <PillButton kind="primary" label="Busy" busy />
          <PillButton label="Disabled" disabled />
        </div>
        <div className="flex flex-wrap gap-2">
          <PillButton label="New" />
          <PillButton label="Chased" current />
          <PillButton label="Replied" />
        </div>
      </Block>

      <Block name="NumberLine: a funnel. Click the line for the ratios">
        <NumberLine
          pairs={[
            { label: 'found', value: 64 },
            { label: 'chased', value: 41 },
            { label: 'replied', value: 9 },
            { label: 'meetings', value: 4 },
            { label: 'won', value: 1 },
          ]}
          note="Last 8 weeks"
          detail="64% of found were chased. 22% of chased replied. 44% of replies became meetings. 25% of meetings were won"
        />
      </Block>

      <Block name="TextLink: rest and active, EmptyLine, Dots">
        <div className="flex gap-6">
          <TextLink label="New" active />
          <TextLink label="Chased" onClick={noop} />
          <TextLink label="All" onClick={noop} />
        </div>
        <TextLink label="Show more" onClick={noop} />
        <EmptyLine text="All clear" />
        <Dots />
      </Block>

      <Block name="Deck: three items, then All clear. Keys j k Enter x s e. Undo shows for 8 seconds">
        <DeckSample />
      </Block>

      <Block name="Deck: empty">
        <Deck items={[]} renderItem={() => null} primaryAction={{ label: () => 'Done', onClick: noop }} />
      </Block>

      <Block name="Board and TaskTile: Now, This week, Later and Waiting; late, today, on track and waiting marks. Drag or Shift and arrows to reorder">
        <Board columns={columns(freshSampleTasks(), '2026-11-16')} today="2026-11-16" limit={2} onOpen={noop} onReorder={noop} />
      </Block>

      <Block name="Board: loading, empty, error">
        <Board columns={[]} today="2026-11-16" state="loading" onOpen={noop} />
        <Board columns={[]} today="2026-11-16" onOpen={noop} />
        <Board columns={[]} today="2026-11-16" state="error" onOpen={noop} />
      </Block>

      <Block name="Card: open and closing">
        <CardSample />
      </Block>

      <Block name="Note: shown and fading">
        <NoteSample />
      </Block>

      <Block name="Switch: on, off, disabled">
        <SwitchSample />
      </Block>

      <Block name="Field: text, date, choice, error">
        <FieldSample />
      </Block>

      <Block name="Draft: rest, then edited with Reset">
        <DraftSample />
      </Block>
    </div>
  )
}
