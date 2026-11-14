import { useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { landing, sectionFor, settings, type Section } from '../lib/sections'
import { FileTab } from './FileTab'
import { Icon, sectionIcon } from './Icon'

// The layout tree in section 25.2: Paper, FileTabs, Sheet. No other regions
// exist. There is no sidebar, no top bar, no footer and no floating buttons.

export function Paper({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper px-4 py-4 sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </div>
  )
}

function Cog() {
  // A small cog at the far right of the tab row. Drawn in ink, no fill.
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="1.25">
      <circle cx="12" cy="12" r="3.25" />
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1="12" y1="2.5" x2="12" y2="5.5" transform={`rotate(${i * 45} 12 12)`} strokeLinecap="round" />
      ))}
      <circle cx="12" cy="12" r="7" />
    </svg>
  )
}

type TabsProps = { tabs: Section[]; dots?: Record<string, boolean>; showSettings?: boolean; onSearch?: () => void; onCapture?: () => void }

export function FileTabs({ tabs, dots = {}, showSettings = true, onSearch, onCapture }: TabsProps) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const current = sectionFor(pathname)

  return (
    <>
      {/* Laptop: the row of file tabs along the top edge of the sheet. */}
      <nav aria-label="Sections" className="relative z-10 -mb-px hidden items-end gap-1 pl-6 pr-4 md:flex">
        {tabs.map((s) => (
          <FileTab key={s.key} label={s.label} route={s.path} hasDot={dots[s.key]} icon={sectionIcon[s.key]} />
        ))}
        <span className="flex-1" />
        {onSearch && (
          <button type="button" aria-label="Search" title="Search (/)" onClick={onSearch} className="mb-1 inline-flex size-10 items-center justify-center rounded-pill text-ink-3 hover:text-ink">
            <Icon name="search" />
          </button>
        )}
        {onCapture && (
          <button type="button" aria-label="Quick capture" title="Quick capture (c)" onClick={onCapture} className="mb-1 inline-flex size-10 items-center justify-center rounded-pill text-ink-3 hover:text-ink">
            <Icon name="plus" />
          </button>
        )}
        {showSettings && (
          <NavLink
            to={landing(settings)}
            aria-label="Settings"
            className={({ isActive }) =>
              `mb-1 inline-flex size-10 items-center justify-center rounded-pill ${isActive || current?.key === 'settings' ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`
            }
          >
            <Cog />
          </NavLink>
        )}
      </nav>

      {/* Phone: one pill showing the current tab. Tapping it lists the others (25.8). */}
      <nav aria-label="Sections" className="mb-4 md:hidden">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-11 items-center gap-2 rounded-pill border border-ink bg-sheet px-6 text-body text-ink"
        >
          {current && <Icon name={sectionIcon[current.key] ?? 'home'} size={16} />}
          {current?.label ?? 'RecOS'}
          <span aria-hidden className="text-ink-3">
            {open ? '–' : '+'}
          </span>
        </button>
        {open && (
          <ul className="mt-2 rounded-card border border-ink bg-sheet px-6 py-2">
            {[...tabs, ...(showSettings ? [settings] : [])].map((s) => (
              <li key={s.key} className="border-b border-rule last:border-b-0">
                <Link
                  to={landing(s)}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center justify-between text-body text-ink"
                >
                  <span className="flex items-center gap-3">
                    <Icon name={sectionIcon[s.key] ?? 'home'} size={16} />
                    {s.label}
                  </span>
                  {dots[s.key] && <span role="img" aria-label="Something waiting" className="block size-1.5 rounded-pill bg-ink" />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </>
  )
}

// The single rounded sheet. Everything lives on it.
export function Sheet({ children, fadeKey }: { children: ReactNode; fadeKey?: string }) {
  return (
    <main className="relative min-h-[40rem] rounded-sheet border border-ink bg-sheet">
      <div key={fadeKey} className="animate-fade p-6 sm:p-16">
        {children}
      </div>
    </main>
  )
}
