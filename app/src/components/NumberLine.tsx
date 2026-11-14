import { useState } from 'react'

export type NumberPair = { label: string; value: number }

type Props = {
  pairs: NumberPair[]
  /** A quiet tail, such as last 8 weeks. */
  note?: string
  /** A second line shown only when the owner clicks the first (28.9). */
  detail?: string
}

// A funnel or a row of stage counts without a chart (sections 3.11 and 25.3):
// label and value pairs with arrows between them. Numbers in mono.
export function NumberLine({ pairs, note, detail }: Props) {
  const [open, setOpen] = useState(false)
  const line = (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {pairs.map((p, i) => (
        <span key={p.label} className="flex items-baseline gap-x-3">
          {i > 0 && (
            <span aria-hidden className="text-ink-3">
              ›
            </span>
          )}
          <span>
            <span className="font-mono text-body tabular-nums text-ink">{p.value}</span>{' '}
            <span className="text-body text-ink-2">{p.label}</span>
          </span>
        </span>
      ))}
      {note && <span className="label-caps ml-2 text-ink-3">{note}</span>}
    </span>
  )
  return (
    <div data-number-line className="flex flex-col gap-2">
      {detail ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="min-h-10 rounded-card text-left"
        >
          {line}
        </button>
      ) : (
        <p className="min-h-10 flex items-center">{line}</p>
      )}
      {open && detail && <p className="text-body text-ink-2">{detail}</p>}
    </div>
  )
}
