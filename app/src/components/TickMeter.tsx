// A row of thin vertical ticks, filled in ink up to the value (section 3.9).
// Always paired with a plain fraction by the caller.
export function TickMeter({ filled, total }: { filled: number; total: number }) {
  const count = Math.max(0, Math.min(40, Math.round(total)))
  const on = Math.max(0, Math.min(count, Math.round(filled)))
  return (
    <span role="img" aria-label={`${on} of ${count}`} className="inline-flex items-end gap-1">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} data-filled={i < on} className={`block h-4 w-0.5 ${i < on ? 'bg-ink' : 'bg-rule'}`} />
      ))}
    </span>
  )
}
