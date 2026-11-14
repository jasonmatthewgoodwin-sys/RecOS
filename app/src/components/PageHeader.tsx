import type { ReactNode } from 'react'
import type { Tone } from '../theme/tokens'
import { IndexTabs } from './IndexTab'
import { StatusFilter } from './StatusFilter'

type Props = { title: string; tabs?: { label: string; route: string; tone?: Tone }[]; aside?: ReactNode }

// The page title, the index tabs, and at the top right of the tabs the
// colour key with the status filter (14 November 2026), plus any one link
// the page wants there, such as Edit tabs.
export function PageHeader({ title, tabs = [], aside }: Props) {
  return (
    <header className="flex flex-col gap-8">
      <h1 className="text-title text-ink">{title}</h1>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 border-b border-rule">
        <IndexTabs tabs={tabs} />
        <div className="flex items-center gap-6 pb-1">
          <StatusFilter />
          {aside}
        </div>
      </div>
    </header>
  )
}
