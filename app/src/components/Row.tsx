export type RowAction = { label: string; onClick: () => void }

export type RowProps = {
  dot: 'hollow' | 'solid'
  title: string
  detail?: string
  meta?: string
  /** One word in small capitals: Late, Cold or Auto. */
  word?: 'Late' | 'Cold' | 'Auto'
  /** A few words in small capitals after the detail, such as Existing client (28.2). */
  detailWord?: string
  done?: boolean
  /** Two text actions at most, shown on hover or focus. */
  actions?: RowAction[]
  onOpen?: () => void
  /** The record behind the row, for page keys such as x (25.6). */
  leadId?: string
}

// One line: a dot, a title, a quiet detail, a time (section 3.9).
// State is shown by shape and words, never by colour alone (UX-7).
export function Row({ dot, title, detail, meta, word, detailWord, done, actions = [], onOpen, leadId }: RowProps) {
  const shown = actions.slice(0, 2)
  return (
    <li className="group flex min-h-12 items-center gap-4 border-b border-rule">
      <button
        type="button"
        onClick={onOpen}
        data-row
        data-lead-id={leadId}
        data-done={done || undefined}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-4 text-left"
      >
        {done ? (
          <span aria-hidden data-strike className="block h-px w-3 shrink-0 bg-ink-3" />
        ) : (
          <span
            aria-hidden
            data-dot={dot}
            className={`block size-2 shrink-0 rounded-pill border border-ink ${dot === 'solid' ? 'bg-ink' : 'bg-transparent'}`}
          />
        )}
        <span className={`truncate text-body ${done ? 'text-ink-3' : 'text-ink'}`}>{title}</span>
        {word && <span className="label-caps shrink-0 text-ink">{word}</span>}
        {detail && <span className="hidden truncate text-body text-ink-2 sm:inline">{detail}</span>}
        {detailWord && <span className="label-caps hidden shrink-0 text-ink-2 sm:inline">{detailWord}</span>}
      </button>
      {shown.length > 0 && (
        <span className="hidden shrink-0 gap-4 group-focus-within:flex group-hover:flex">
          {shown.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className="min-h-10 text-body text-ink-2 underline decoration-rule underline-offset-4 hover:text-ink"
            >
              {a.label}
            </button>
          ))}
        </span>
      )}
      {meta && <span className="shrink-0 font-mono text-label tabular-nums text-ink-3">{meta}</span>}
    </li>
  )
}
