import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { toneBg } from '../lib/tone'
import type { Tone } from '../theme/tokens'
import { theme } from '../theme/tokens'
import { Icon } from './Icon'
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
  /** The state the card is about, which tints its top edge: action, pending or clear. */
  tone?: Tone
  /** Asked before the window closes. Return false to keep it open, such as over unsaved text. */
  beforeClose?: () => boolean
  onClose: () => void
}

function motionMs(ms: number): number {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms
}

// A window that opens over the sheet (restyled on 14 November 2026: a
// centred window with a soft backdrop, in place of the right-half pane).
// It holds the detail, the draft and the actions for one thing. The page
// behind stays put. Opens over 200 ms, closes the same way; Esc, the close
// button, a click on the backdrop, the back button or a swipe down closes it.
// On a phone it fills the sheet.
export function Card({ label, title, sections = [], primaryAction, links, foot, tone, beforeClose, onClose }: Props) {
  const [closing, setClosing] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const opener = useRef<Element | null>(null)
  const touchStart = useRef<{ y: number; atTop: boolean } | null>(null)

  function close() {
    if (closing) return
    if (beforeClose && !beforeClose()) return
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

  return createPortal(
    <div
      data-card-backdrop
      className={`fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-paper/70 p-0 backdrop-blur-sm sm:px-8 sm:pb-8 sm:pt-[12vh] ${closing ? 'animate-fade-out' : 'animate-fade'}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <aside
        ref={ref}
        role="dialog"
        aria-label={title}
        tabIndex={-1}
        data-card
        data-tone={tone}
        data-closing={closing || undefined}
        onTouchStart={(e) => {
          touchStart.current = { y: e.touches[0].clientY, atTop: (ref.current?.scrollTop ?? 0) <= 0 }
        }}
        onTouchMove={(e) => {
          const start = touchStart.current
          if (start && start.atTop && e.touches[0].clientY - start.y > 80) {
            touchStart.current = null
            close()
          }
        }}
        onTouchEnd={() => {
          touchStart.current = null
        }}
        className={`relative flex w-full flex-col overflow-hidden rounded-sheet border border-rule bg-sheet p-5 shadow-window outline-none sm:w-[46rem] sm:p-7 ${
          closing ? 'animate-rise-out' : 'animate-rise'
        }`}
      >
        <span aria-hidden data-tone-bar className={`absolute inset-x-0 top-0 h-1.5 rounded-t-sheet ${tone ? toneBg[tone] : 'bg-rule'}`} />
        <div className="flex items-start justify-between gap-4">
          <span className="label-caps min-h-10 text-ink-2">{label}</span>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill text-ink-2 hover:bg-paper hover:text-ink"
          >
            <Icon name="close" />
          </button>
        </div>
        <h2 className="text-title text-ink">{title}</h2>

        {/* Everything fits the window without scrolling (14 November 2026): tight sections. Every section runs the full width of the window, which opens near the top and never scrolls inside itself (Mia, 15 November 2026). */}
        {sections.slice(0, 1).map((s, i) => (
          <section key={i} className="mt-4 border-t border-rule pt-4">
            {s.label && <h3 className="label-caps mb-1 text-ink-2">{s.label}</h3>}
            <div className="text-body text-ink">{s.body}</div>
          </section>
        ))}
        {sections.length > 1 && (
          <div>
            {sections.slice(1).map((s, i) => (
              <section key={i + 1} className="mt-4 border-t border-rule pt-4">
                {s.label && <h3 className="label-caps mb-1 text-ink-2">{s.label}</h3>}
                <div className="text-body text-ink">{s.body}</div>
              </section>
            ))}
          </div>
        )}

        {(primaryAction || links) && (
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
            {primaryAction && (
              <PillButton kind="primary" label={primaryAction.label} busy={primaryAction.busy} onClick={primaryAction.onClick} />
            )}
            {links}
          </div>
        )}

        {foot && <p className="mt-auto pt-5 font-mono text-label text-ink-3">{foot}</p>}
      </aside>
    </div>
  , document.body)
}
