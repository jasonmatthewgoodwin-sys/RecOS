import { useState } from 'react'
import type { Column, Task } from '../lib/tasks'
import { TextLink } from './TextLink'
import { TaskTile } from './TaskTile'
import { Dots, EmptyLine } from './Quiet'

type Props = {
  columns: Column[]
  today: string
  state?: 'loading' | 'ready' | 'error'
  /** Cards shown per column before Show more. */
  limit?: number
  onOpen: (task: Task) => void
  /** The new order of one column's tasks, after a drag or a keyboard move. */
  onReorder?: (column: Column['key'], keys: string[]) => void
}

// Columns of small cards: Now, This week, Later and Waiting. Nothing moves
// on its own. Drag a card, or hold Shift and press the arrow keys, to put it
// where you want it; the order is kept.
export function Board({ columns, today, state = 'ready', limit = 4, onOpen, onReorder }: Props) {
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [drag, setDrag] = useState<{ column: Column['key']; key: string } | null>(null)

  if (state === 'loading') return <Dots />
  if (state === 'error') return <EmptyLine text="Could not load. Try again." />
  if (columns.every((c) => c.tasks.length === 0)) return <EmptyLine text="All clear" />

  function move(column: Column, from: number, to: number) {
    if (!onReorder || from === to || to < 0 || to >= column.tasks.length) return
    const keys = column.tasks.map((t) => t.key)
    const [k] = keys.splice(from, 1)
    keys.splice(to, 0, k)
    onReorder(column.key, keys)
  }

  function onKey(e: React.KeyboardEvent, column: Column, index: number) {
    if (!e.shiftKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    move(column, index, index + (e.key === 'ArrowDown' ? 1 : -1))
  }

  return (
    <div data-board className="grid grid-cols-1 gap-8 md:grid-cols-3">
      {columns.map((column) => {
        const all = shown[column.key] ? column.tasks : column.tasks.slice(0, limit)
        return (
          <section key={column.key} aria-label={column.label} data-column={column.key} className="flex min-w-0 flex-col gap-3">
            <h2 className="label-caps flex items-baseline gap-3 text-ink-2">
              {column.label}
              <span className="font-mono tabular-nums text-ink-3">{String(column.tasks.length).padStart(2, '0')}</span>
            </h2>
            {column.tasks.length === 0 ? (
              <p className="text-body text-ink-3">Nothing here</p>
            ) : (
              <ul className="flex flex-col gap-3" onKeyDown={(e) => {
                const target = e.target as HTMLElement
                const key = target.closest<HTMLElement>('[data-task]')?.dataset.task
                const index = column.tasks.findIndex((t) => t.key === key)
                if (index >= 0) onKey(e, column, index)
              }}>
                {all.map((task, i) => (
                  <TaskTile
                    key={task.key}
                    task={task}
                    today={today}
                    onOpen={() => onOpen(task)}
                    draggable={!!onReorder}
                    dragging={drag?.key === task.key}
                    onDragStart={() => setDrag({ column: column.key, key: task.key })}
                    onDragOver={(e) => {
                      if (drag?.column === column.key) e.preventDefault()
                    }}
                    onDrop={() => {
                      if (!drag || drag.column !== column.key) return
                      const from = column.tasks.findIndex((t) => t.key === drag.key)
                      move(column, from, i)
                      setDrag(null)
                    }}
                  />
                ))}
              </ul>
            )}
            {!shown[column.key] && column.tasks.length > limit && (
              <div>
                <TextLink label="Show more" onClick={() => setShown({ ...shown, [column.key]: true })} />
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
