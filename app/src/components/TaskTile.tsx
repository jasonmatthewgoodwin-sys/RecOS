import type { Task, TaskStatus } from '../lib/tasks'
import { dueWord, shownTitle, status, statusWord, typeWord } from '../lib/tasks'

type Props = {
  task: Task
  today: string
  onOpen: () => void
  /** Drag to reorder within a column (Board wires these). */
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: () => void
  dragging?: boolean
}

// The four tones main already carries (Pending Jason): action for late,
// pending for today, new for on track, mist for waiting.
const mark: Record<TaskStatus, string> = {
  late: 'bg-tone-action',
  today: 'bg-tone-pending',
  on_track: 'bg-tone-new',
  waiting: 'bg-tone-mist',
}

// A small index card on the Tasks board: a type word, a title, one line of
// why and the due day. Status is a dot, a word and one thin colour mark on
// the left edge, so it still reads in greyscale. Added for the Tasks tab
// (docs/decisions.md, Pending for Jason).
export function TaskTile({ task, today, onOpen, draggable, onDragStart, onDragOver, onDrop, dragging }: Props) {
  const st = status(task, today)
  const solid = st === 'late' || st === 'today'
  return (
    <li
      data-task-tile
      data-status={st}
      data-dragging={dragging || undefined}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`relative list-none ${dragging ? 'opacity-40' : ''}`}
    >
      <span aria-hidden data-mark className={`absolute inset-y-3 left-0 w-0.5 rounded-pill ${mark[st]}`} />
      <button
        type="button"
        data-task={task.key}
        onClick={onOpen}
        className="flex h-44 w-full flex-col gap-1 rounded-card border border-rule bg-sheet py-3 pl-4 pr-3 text-left hover:border-ink"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="label-caps text-ink-2">{typeWord[task.kind]}</span>
          <span className="flex items-center gap-2">
            <span className="label-caps text-ink-3">{dueWord(task, today)}</span>
            <span
              aria-hidden
              data-dot={solid ? 'solid' : 'hollow'}
              className={`block size-2 rounded-pill border border-ink ${solid ? 'bg-ink' : 'bg-transparent'}`}
            />
          </span>
        </span>
        <span className="line-clamp-2 text-body text-ink">{shownTitle(task)}</span>
        {task.why && <span className="line-clamp-2 text-label text-ink-2">{task.why}</span>}
        <span className="label-caps mt-auto text-ink-2">
          {statusWord[st]}
          {task.waitingOn ? ` on ${task.waitingOn.toLowerCase()}` : ''}
        </span>
      </button>
    </li>
  )
}
