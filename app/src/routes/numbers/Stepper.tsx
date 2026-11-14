import { useEffect } from 'react'
import { isTyping } from '../../lib/keyboard'

type Props = {
  index: number
  count: number
  onStep: (by: number) => void
  /** What the keys are called in the label: 1 of 4. */
  label?: string
}

// Previous and next arrows with 1 of 4 between them (32.1). Keys: left and
// right, when the owner is not typing. The caller wraps round.
export function Stepper({ index, count, onStep, label = 'Stepper' }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      if (e.key === 'ArrowLeft') onStep(-1)
      if (e.key === 'ArrowRight') onStep(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onStep])

  return (
    <div className="flex min-h-10 items-center gap-4 font-mono text-label text-ink-2" aria-label={label}>
      <button type="button" aria-label="Previous" onClick={() => onStep(-1)} className="flex size-10 items-center justify-center text-body text-ink hover:text-ink-2">
        ‹
      </button>
      <span className="tabular-nums" data-testid="stepper">
        {count ? `${index + 1} of ${count}` : '– of –'}
      </span>
      <button type="button" aria-label="Next" onClick={() => onStep(1)} className="flex size-10 items-center justify-center text-body text-ink hover:text-ink-2">
        ›
      </button>
    </div>
  )
}
