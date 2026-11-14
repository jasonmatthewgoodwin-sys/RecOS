import { data, type PeopleList } from './data'
import { useQuery } from './query'
import { sections } from './sections'
import type { Tone } from '../theme/tokens'

export const LISTS_KEY = 'people.lists'

export type PeopleTab = { label: string; route: string; tone?: Tone; list?: PeopleList }

/** The lists are tabs the owner can add, rename, colour and reorder (14 November 2026). */
export const listSlug = (key: string) => key.replace(/_/g, '-')
export const listKeyOf = (slug: string) => slug.replace(/-/g, '_')

/** The People tabs: the owner's lists first, in his order, then the fixed pages. */
export function usePeopleTabs(): { tabs: PeopleTab[]; lists: PeopleList[] | undefined } {
  const lists = useQuery(LISTS_KEY, data.lists)
  const section = sections.find((s) => s.key === 'people')!
  const fixed = section.pages.filter((p) => !['senior-network', 'top-candidates', 'a-star'].includes(p.slug))
  const live = (lists.data ?? []).filter((l) => !l.archived).sort((a, b) => a.position - b.position)
  const tabs: PeopleTab[] = [
    ...live.map((l) => ({ label: l.name, route: `${section.path}/${listSlug(l.key)}`, tone: l.colour === 'mist' ? undefined : l.colour, list: l })),
    ...fixed.map((p) => ({ label: p.label, route: `${section.path}/${p.slug}` })),
  ]
  return { tabs, lists: lists.data }
}

/** A key from a name the owner typed: letters, digits and underscores. */
export function keyFromName(name: string): string {
  const k = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return /^[a-z]/.test(k) ? k : `list_${k}`
}
