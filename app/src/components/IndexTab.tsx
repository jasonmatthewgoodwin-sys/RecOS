import { NavLink } from 'react-router-dom'

// Small capitals text with an underline when active (section 3.9).
export function IndexTab({ label, route }: { label: string; route: string }) {
  return (
    <NavLink
      to={route}
      className={({ isActive }) =>
        `label-caps -mb-px inline-flex min-h-10 items-center border-b-2 ${
          isActive ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink-2'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

export function IndexTabs({ tabs }: { tabs: { label: string; route: string }[] }) {
  if (tabs.length === 0) return null
  return (
    <nav aria-label="Pages in this section" className="flex flex-wrap gap-x-8 gap-y-2 border-b border-rule">
      {tabs.map((t) => (
        <IndexTab key={t.route} {...t} />
      ))}
    </nav>
  )
}
