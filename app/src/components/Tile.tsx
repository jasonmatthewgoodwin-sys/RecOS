import type { Tone } from '../theme/tokens'
import { orbClass, toneFor } from '../lib/tone'
import { Icon, type IconName } from './Icon'
import type { RowProps } from './Row'

export type TileProps = RowProps & {
  /** Overrides the tone worked out from the dot and the word. */
  tone?: Tone
  /** An icon for the orb, such as briefcase or user. */
  icon?: IconName
}

// A gallery tile (14 November 2026): the same facts as a Row, laid out as a
// small card with a soft gradient orb that carries the state. It keeps the
// Row's roles and data attributes, so what works on a row works on a tile.
export function Tile({ dot, title, detail, meta, word, detailWord, done, actions = [], onOpen, leadId, tone, icon }: TileProps) {
  const t = tone ?? toneFor({ done, dot, word })
  const shown = actions.slice(0, 2)
  return (
    <li className="group relative flex min-h-40 flex-col rounded-card border border-rule bg-sheet p-4 transition-shadow hover:shadow-window" data-tone={t}>
      <button
        type="button"
        onClick={onOpen}
        data-row
        data-lead-id={leadId}
        data-done={done || undefined}
        className="flex min-w-0 flex-1 flex-col items-start gap-3 text-left"
      >
        <span className="flex w-full items-center justify-between">
          <span aria-hidden className={`flex size-10 items-center justify-center rounded-pill ${done ? orbClass.mist : orbClass[t]} text-ink`}>
            {icon ? <Icon name={icon} size={16} /> : null}
          </span>
          {done ? (
            <span aria-hidden data-strike className="block h-px w-3 bg-ink-3" />
          ) : (
            <span aria-hidden data-dot={dot} className={`block size-2 rounded-pill border border-ink ${dot === 'solid' ? 'bg-ink' : 'bg-transparent'}`} />
          )}
        </span>
        <span className={`line-clamp-2 text-body ${done ? 'text-ink-3' : 'text-ink'}`}>{title}</span>
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
