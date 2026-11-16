import { useEffect, useState } from 'react'
import { Field } from '../../components/Field'
import { PillButton } from '../../components/PillButton'
import { TextLink } from '../../components/TextLink'
import { data } from '../../lib/data'
import { invalidate, useQuery } from '../../lib/query'
import { askWord, chatKey, jobWord, type Task, type TaskJobKind } from '../../lib/tasks'

type Props = {
  task: Task
  /** Called when the assistant has answered, so the board can read the task again. */
  onAnswered: () => void
  onNote: (words: string) => void
}

// The chat on a task (0052). The owner's lines on the right in plain
// weight, the assistant's on the left. Three asks: is it still relevant
// (checked against his mail and calls), change what the task is for, or
// hand it over. One open job at a time; while it is open the chat looks
// again every half a minute. Nothing moves on its own otherwise.
export function TaskChat({ task, onAnswered, onNote }: Props) {
  const chat = useQuery(chatKey(task.key), () => data.taskChat(task.key))
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const job = chat.data?.job ?? null
  const open = job !== null && (job.status === 'waiting' || job.status === 'working')

  useEffect(() => {
    if (!open) return
    const t = setInterval(() => invalidate(chatKey(task.key)), 30_000)
    return () => clearInterval(t)
  }, [open, task.key])

  // When a job finishes, the task may have changed or gone: the board reads again.
  const finished = job?.status === 'ready' ? job.id : null
  useEffect(() => {
    if (finished) onAnswered()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  async function ask(kind: TaskJobKind) {
    const words = text.trim()
    if (kind === 'change' && words === '') {
      onNote('Say what should change first')
      return
    }
    setBusy(true)
    try {
      await data.askTask(task.key, kind, words || undefined)
      setText('')
      invalidate(chatKey(task.key))
    } catch {
      onNote('Could not ask. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const lines = chat.data?.lines ?? []
  const standing = jobWord(job)

  return (
    <div className="flex flex-col gap-4" data-testid="task-chat">
      {lines.length > 0 && (
        <ol className="flex flex-col gap-3" aria-label="Chat">
          {lines.map((l) => (
            <li key={l.id} className={`flex flex-col gap-1 ${l.author === 'owner' ? 'items-end text-right' : 'items-start'}`} data-author={l.author}>
              <span className="label-caps text-ink-3">{l.author === 'owner' ? 'You' : 'Task assistant'}</span>
              <p className={`max-w-[85%] whitespace-pre-wrap text-body ${l.author === 'owner' ? 'text-ink-2' : 'text-ink'}`}>{l.body}</p>
            </li>
          ))}
        </ol>
      )}
      {standing && (
        <p className="text-body text-ink-2" data-testid="task-chat-standing">
          {standing}
        </p>
      )}
      {!open && (
        <>
          <Field
            label="Tell the task assistant"
            kind="lines"
            rows={2}
            value={text}
            onChange={setText}
            placeholder="Change what this is for, or say how to do it"
          />
          <div className="flex flex-wrap items-center gap-3">
            <PillButton label={askWord.check} onClick={() => ask('check')} disabled={busy} />
            <PillButton label={askWord.change} onClick={() => ask('change')} disabled={busy} />
            <PillButton label={askWord.do} onClick={() => ask('do')} disabled={busy} />
          </div>
        </>
      )}
      {open && <TextLink label="Look again" onClick={() => invalidate(chatKey(task.key))} />}
    </div>
  )
}
