import { gradClass } from '../lib/tone'
import type { Tone } from '../theme/tokens'
import { Icon } from './Icon'

type Step = { key: string; label: string }

type Props = {
  steps: Step[]
  /** The key of the step the thing is at. Steps before it are done. */
  at: string
  /** The colour of the current step. */
  tone?: Tone
  label?: string
}

// A workflow strip (14 November 2026): the stages in order, ticks for the
// ones passed, the current one in its state colour. Read only; the pills
// beneath it still move the thing.
export function Steps({ steps, at, tone = 'pending', label = 'Stages' }: Props) {
  const index = Math.max(0, steps.findIndex((s) => s.key === at))
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label={label}>
      {steps.map((s, i) => {
        const done = i < index
        const current = i === index
        return (
          <li key={s.key} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
            <span
              aria-hidden
              className={`flex size-6 items-center justify-center rounded-pill border text-ink ${
                current ? `${gradClass[tone]} border-transparent` : done ? 'border-ink bg-ink text-sheet' : 'border-rule bg-transparent text-ink-3'
              }`}
            >
              {done ? <Icon name="check" size={12} /> : <span className="font-mono text-[10px]">{i + 1}</span>}
            </span>
            <span className={`label-caps ${current ? 'text-ink' : done ? 'text-ink-2' : 'text-ink-3'}`}>{s.label}</span>
            {i < steps.length - 1 && <span aria-hidden className="mx-1 h-px w-4 bg-rule" />}
          </li>
        )
      })}
    </ol>
  )
}
