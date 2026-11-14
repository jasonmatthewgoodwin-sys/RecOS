import { useEffect, useState } from 'react'

// A phone is the web app at a narrow width (25.8). The same breakpoint as
// the file tabs: below md the tabs collapse into one pill.
const QUERY = '(max-width: 767px)'

/** True at phone width. False where the browser cannot say, such as in tests. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => (typeof window.matchMedia === 'function' ? window.matchMedia(QUERY).matches : false))
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(QUERY)
    const onChange = () => setPhone(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [])
  return phone
}

/** The pages that work on a phone (25.8): Home, Inbox, and Follow-ups under Business development. */
export function worksOnPhone(pathname: string): boolean {
  return pathname === '/home' || pathname === '/inbox' || pathname.startsWith('/leads/follow-ups')
}
