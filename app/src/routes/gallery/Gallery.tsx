import type { ReactNode } from 'react'
import { FileTab } from '../../components/FileTab'
import { HeroStat } from '../../components/HeroStat'
import { IndexTabs } from '../../components/IndexTab'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { Row } from '../../components/Row'
import { RowList } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { TickMeter } from '../../components/TickMeter'
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

      <Block name="RowList: 9 rows with Show more, loading, empty, error">
        <RowList rows={sampleRows} />
        <RowList state="loading" />
        <RowList rows={[]} emptyText="All clear" />
        <RowList state="error" />
      </Block>

      <Block name="PillButton: primary, plain, busy, disabled">
        <div className="flex flex-wrap gap-4">
          <PillButton kind="primary" label="Start" />
          <PillButton label="Plain" />
          <PillButton kind="primary" label="Busy" busy />
          <PillButton label="Disabled" disabled />
        </div>
      </Block>

      <Block name="TextLink, EmptyLine, Dots">
        <TextLink label="Show more" onClick={noop} />
        <EmptyLine text="All clear" />
        <Dots />
      </Block>
    </div>
  )
}
