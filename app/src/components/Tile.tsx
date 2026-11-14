import type { Tone } from '../theme/tokens'
import { gradClass, orbClass, toneFor, toneWord } from '../lib/tone'
import { Icon, type IconName } from './Icon'
import type { RowProps } from './Row'

export type TileVariant = 'orb' | 'band' | 'avatar'

export type TileProps = RowProps & {
  /** How the state colour is drawn: a small orb, a band across the top, or a large orb with initials. */
  variant?: TileVariant
  /** Overrides the tone worked out from the dot and the word. */
  tone?: Tone
  /** An icon for the orb, such as briefcase or user. */
  icon?: IconName
}

// A gallery tile (14 November 2026): the same facts as a Row, laid out as a
// small card with a soft gradient orb that carries the state. It keeps the
// Row's roles and data attributes, so what works on a row works on a tile.
function initials(title: string): string {
  return title
    .split(/[\s,]+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export function Tile({ dot, title, detail, meta, word, detailWord, done, actions = [], onOpen, leadId, tone, icon, variant = 'orb' }: TileProps) {
  const t = tone ?? toneFor({ done, dot, word })
  const shown = actions.slice(0, 2)
  const orb = done ? orbClass.mist : orbClass[t]
  return (
    <li className="group relative flex min-h-40 flex-col overflow-hidden rounded-card border border-rule bg-sheet p-4 transition-shadow hover:shadow-window" data-tone={t} data-variant={variant}>
      {variant === 'band' && <span aria-hidden className={`absolute inset-x-0 top-0 h-2 ${done ? gradClass.mist : gradClass[t]}`} />}
      <button
        type="button"
        onClick={onOpen}
        data-row
        data-lead-id={leadId}
        data-done={done || undefined}
        className="flex min-w-0 flex-1 flex-col items-start gap-3 text-left"
      >
        <span className="flex w-full items-center justify-between">
          {variant === 'avatar' ? (
            <span aria-hidden className={`flex size-14 items-center justify-center rounded-pill ${orb} font-mono text-label text-ink`}>
              {initials(title) || (icon ? <Icon name={icon} size={16} /> : null)}
            </span>
          ) : variant === 'band' ? (
            <span aria-hidden className="flex size-8 items-center justify-center rounded-pill bg-paper text-ink-2">{icon ? <Icon name={icon} size={14} /> : null}</span>
          ) : (
            <span aria-hidden className={`flex size-10 items-center justify-center rounded-pill ${orb} text-ink`}>{icon ? <Icon name={icon} size={16} /> : null}</span>
          )}
        </span>
        <span className={`line-clamp-2 text-body ${done ? 'text-ink-3' : 'text-ink'}`}>{title}</span>
        <span className="flex items-center gap-2 font-mono text-label text-ink-2" data-status={t}>
          {done ? (
            <span aria-hidden data-strike className="block h-px w-3 bg-ink-3" />
          ) : (
            <span aria-hidden data-dot={dot} className={`block size-2 rounded-pill border border-ink ${dot === 'solid' ? 'bg-ink' : 'bg-transparent'}`} />
          )}
          <span aria-hidden className={`block size-2.5 rounded-pill ${orb}`} />
          {toneWord[t]}
        </span>
        {word && <span className="label-caps text-ink">{word}</span>}
        {detail && <span className="line-clamp-2 text-label text-ink-2">{detail}</span>}
        {detailWord && <span className="label-caps text-ink-2">{detailWord}</span>}
      </button>
      <span className="mt-3 flex items-center justify-between gap-2">
        {meta ? <span className="font-mono text-label tabular-nums text-ink-3">{meta}</span> : <span />}
        {shown.length > 0 && (
          <span className="flex gap-3 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            {shown.map((a) => (
              <button key={a.label} type="button" onClick={a.onClick} className="min-h-8 text-label text-ink-2 underline decoration-rule underline-offset-4 hover:text-ink">
                {a.label}
              </button>
            ))}
          </span>
        )}
      </span>
    </li>
  )
}
