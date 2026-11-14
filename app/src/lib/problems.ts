import type { Problem, ProblemSeverity, ProblemStatus } from './data'
import type { Tone } from '../theme/tokens'

// Problem reports (the bug handover of 14 November 2026, in RecOS terms):
// the words, the queue order and the state colours.

export const statusWord: Record<ProblemStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  wont_fix: "Won't fix",
}

export const severityWord: Record<ProblemSeverity, string> = { low: 'Low', medium: 'Medium', high: 'High' }

export const statusChoices: { value: ProblemStatus; label: string }[] = (Object.keys(statusWord) as ProblemStatus[]).map((value) => ({ value, label: statusWord[value] }))
export const severityChoices: { value: ProblemSeverity; label: string }[] = (Object.keys(severityWord) as ProblemSeverity[]).map((value) => ({ value, label: severityWord[value] }))

/** New is new, in progress is waiting, the rest are done. */
export function problemTone(p: Problem): Tone {
  return p.status === 'new' ? 'new' : p.status === 'in_progress' ? 'pending' : 'clear'
}

export function isOpen(p: Problem): boolean {
  return p.status === 'new' || p.status === 'in_progress'
}

export const refOf = (p: Problem) => `BUG-${p.ref}`

const severityRank: Record<ProblemSeverity, number> = { high: 0, medium: 1, low: 2 }

/** The queue: open ones unless asked for all, newest first or worst first. */
export function queueOf(items: Problem[], { showClosed = false, sort = 'date' as 'date' | 'severity' } = {}): Problem[] {
  return items
    .filter((p) => showClosed || isOpen(p))
    .sort((a, b) => (sort === 'severity' ? severityRank[a.severity] - severityRank[b.severity] || b.createdAt.localeCompare(a.createdAt) : b.createdAt.localeCompare(a.createdAt)))
}

/** The first line of the report, for a row. */
export function snippet(p: Problem): string {
  const text = p.title?.trim() || p.description.trim().split('\n')[0]
  return text.length > 70 ? `${text.slice(0, 67).trimEnd()}...` : text
}

/** What the app captured, as label and value pairs. */
export function contextLines(p: Problem): [string, string][] {
  const lines: [string, string][] = []
  if (p.route) lines.push(['Page', p.route])
  if (p.userAgent) lines.push(['Browser', shortAgent(p.userAgent)])
  if (p.viewport) lines.push(['Screen', p.viewport])
  if (p.appVersion) lines.push(['Build', p.appVersion])
  return lines
}

/** Chrome 142 on Windows, from the long string the browser gives. */
export function shortAgent(ua: string): string {
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : null
  const m = ua.match(/(Edg|OPR|Chrome|Firefox|Safari)\/(\d+)/)
  const browser = m ? `${{ Edg: 'Edge', OPR: 'Opera' }[m[1]] ?? m[1]} ${m[2]}` : null
  return [browser, os].filter(Boolean).join(' on ') || ua.slice(0, 60)
}

/** The context the widget captures without asking. */
export function captureContext(route: string): { route: string; userAgent: string; viewport: string; appVersion: string } {
  return {
    route,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    viewport: typeof window === 'undefined' ? '' : `${window.innerWidth}x${window.innerHeight}`,
    appVersion: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? import.meta.env.MODE,
  }
}
