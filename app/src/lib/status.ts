import { useSyncExternalStore } from 'react'
import type { Tone } from '../theme/tokens'

// The status counts of the list on the page, published by the gallery and
// read by the page header, so the colour key and the filter sit at the top
// right of the tabs rather than on every tile (14 November 2026).

export type StatusCounts = Partial<Record<Tone, number>> & { all?: number }

let counts: StatusCounts = {}
const listeners = new Set<() => void>()

export function publishStatusCounts(next: StatusCounts) {
  const same = Object.keys({ ...counts, ...next }).every((k) => counts[k as keyof StatusCounts] === next[k as keyof StatusCounts])
  if (same) return
  counts = next
  listeners.forEach((l) => l())
}

export function useStatusCounts(): StatusCounts {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => counts,
  )
}

export const toneOrder: Tone[] = ['new', 'action', 'pending', 'clear']

export function isTone(v: string | null): v is Tone {
  return v !== null && (toneOrder as string[]).includes(v)
}
