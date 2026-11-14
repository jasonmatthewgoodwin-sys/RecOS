type Props = {
  label: string
  kind?: 'primary' | 'plain'
  busy?: boolean
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
}

// An outlined pill. The primary one is filled ink with sheet text.
// One primary per screen (UX-5).
export function PillButton({ label, kind = 'plain', busy, disabled, onClick, type = 'button' }: Props) {
  const look =
    kind === 'primary'
      ? 'bg-ink text-sheet hover:border-ink-2 hover:bg-ink-2 active:bg-ink'
      : 'bg-transparent text-ink hover:bg-paper active:bg-rule'
  return (
    <button
      type={type}
      data-kind={kind}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={onClick}
      className={`inline-flex h-11 min-w-28 items-center justify-center rounded-pill border border-ink px-6 text-body transition-colors disabled:cursor-default disabled:opacity-40 ${look}`}
    >
      {busy ? '···' : label}
    </button>
  )
}
