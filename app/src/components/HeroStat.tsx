import type { Tone } from '../theme/tokens'
import { orbClass } from '../lib/tone'
import { Icon, type IconName } from './Icon'
import { TickMeter } from './TickMeter'

type Props = {
  label: string
  /** The text to show. Leave undefined while loading or when there is no value: a dash shows. */
  value?: string
  /** True when the real value is over 99: a small plus follows the number. */
  plus?: boolean
  /** A small letter after the number, such as m for a week with a manual correction (22.4). */
  mark?: string
  meter?: { filled: number; total: number }
  onClick?: () => void
  /** The state the number speaks for: a soft orb in that colour sits behind it (14 November 2026). */
  tone?: Tone
  icon?: IconName
}

// A large mono number with a small capitals label beneath (section 3.9).
export function HeroStat({ label, value, plus, mark, meter, onClick, tone, icon }: Props) {
  const body = (
    <>
      {tone && (
        <span aria-hidden data-orb={tone} className={`mb-4 flex size-12 items-center justify-center rounded-pill ${orbClass[tone]} text-ink`}>
          {icon && <Icon name={icon} size={18} />}
        </span>
      )}
      <span className="block font-mono text-hero-sm tabular-nums text-ink sm:text-hero" data-testid="hero-value">
        {value ?? '–'}
        {plus && <span className="align-top text-title text-ink-2">+</span>}
        {mark && value !== undefined && (
          <span className="align-top text-title text-ink-2" data-testid="hero-mark">
            {mark}
          </span>
        )}
      </span>
      <span className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="label-caps text-ink-2">{label}</span>
        {meter && value !== undefined && <TickMeter filled={meter.filled} total={meter.total} />}
      </span>
    </>
  )
  if (!onClick) {
    return (
      <div data-hero-stat data-tone={tone} className="text-left">
        {body}
      </div>
    )
  }
  return (
    <button type="button" data-hero-stat data-tone={tone} onClick={onClick} className={`rounded-card text-left ${tone ? '-m-4 p-4 transition-colors hover:bg-paper' : ''}`}>
      {body}
    </button>
  )
}
