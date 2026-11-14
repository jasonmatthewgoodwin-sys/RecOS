// Keys for moving between tabs (section 25.6): 1 to 9 for file tabs,
// [ and ] for the previous and next index tab. Other keys arrive with the
// screens that use them.

import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { landing, sectionFor, type Section } from './sections'

/** True when a key press belongs to a field the owner is typing in. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export function useTabKeys(tabs: Section[]) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return

      if (/^[1-9]$/.test(e.key)) {
        const tab = tabs[Number(e.key) - 1]
        if (tab) navigate(landing(tab))
        return
      }

      if (e.key === '[' || e.key === ']') {
        const section = sectionFor(pathname)
        if (!section || section.pages.length === 0) return
        const at = section.pages.findIndex((p) => pathname === `${section.path}/${p.slug}`)
        const next = at + (e.key === ']' ? 1 : -1)
        const page = section.pages[next]
        if (page) navigate(`${section.path}/${page.slug}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, pathname, tabs])
}
