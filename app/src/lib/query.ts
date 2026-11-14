// A small keyed cache for page data (section 25.5). No state framework.
//
// - Each key is fetched once and shared by every component that asks for it.
// - Data already seen stays on screen while a refresh runs, so nothing shifts.
// - A refresh happens when the window regains focus, at most once a minute.
//   Nothing changes while the owner is looking at the page (UX-11, HOME-4).

import { useEffect, useSyncExternalStore } from 'react'

export type QueryState<T> = {
  data: T | undefined
  /** loading: never loaded. ready: has data. error: failed with nothing to show. */
  status: 'loading' | 'ready' | 'error'
}

type Entry = QueryState<unknown> & { at: number; busy: boolean; fn: () => Promise<unknown> }

const REFRESH_AFTER_MS = 60_000
const entries = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l())
}

function run(key: string) {
  const entry = entries.get(key)
  if (!entry || entry.busy) return
  entries.set(key, { ...entry, busy: true })
  entry
    .fn()
    .then((data) => {
      const now = entries.get(key)
      if (now) entries.set(key, { ...now, data, status: 'ready', at: Date.now(), busy: false })
    })
    .catch(() => {
      const now = entries.get(key)
      if (!now) return
      // Keep the last good data if there is any. Only a first load shows an error.
      const status = now.data === undefined ? 'error' : 'ready'
      entries.set(key, { ...now, status, at: Date.now(), busy: false })
    })
    .finally(() => emit(key))
}

function subscribe(key: string, listener: () => void) {
  let set = listeners.get(key)
  if (!set) listeners.set(key, (set = new Set()))
  set.add(listener)
  return () => {
    set.delete(listener)
  }
}

export function useQuery<T>(key: string, fn: () => Promise<T>): QueryState<T> {
  if (!entries.has(key)) {
    entries.set(key, { data: undefined, status: 'loading', at: 0, busy: false, fn })
  }
  const entry = useSyncExternalStore(
    (l) => subscribe(key, l),
    () => entries.get(key),
  )
  useEffect(() => {
    const current = entries.get(key)
    if (current && current.at === 0) run(key)
  }, [key])
  return { data: entry?.data as T | undefined, status: entry?.status ?? 'loading' }
}

/**
 * Change cached data in place, before the server has answered (25.5: actions
 * update the screen first and the server second). The caller keeps the old
 * value and puts it back if the write fails.
 */
export function setQueryData<T>(key: string, update: (current: T | undefined) => T) {
  const entry = entries.get(key)
  if (!entry) return
  entries.set(key, { ...entry, data: update(entry.data as T | undefined), status: 'ready' })
  emit(key)
}

/** Refetch keys that start with the prefix. Call after an action that could change them. */
export function invalidate(prefix = '') {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) run(key)
  }
}

function refreshStale() {
  const now = Date.now()
  for (const [key, entry] of entries) {
    if (entry.at > 0 && now - entry.at >= REFRESH_AFTER_MS) run(key)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('focus', refreshStale)
}

/** Tests only. */
export function resetQueries() {
  entries.clear()
  listeners.clear()
}
