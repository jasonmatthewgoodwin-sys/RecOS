import { Icon, type IconName } from './Icon'

type Props = {
  label: string
  icon?: IconName
  kind?: 'primary' | 'plain'
  busy?: boolean
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  /** The filled one in a row of stage pills (28.2). It shows where things are and does nothing when pressed. */
  current?: boolean
}

// An outlined pill. The primary one is filled ink with sheet text.
// One primary per screen (UX-5).
export function PillButton({ label, kind = 'plain', busy, disabled, onClick, type = 'button', current, icon }: Props) {
  const look = current
    ? 'bg-ink text-sheet'
    : kind === 'primary'
      ? 'bg-ink text-sheet hover:border-ink-2 hover:bg-ink-2 active:bg-ink'
      : 'bg-transparent text-ink hover:bg-paper active:bg-rule'
  return (
    <button
      type={type}
      data-kind={kind}
      aria-current={current || undefined}
      aria-busy={busy || undefined}
      disabled={disabled || busy || current}
      onClick={onClick}
      className={`inline-flex h-11 min-w-28 items-center justify-center rounded-pill border border-ink px-6 text-body transition-colors disabled:cursor-default ${current ? '' : 'disabled:opacity-40'} ${look}`}
    >
      {busy ? '···' : (
        <>
          {icon && <Icon name={icon} size={14} className="mr-2" />}
          {label}
        </>
      )}
    </button>
  )
}
