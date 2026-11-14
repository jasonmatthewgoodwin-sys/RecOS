import { useEffect, useState } from 'react'
import { theme } from '../theme/tokens'

type Props = {
  text: string
  /** At most one text link (33.1). */
  link?: { label: string; onClick?: () => void; href?: string }
  onClose: () => void
}

function motionMs(ms: number): number {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms
}

// The only way the system speaks to the owner: one dark card, top right of
// the sheet, one sentence, at most one link. It stays until closed (NOTE-3).
// Esc closes it. Never for good news, tips or targets (NOTE-6).
export function Note({ text, link, onClose }: Props) {
  const [fading, setFading] = useState(false)

  function close() {
    if (fading) return
    setFading(true)
    setTimeout(onClose, motionMs(theme.motion.tab))
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const linkCls = 'inline-flex min-h-10 items-center text-body text-note-text underline decoration-note-text/50 underline-offset-4'

  return (
    <div
      role="status"
      data-note
      data-fading={fading || undefined}
      className={`absolute right-4 top-4 z-30 flex max-w-sm flex-col gap-2 rounded-card bg-note px-6 py-4 sm:right-8 sm:top-8 ${
        fading ? 'animate-fade-out' : 'animate-fade'
      }`}
    >
      <p className="text-body text-note-text">{text}</p>
      <div className="flex items-center gap-6">
        {link &&
          (link.href ? (
            <a href={link.href} target="_blank" rel="noreferrer" className={linkCls}>
              {link.label}
            </a>
          ) : (
            <button type="button" onClick={link.onClick} className={linkCls}>
              {link.label}
            </button>
          ))}
        <button type="button" onClick={close} className={`${linkCls} no-underline opacity-70 hover:opacity-100`}>
          Close
        </button>
      </div>
    </div>
  )
}
