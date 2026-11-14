import { Fragment, useState } from 'react'
import { Dots, EmptyLine } from './Quiet'
import { Row, type RowProps } from './Row'
import { TextLink } from './TextLink'

type Props = {
  /** A row with a section name sits under a labelled hairline when the name changes, such as LOWER FIT (28.2). */
  rows?: (RowProps & { id: string; section?: string })[]
  state?: 'loading' | 'ready' | 'error'
  emptyText?: string
  limit?: number
  onMore?: () => void
}

// One list per page, 7 rows before a quiet Show more (UX-4).
export function RowList({ rows = [], state = 'ready', emptyText = 'All clear', limit = 7, onMore }: Props) {
  const [showAll, setShowAll] = useState(false)
  if (state === 'loading') return <Dots />
  if (state === 'error') return <EmptyLine text="Could not load. Try again." />
  if (rows.length === 0) return <EmptyLine text={emptyText} />
  const shown = showAll ? rows : rows.slice(0, limit)
  return (
    <div>
      <ul className="border-t border-rule">
        {shown.map(({ id, section, ...row }, i) => (
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
      {!showAll && rows.length > limit && (
        <div className="mt-4">
          <TextLink
            label="Show more"
            onClick={() => {
              setShowAll(true)
              onMore?.()
            }}
          />
        </div>
      )}
    </div>
  )
}
