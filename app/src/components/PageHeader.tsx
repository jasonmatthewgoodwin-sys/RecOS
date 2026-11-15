import type { ReactNode } from 'react'
import type { Tone } from '../theme/tokens'
import { PageAgent } from './AgentButton'
import { IndexTabs } from './IndexTab'

type Props = { title: string; tabs?: { label: string; route: string; tone?: Tone }[]; aside?: ReactNode }

// The page title and the index tabs, plus any one link the page wants at
// the right, such as Edit tabs. The colour key with the status filter sits
// at the top right of the sheet (14 November 2026).
export function PageHeader({ title, tabs = [], aside }: Props) {
  return (
    <header className="flex flex-col gap-5">
      <h1 className="text-title text-ink">{title}</h1>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 border-b border-rule">
        <IndexTabs tabs={tabs} />
        <div className="flex items-center gap-6 pb-1">
          {aside}
          <PageAgent />
        </div>
      </div>
    </header>
  )
}
