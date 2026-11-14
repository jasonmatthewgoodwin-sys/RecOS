type Props = { label: string; onClick?: () => void; href?: string }

// A plain text action. Everything that is not the primary button is one of these.
export function TextLink({ label, onClick, href }: Props) {
  const cls =
    'inline-flex min-h-10 items-center text-body text-ink-2 underline decoration-rule underline-offset-4 hover:text-ink hover:decoration-ink'
  if (href) {
    return (
      <a href={href} className={cls} target="_blank" rel="noreferrer">
        {label}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {label}
    </button>
  )
}
