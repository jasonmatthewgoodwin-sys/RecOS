import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useIsPhone, worksOnPhone } from '../lib/phone'
import { EmptyLine } from './Quiet'

// On a phone only Home, Inbox and Follow-ups are shown in full (25.8). Any
// other page shows one line instead of a screen that was drawn for a laptop.
export function PhoneGate({ title, children }: { title?: string; children: ReactNode }) {
  const phone = useIsPhone()
  const { pathname } = useLocation()
  if (!phone || worksOnPhone(pathname)) return <>{children}</>
  return (
    <div className="flex flex-col gap-8">
      {title && <h1 className="text-title text-ink">{title}</h1>}
      <EmptyLine text="Best on a laptop" />
    </div>
  )
}
