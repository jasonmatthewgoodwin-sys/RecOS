import { Icon, type IconName } from './Icon'

type Props = {
  label: string
  icon?: IconName
  onClick?: () => void
  href?: string
  /** The chosen one of a set of filters: ink, no underline, a little heavier. Shown by weight, not colour (UX-7). */
  active?: boolean
}

// A plain text action. Everything that is not the primary button is one of these.
export function TextLink({ label, onClick, href, active, icon }: Props) {
  const cls = active
    ? 'inline-flex min-h-10 items-center text-body font-medium text-ink'
    : 'inline-flex min-h-10 items-center text-body text-ink-2 underline decoration-rule underline-offset-4 hover:text-ink hover:decoration-ink'
  if (href) {
    return (
      <a href={href} className={`${cls} gap-2`} target="_blank" rel="noreferrer">
        {icon && <Icon name={icon} size={14} />}
        {label}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} aria-current={active || undefined} className={`${cls} gap-2`}>
      {icon && <Icon name={icon} size={14} />}
      {label}
    </button>
  )
}
