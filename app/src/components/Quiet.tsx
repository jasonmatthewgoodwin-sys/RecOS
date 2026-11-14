// The small, quiet pieces every page state uses (section 25.4).

/** Loading: three quiet dots. No spinner, no shimmer. */
export function Dots({ label = 'Loading' }: { label?: string }) {
  return (
    <p role="status" aria-label={label} className="font-mono text-body text-ink-3">
      ···
    </p>
  )
}

/** Empty or error: one line where the data would be. */
export function EmptyLine({ text }: { text: string }) {
  return <p className="text-body text-ink-2">{text}</p>
}
