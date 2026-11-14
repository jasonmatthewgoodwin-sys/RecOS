import type { ContentItem, ContentSource } from './data'

// Content (31.2): the words and the small rules the Drafts deck runs on.

/** The source in one short word for the counter line: CALLS, PMM or NEWS. */
export const sourceWord: Record<ContentSource, string> = {
  calls: 'Calls',
  pmm_community: 'PMM',
  recruiting_news: 'News',
  event: 'Event',
  manual: 'Yours',
}

export const angleWord: Record<string, string> = {
  hiring_manager: 'For hiring managers',
  talent_market: 'On the talent market',
  candidate: 'For candidates',
}

/** The deck: unreviewed drafts, highest ranked first, then newest (17.3). */
export function draftsDeck(items: ContentItem[]): ContentItem[] {
  return items
    .filter((c) => c.status === 'draft' && isPostDraft(c))
    .sort((a, b) => b.rank - a.rank || b.createdAt.localeCompare(a.createdAt))
}

/** A LinkedIn post, job post or blog: not an idea, a testimonial or an event. */
export function isPostDraft(c: ContentItem): boolean {
  return c.kind === 'linkedin_post' || c.kind === 'job_post' || c.kind === 'blog'
}

export type DraftGroup = 'new' | 'approved' | 'scheduled'
export const groupWord: Record<DraftGroup, string> = { new: 'New', approved: 'Approved', scheduled: 'Scheduled' }

/**
 * The gallery (Jason, 14 November 2026): New by rank, then Approved with no
 * day yet, then Scheduled by day. Posted and binned posts live on the calendar.
 */
export function draftsGallery(items: ContentItem[]): { item: ContentItem; group: DraftGroup }[] {
  const posts = items.filter(isPostDraft)
  const fresh = posts.filter((c) => c.status === 'draft').sort((a, b) => b.rank - a.rank || b.createdAt.localeCompare(a.createdAt))
  const approved = posts.filter((c) => c.status === 'approved' && c.plannedFor === null).sort((a, b) => b.rank - a.rank)
  const scheduled = posts.filter((c) => c.status === 'planned' || (c.status === 'approved' && c.plannedFor !== null)).sort((a, b) => (a.plannedFor ?? '').localeCompare(b.plannedFor ?? ''))
  return [...fresh.map((item) => ({ item, group: 'new' as const })), ...approved.map((item) => ({ item, group: 'approved' as const })), ...scheduled.map((item) => ({ item, group: 'scheduled' as const }))]
}

/** The editable text: the body, a blank line, the close. */
export function draftText(c: ContentItem): string {
  return [c.body, c.closeLine].filter((s) => s && s.trim()).join('\n\n')
}

/** Back from the edited text: the last paragraph is the close. */
export function splitDraft(text: string): { body: string; closeLine: string | null } {
  const parts = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length < 2) return { body: text.trim(), closeLine: null }
  return { body: parts.slice(0, -1).join('\n\n'), closeLine: parts[parts.length - 1] }
}

export const binReasons = ['Off topic', 'Names someone', 'Not my voice']

/**
 * One line, and only with at least 8 posts that have numbers (31.2):
 * Your posts with a data point drew twice the messages.
 */
export function insightLine(items: ContentItem[]): string | null {
  const posted = items.filter((c) => c.status === 'posted' && c.inboundMessages !== null)
  if (posted.length < 8) return null
  const avg = (rows: ContentItem[]) => (rows.length === 0 ? null : rows.reduce((n, c) => n + (c.inboundMessages ?? 0), 0) / rows.length)
  const withData = avg(posted.filter((c) => c.dataPoint))
  const without = avg(posted.filter((c) => !c.dataPoint))
  if (withData === null || without === null) return null
  if (without === 0) return withData > 0 ? 'Your posts with a data point drew the messages.' : null
  const ratio = withData / without
  if (ratio >= 1.8) return `Your posts with a data point drew ${ratio >= 2.5 ? 'three' : 'twice'} the messages.`
  if (ratio <= 0.55) return 'Your posts without a data point drew more messages.'
  return null
}
