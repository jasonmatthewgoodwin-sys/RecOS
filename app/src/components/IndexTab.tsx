import { NavLink } from 'react-router-dom'
import type { Tone } from '../theme/tokens'
import { orbClass } from '../lib/tone'

// Small capitals text with an underline when active (section 3.9). A list
// the owner has coloured shows a small orb before its name.
export function IndexTab({ label, route, tone }: { label: string; route: string; tone?: Tone }) {
  return (
    <NavLink
      to={route}
      className={({ isActive }) =>
        `label-caps -mb-px inline-flex min-h-10 items-center gap-2 border-b-2 ${
          isActive ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink-2'
        }`
      }
    >
      {tone && <span aria-hidden className={`block size-2.5 rounded-pill ${orbClass[tone]}`} />}
      {label}
    </NavLink>
  )
}

export function IndexTabs({ tabs }: { tabs: { label: string; route: string; tone?: Tone }[] }) {
  if (tabs.length === 0) return null
  return (
    <nav aria-label="Pages in this section" className="flex flex-wrap gap-x-8 gap-y-2">
      {tabs.map((t) => (
        <IndexTab key={t.route} {...t} />
      ))}
    </nav>
  )
}
