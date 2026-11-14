import { Fragment, useState } from 'react'
import type { Tone } from '../theme/tokens'
import { Icon, type IconName } from './Icon'
import { Dots, EmptyLine } from './Quiet'
import { Row, type RowProps } from './Row'
import { TextLink } from './TextLink'
import { Tile } from './Tile'

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
}

// One list per page, 7 tiles or rows before a quiet Show more (UX-4).
export function RowList({ rows = [], state = 'ready', emptyText = 'All clear', limit, onMore, view = 'tiles', icon }: Props) {
  const [showAll, setShowAll] = useState(false)
  const cap = limit ?? 7
  if (state === 'loading') return <Dots />
  if (state === 'error') return <EmptyLine text="Could not load. Try again." />
  if (rows.length === 0) return <EmptyLine text={emptyText} />
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
            <Tile {...tile} icon={tile.icon ?? icon} />
          </Fragment>
        ))}
      </ul>
      {more}
    </div>
  )
}
