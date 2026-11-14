import { Fragment, useState } from 'react'
import type { Tone } from '../theme/tokens'
import { Icon, type IconName } from './Icon'
import { Dots, EmptyLine } from './Quiet'
import { Row, type RowProps } from './Row'
import { TextLink } from './TextLink'
import { Tile, type TileVariant } from './Tile'
import { orbClass, toneFor, toneWord } from '../lib/tone'

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
const order: Tone[] = ['new', 'action', 'pending', 'clear']

export function RowList({ rows: all = [], state = 'ready', emptyText = 'All clear', limit, onMore, view = 'tiles', icon, variant }: Props) {
  const [showAll, setShowAll] = useState(false)
  const [status, setStatus] = useState<Tone | null>(null)
  const cap = limit ?? 7
  if (state === 'loading') return <Dots />
  if (state === 'error') return <EmptyLine text="Could not load. Try again." />
  if (all.length === 0) return <EmptyLine text={emptyText} />
  const toneOf = (r: ListItem) => r.tone ?? toneFor({ done: r.done, dot: r.dot, word: r.word })
  const counts = new Map<Tone, number>()
  for (const r of all) counts.set(toneOf(r), (counts.get(toneOf(r)) ?? 0) + 1)
  const rows = status ? all.filter((r) => toneOf(r) === status) : all
  // The status filter (14 November 2026): the colour key, and a click narrows the gallery to one state.
  const filter = view === 'tiles' && counts.size > 1 && (
    <nav aria-label="Status" className="mb-4 flex flex-wrap gap-x-5 gap-y-1">
      <button type="button" aria-label="Status: all" aria-current={status === null || undefined} onClick={() => setStatus(null)} className={`min-h-8 font-mono text-label ${status === null ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`}>
        All {all.length}
      </button>
      {order.filter((t) => counts.has(t)).map((t) => (
        <button key={t} type="button" aria-label={`Status: ${toneWord[t]}`} aria-current={status === t || undefined} onClick={() => setStatus(status === t ? null : t)} className={`flex min-h-8 items-center gap-2 font-mono text-label ${status === t ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`}>
          <span aria-hidden className={`block size-3 rounded-pill ${orbClass[t]}`} />
          {toneWord[t]} {counts.get(t)}
        </button>
      ))}
    </nav>
  )
  if (rows.length === 0) return <div>{filter}<EmptyLine text="Nothing in that state" /></div>
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
      {filter}
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
