type Props = {
  on: boolean
  label: string
  onChange: (on: boolean) => void
  disabled?: boolean
}

// An outlined pill with a sliding dot, like the player reference (section 3.9).
// On is a solid dot at the right; off is a hollow dot at the left, so the
// state reads in greyscale. Used for send levels and settings.
export function Switch({ on, label, onChange, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="inline-flex min-h-10 items-center gap-4 text-left disabled:cursor-default disabled:opacity-40"
    >
      <span aria-hidden className="relative inline-block h-6 w-11 shrink-0 rounded-pill border border-ink">
        <span
          data-dot={on ? 'solid' : 'hollow'}
          className={`absolute top-1/2 size-4 -translate-y-1/2 rounded-pill border border-ink transition-[left] ${
            on ? 'left-5.5 bg-ink' : 'left-1 bg-transparent'
          }`}
        />
      </span>
      <span className="text-body text-ink">{label}</span>
    </button>
  )
}
