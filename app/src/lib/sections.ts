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
      // Follow-ups and Campaigns left this tab on 14 November 2026 at Jason's ask (docs/decisions.md): follow-ups still run from Home and the Inbox; campaigns sit under Content.
      { label: 'Jobs', slug: 'jobs' },
      { label: 'Referrals and leads', slug: 'referrals' },
      { label: 'UK to US', slug: 'uk-us' },
      { label: 'Wider business', slug: 'wider' },
    ],
  },
  {
    // Restructured on 14 November 2026 at Mia's request (docs/decisions.md):
    // the league's two halves are two named top-50 lists, each its own page,
    // with room for more lists later. Coaching and the A-star feed live here.
    key: 'people',
    label: 'People',
    path: '/people',
    arrives: 'week 4',
    pages: [
      { label: 'Senior network', slug: 'senior-network' },
      { label: 'Top candidates', slug: 'top-candidates' },
      { label: 'A-star', slug: 'a-star' },
      { label: 'Signals', slug: 'signals' },
      { label: 'Accounts', slug: 'accounts' },
      { label: 'Coaching', slug: 'coaching' },
    ],
  },
  {
    // The Candidates tab went on 14 November 2026 (docs/decisions.md): the
    // CRM is the record, and candidates are brought into a search from it.
    // Its candidate-flow pages sit under Searches.
    key: 'searches',
    label: 'Searches',
    path: '/searches',
    arrives: 'phase 2',
    reviewer: true,
    pages: [
      { label: 'Open', slug: 'open' },
      { label: 'This week', slug: 'this-week' },
      { label: 'In process', slug: 'in-process' },
      { label: 'Warm specs', slug: 'warm-specs' },
      { label: 'Placed', slug: 'placed' },
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
      { label: 'Events', slug: 'events' },
      { label: 'Testimonials', slug: 'testimonials' },
      { label: 'Campaigns', slug: 'campaigns' },
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
    { label: 'Problems', slug: 'problems' },
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
