import { Fragment, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Tone } from '../theme/tokens'
import { Icon, type IconName } from './Icon'
import { Dots, EmptyLine } from './Quiet'
import { Row, type RowProps } from './Row'
import { TextLink } from './TextLink'
import { Tile, type TileVariant } from './Tile'
import { isTone, publishStatusCounts } from '../lib/status'
import { toneFor } from '../lib/tone'

export type ListItem = RowProps & { id: string; section?: string; tone?: Tone; icon?: IconName }

type Props = {
  /** A row with a section name sits under a labelled hairline when the name changes, such as LOWER FIT (28.2). */
  rows?: ListItem[]
  state?: 'loading' | 'ready' | 'error'
  emptyText?: string
  limit?: number
  onMore?: () => void
  /** Gallery tiles by default (14 November 2026); rows where a page asks for them. */
  view?: 'tiles' | 'rows'
  /** The icon every tile takes when the row gives none. */
  icon?: IconName
  /** The tile style: orb (default), band for things that move through stages, avatar for people. */
  variant?: TileVariant
}

// One list per page, 7 tiles or rows before a quiet Show more (UX-4).
export function RowList({ rows: all = [], state = 'ready', emptyText = 'All clear', limit, onMore, view = 'tiles', icon, variant }: Props) {
  const [showAll, setShowAll] = useState(false)
  const [params] = useSearchParams()
  const status = isTone(params.get('status')) ? params.get('status') : null
  const cap = limit ?? 7
  const toneOf = (r: ListItem) => r.tone ?? toneFor({ done: r.done, dot: r.dot, word: r.word })
  // The counts go to the status filter at the top right of the tabs (14 November 2026).
  const counts: Record<string, number> = { all: all.length }
  for (const r of all) counts[toneOf(r)] = (counts[toneOf(r)] ?? 0) + 1
  const key = JSON.stringify(counts)
  useEffect(() => {
    publishStatusCounts(view === 'tiles' ? (JSON.parse(key) as Record<string, number>) : {})
    return () => publishStatusCounts({})
  }, [key, view])
  if (state === 'loading') return <Dots />
  if (state === 'error') return <EmptyLine text="Could not load. Try again." />
  if (all.length === 0) return <EmptyLine text={emptyText} />
  const rows = status && view === 'tiles' ? all.filter((r) => toneOf(r) === status) : all
  if (rows.length === 0) return <EmptyLine text="Nothing in that state" />
  const shown = showAll ? rows : rows.slice(0, cap)
  const more = !showAll && rows.length > cap && (
    <div className="mt-4">
      <TextLink
        label="Show more"
        onClick={() => {
          setShowAll(true)
          onMore?.()
        }}
      />
    </div>
  )

  if (view === 'rows') {
    return (
      <div>
        <ul className="border-t border-rule">
          {shown.map(({ id, section, tone: _tone, icon: _icon, ...row }, i) => (
            <Fragment key={id}>
              {section && section !== shown[i - 1]?.section && (
                <li aria-hidden data-divider className="label-caps flex min-h-8 items-end pb-1 text-ink-3">
                  {section}
                </li>
              )}
              <Row {...row} />
            </Fragment>
          ))}
        </ul>
        {more}
      </div>
    )
  }

  return (
    <div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-gallery>
        {shown.map(({ id, section, ...tile }, i) => (
          <Fragment key={id}>
            {section && section !== shown[i - 1]?.section && (
              <li aria-hidden data-divider className="label-caps col-span-full flex min-h-8 items-end gap-2 pb-1 text-ink-3">
                <Icon name="grid" size={12} />
                {section}
              </li>
            )}
            <Tile {...tile} icon={tile.icon ?? icon} variant={variant} />
          </Fragment>
        ))}
      </ul>
      {more}
    </div>
  )
}
