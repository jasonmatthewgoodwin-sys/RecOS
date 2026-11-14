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
}

// A large mono number with a small capitals label beneath (section 3.9).
export function HeroStat({ label, value, plus, mark, meter, onClick }: Props) {
  const body = (
    <>
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
      <div data-hero-stat className="text-left">
        {body}
      </div>
    )
  }
  return (
    <button type="button" data-hero-stat onClick={onClick} className="rounded-card text-left">
      {body}
    </button>
  )
}
