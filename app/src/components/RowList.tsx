import { useState } from 'react'
import { Dots, EmptyLine } from './Quiet'
import { Row, type RowProps } from './Row'
import { TextLink } from './TextLink'

type Props = {
  rows?: (RowProps & { id: string })[]
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
        {shown.map(({ id, ...row }) => (
          <Row key={id} {...row} />
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
