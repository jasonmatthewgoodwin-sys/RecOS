import { NavLink } from 'react-router-dom'
import { Icon, type IconName } from './Icon'

type Props = { label: string; route: string; hasDot?: boolean; icon?: IconName }

// A rounded tab on the top edge of the sheet. The active tab is joined to the
// sheet with no line beneath it; the others sit behind, in grey.
// A waiting tab shows one small dot, never a count (UX-8).
export function FileTab({ label, route, hasDot, icon }: Props) {
  return (
    <NavLink
      to={route}
      className={({ isActive }) =>
        `relative inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-t-tab border border-b-0 px-4 text-body ${
          isActive ? 'z-10 border-ink bg-sheet text-ink' : 'border-transparent text-ink-3 hover:text-ink-2'
        }`
      }
    >
      {icon && <Icon name={icon} size={16} />}
      {label}
      {hasDot && (
        <span data-testid="tab-dot" role="img" aria-label="Something waiting" className="block size-1.5 rounded-pill bg-current" />
      )}
    </NavLink>
  )
}
