import { useEffect, useRef, useState, type ReactNode } from 'react'
import { theme } from '../theme/tokens'
import { PillButton } from './PillButton'

export type CardSection = { label?: string; body: ReactNode }

type Props = {
  /** One word in small capitals above the title, such as JOB or SIGNAL. */
  label?: string
  title: string
  sections?: CardSection[]
  primaryAction?: { label: string; onClick: () => void; busy?: boolean }
  /** Quiet text links beside the primary button. */
  links?: ReactNode
  /** A quiet line at the bottom naming the agent and the source (27.4). */
  foot?: ReactNode
  onClose: () => void
}

function motionMs(ms: number): number {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms
}

// An index card over the right half of the sheet (section 3.9). It holds the
// detail, the draft and the actions for one thing. The page behind stays put.
// Opens over 200 ms, closes the same way, and Esc closes it. On a phone it
// fills the sheet.
export function Card({ label, title, sections = [], primaryAction, links, foot, onClose }: Props) {
  const [closing, setClosing] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const opener = useRef<Element | null>(null)

  function close() {
    if (closing) return
    setClosing(true)
    setTimeout(onClose, motionMs(theme.motion.card))
  }

  useEffect(() => {
    opener.current = document.activeElement
    ref.current?.focus()
    return () => {
      if (opener.current instanceof HTMLElement) opener.current.focus()
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <aside
      ref={ref}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      data-card
      data-closing={closing || undefined}
      className={`absolute inset-y-0 right-0 z-20 flex w-full flex-col overflow-y-auto rounded-sheet border border-ink bg-sheet p-6 outline-none sm:p-12 md:w-1/2 ${
        closing ? 'animate-slide-out' : 'animate-slide'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="label-caps min-h-10 text-ink-2">{label}</span>
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill text-body text-ink-2 hover:text-ink"
        >
          <span aria-hidden>×</span>
        </button>
      </div>
      <h2 className="text-title text-ink">{title}</h2>

      {sections.map((s, i) => (
        <section key={i} className="mt-6 border-t border-rule pt-6">
          {s.label && <h3 className="label-caps mb-2 text-ink-2">{s.label}</h3>}
          <div className="text-body text-ink">{s.body}</div>
        </section>
      ))}

      {(primaryAction || links) && (
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
          {primaryAction && (
            <PillButton kind="primary" label={primaryAction.label} busy={primaryAction.busy} onClick={primaryAction.onClick} />
          )}
          {links}
        </div>
      )}

      {foot && <p className="mt-auto pt-8 font-mono text-label text-ink-3">{foot}</p>}
    </aside>
  )
}
