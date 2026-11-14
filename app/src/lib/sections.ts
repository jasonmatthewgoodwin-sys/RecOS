// The nine file tabs and their index tabs (sections 3.4 and 25.1).
// Tab names are single words so the row stays quiet.

export type IndexPage = { label: string; slug: string }

export type Section = {
  key: string
  label: string
  /** The route the file tab opens. */
  path: string
  /** The week of phase 1 (or the phase) in which the section is built. */
  arrives: string
  pages: IndexPage[]
  /** Shown to the read-only reviewer (section 5.6). */
  reviewer?: boolean
}

export const sections: Section[] = [
  { key: 'home', label: 'Home', path: '/home', arrives: 'week 1', pages: [] },
  { key: 'inbox', label: 'Inbox', path: '/inbox', arrives: 'week 2', pages: [] },
  {
    key: 'leads',
    // Renamed from Leads on 14 November 2026 at Mia's request: the one two-word tab (docs/decisions.md).
    label: 'Business development',
    path: '/leads',
    arrives: 'weeks 2 and 3',
    pages: [
      { label: 'Jobs', slug: 'jobs' },
      { label: 'Referrals', slug: 'referrals' },
      { label: 'Follow-ups', slug: 'follow-ups' },
      { label: 'UK to US', slug: 'uk-us' },
      { label: 'Campaigns', slug: 'campaigns' },
      { label: 'Wider business', slug: 'wider' },
    ],
  },
  {
    key: 'people',
    label: 'People',
    path: '/people',
    arrives: 'week 4',
    pages: [
      { label: 'League', slug: 'league' },
      { label: 'Signals', slug: 'signals' },
      { label: 'Accounts', slug: 'accounts' },
    ],
  },
  { key: 'searches', label: 'Searches', path: '/searches', arrives: 'phase 2', pages: [], reviewer: true },
  {
    key: 'candidates',
    label: 'Candidates',
    path: '/candidates',
    arrives: 'phase 2',
    pages: [
      { label: 'This week', slug: 'this-week' },
      { label: 'A-star', slug: 'a-star' },
      { label: 'Warm specs', slug: 'warm-specs' },
      { label: 'In process', slug: 'in-process' },
      { label: 'Placed', slug: 'placed' },
      // Moved here from Leads on 14 November 2026 at Mia's request (docs/decisions.md).
      { label: 'Coaching', slug: 'coaching' },
    ],
  },
  {
    key: 'content',
    label: 'Content',
    path: '/content',
    arrives: 'phase 3',
    pages: [
      { label: 'Calendar', slug: 'calendar' },
      { label: 'Drafts', slug: 'drafts' },
      { label: 'Ideas', slug: 'ideas' },
      { label: 'Testimonials', slug: 'testimonials' },
    ],
  },
  { key: 'events', label: 'Events', path: '/events', arrives: 'phase 3', pages: [] },
  {
    key: 'numbers',
    label: 'Numbers',
    path: '/numbers',
    arrives: 'week 4',
    reviewer: true,
    pages: [
      { label: 'This week', slug: 'this-week' },
      { label: 'Quarter', slug: 'quarter' },
      { label: 'Review', slug: 'review' },
    ],
  },
]

// Settings sits behind a small cog, not a tab.
export const settings: Section = {
  key: 'settings',
  label: 'Settings',
  path: '/settings',
  arrives: 'week 4',
  pages: [
    { label: 'Agents', slug: 'agents' },
    { label: 'Send rules', slug: 'send-rules' },
    { label: 'Targets', slug: 'targets' },
    { label: 'Templates', slug: 'templates' },
    { label: 'Profile', slug: 'profile' },
    { label: 'Data', slug: 'data' },
  ],
}

/** The route a section opens on: its first index page, or itself. */
export function landing(section: Section): string {
  return section.pages.length > 0 ? `${section.path}/${section.pages[0].slug}` : section.path
}

export function sectionFor(pathname: string): Section | undefined {
  return [...sections, settings].find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`))
}

export function visibleSections(role: 'owner' | 'reviewer'): Section[] {
  return role === 'reviewer' ? sections.filter((s) => s.reviewer) : sections
}
