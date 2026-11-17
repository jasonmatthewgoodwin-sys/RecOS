export type MessageRowProps = {
  id: string
  /** Solid for new, hollow for older or closed (3.10). */
  dot: 'hollow' | 'solid'
  /** Who or which company, on the first line. */
  who: string
  /** One line: the title or a snippet. */
  title: string
  /** One word in small capitals, such as JOB or SIGNAL. */
  type: string
  /** A short age in mono, such as 3h or 2d. */
  age: string
  /** A word after the type, such as Late or Auto. */
  word?: string
  selected?: boolean
  onSelect: () => void
  /** When set, the row can be dragged onto a folder. */
  draggable?: boolean
}

// One message in the Inbox's list pane, like a mail client (Jason,
// 2026-11-14; see docs/decisions.md). Two short lines: who and the age, then
// the title with the type word. New is a solid dot and a little more weight;
// the chosen row has an ink rule down its left edge. No colour (UX-7).
export function MessageRow({ id, dot, who, title, type, age, word, selected, onSelect, draggable }: MessageRowProps) {
  return (
    <li className="border-b border-rule">
      <button
        type="button"
        onClick={onSelect}
        data-message={id}
        data-selected={selected || undefined}
        aria-current={selected || undefined}
        draggable={draggable}
        onDragStart={
          draggable
            ? (e) => {
                e.dataTransfer.setData('text/plain', id)
                e.dataTransfer.effectAllowed = 'move'
              }
            : undefined
        }
        className={`flex w-full flex-col gap-1 border-l-2 py-3 pr-3 pl-4 text-left ${
          selected ? 'border-ink bg-paper' : 'border-transparent hover:bg-paper'
        }`}
      >
        <span className="flex w-full items-center gap-3">
          <span
            aria-hidden
            data-dot={dot}
            className={`block size-2 shrink-0 rounded-pill border border-ink ${dot === 'solid' ? 'bg-ink' : 'bg-transparent'}`}
          />
          <span className={`min-w-0 flex-1 truncate text-body ${dot === 'solid' ? 'font-medium text-ink' : 'text-ink-2'}`}>{who}</span>
          <span className="shrink-0 font-mono text-label tabular-nums text-ink-3">{age}</span>
        </span>
        <span className="flex w-full items-center gap-3 pl-5">
          <span className="min-w-0 flex-1 truncate text-body text-ink-2">{title}</span>
          {word && <span className="label-caps shrink-0 text-ink">{word}</span>}
          <span className="label-caps shrink-0 text-ink-3">{type}</span>
        </span>
      </button>
    </li>
  )
}
