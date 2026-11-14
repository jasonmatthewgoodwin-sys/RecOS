import type { ReactElement, SVGProps } from 'react'

// A small set of line icons drawn in the current colour, 1.5 px strokes on a
// 24 px grid. Light touch: they sit beside words, never replace them.

export type IconName =
  | 'home'
  | 'inbox'
  | 'briefcase'
  | 'people'
  | 'search'
  | 'pen'
  | 'calendar'
  | 'numbers'
  | 'cog'
  | 'check'
  | 'clock'
  | 'bin'
  | 'snooze'
  | 'arrow'
  | 'plus'
  | 'mail'
  | 'phone'
  | 'sparkle'
  | 'close'
  | 'list'
  | 'grid'
  | 'copy'
  | 'open'
  | 'user'
  | 'flag'

const paths: Record<IconName, ReactElement> = {
  home: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />,
  inbox: <path d="M4 13h4l1.5 2.5h5L16 13h4M4 13V6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V13M4 13v5.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V13" />,
  briefcase: <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM4 12h16" />,
  people: <path d="M15.5 19v-1.5a3 3 0 0 0-3-3h-5a3 3 0 0 0-3 3V19M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm9.5 8v-1.5a3 3 0 0 0-2-2.8M15 5.2a3 3 0 0 1 0 5.6" />,
  search: <path d="M15.5 15.5 20 20M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z" />,
  pen: <path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z" />,
  calendar: <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 11h16M8 4v4M16 4v4" />,
  numbers: <path d="M5 19V9M12 19V5M19 19v-7" />,
  cog: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 2" />
    </>
  ),
  bin: <path d="M5 7h14M9.5 7V5h5v2M7 7l.8 12h8.4L17 7M10 11v5M14 11v5" />,
  snooze: <path d="M8 6h5l-5 7h5M14 11h4l-4 5h4" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  mail: <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5zM4.5 8l7.5 5.5L19.5 8" />,
  phone: <path d="M6 4h3l1.5 4-2 1.5a11 11 0 0 0 6 6L16 13.5l4 1.5v3a1.5 1.5 0 0 1-1.5 1.5A14.5 14.5 0 0 1 4.5 5.5 1.5 1.5 0 0 1 6 4z" />,
  sparkle: <path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2 2M15 15l2 2M7 17l2-2M15 9l2-2" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  grid: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  copy: <path d="M9 9h10v10H9zM5 15V5h10" />,
  open: <path d="M14 5h5v5M19 5l-8 8M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />,
  user: <path d="M18 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 6 17.5V19M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />,
  flag: <path d="M6 20V4M6 4h11l-2.5 4 2.5 4H6" />,
}

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number; label?: string }

export function Icon({ name, size = 18, label, className = '', ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      data-icon={name}
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {paths[name]}
    </svg>
  )
}

/** The icon for each file tab (section 3.3). */
export const sectionIcon: Record<string, IconName> = {
  home: 'home',
  inbox: 'inbox',
  leads: 'briefcase',
  people: 'people',
  searches: 'search',
  content: 'pen',
  events: 'calendar',
  numbers: 'numbers',
  settings: 'cog',
}
