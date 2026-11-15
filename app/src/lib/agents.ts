// Which agent feeds which page, and the words for what they connect to
// (Jason, 14 November 2026: on every tab, a button that opens the agent).

export const connectionWord: Record<string, string> = {
  claude: 'Claude',
  linkedin_scraper: 'The LinkedIn scraper',
  linkedin_read: 'LinkedIn, reading',
  outlook_mail: 'Outlook mail',
  outlook_calendar: 'Outlook calendar',
  granola: 'Granola call notes',
  crm: 'The CRM',
}

export const criteriaWord: Record<string, string> = {
  lookback_days: 'Days to look back',
  posts_a_week: 'Posts a week',
  icp: 'The companies to go at',
  uk_to_us: 'Watch UK companies hiring in the US',
  per_run_cap: 'Most items in one run',
  notes: 'Notes for the agent',
}

/** The agents behind a route, most specific first. */
const byRoute: [string, string[]][] = [
  ['/leads/jobs', ['a3_jobs']],
  ['/leads/referrals', ['a6_calls']],
  ['/leads/uk-us', ['a4_signals', 'a3_jobs']],
  ['/leads/wider', ['a3_jobs', 'a6_calls']],
  ['/leads/follow-ups', ['a5_followups']],
  ['/leads', ['a3_jobs']],
  ['/people/signals', ['a4_signals']],
  ['/people/coaching', ['a6_calls']],
  ['/people', ['a4_signals', 'a5_followups']],
  ['/content/events', ['a7_events']],
  ['/content/calendar', ['a2_content', 'a7_events']],
  ['/content/testimonials', ['a6_calls', 'a5_followups']],
  ['/content/campaigns', ['a8_campaigns', 'a3_jobs']],
  ['/content', ['a2_content']],
  ['/inbox', ['a3_jobs', 'a4_signals', 'a5_followups', 'a6_calls', 'a7_events']],
  ['/numbers', ['a1_review']],
  ['/searches/this-week', ['a6_calls']],
  ['/searches', ['a6_calls', 'a3_jobs']],
  ['/people/a-star', ['a3_jobs']],
  ['/home', ['a5_followups']],
]

export function agentsFor(pathname: string): string[] {
  const hit = byRoute.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  return hit ? hit[1] : []
}

/** A plain line for when the agent last ran: never, or an hour or a day ago with the outcome. */
export function lastRanWords(lastRun: { startedAt: string; status: string; itemsCreated: number } | null, now = new Date()): string {
  if (!lastRun) return 'Not run yet'
  const mins = Math.max(0, Math.round((now.getTime() - Date.parse(lastRun.startedAt)) / 60_000))
  const when = mins < 60 ? `${mins} min ago` : mins < 60 * 36 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`
  const how = lastRun.status === 'running' ? 'still running' : lastRun.status === 'ok' ? `${lastRun.itemsCreated} new` : lastRun.status
  return `Last ran ${when}, ${how}`
}
