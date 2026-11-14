// Every source has a link (Mia, 14 November 2026). The label says where the
// link goes, so an email from Alex's leads opens in Outlook and a job post
// opens on LinkedIn, in the words the owner would use.

export function isOutlookLink(url: string): boolean {
  return /outlook\.(office|office365|live)\.com/i.test(url)
}

export function sourceLabel(url: string): string {
  if (isOutlookLink(url)) return 'Open the email'
  if (/linkedin\.com/i.test(url)) return 'Open on LinkedIn'
  if (/granola\.(ai|so)/i.test(url)) return 'Open the call notes'
  if (/spott|jobadder/i.test(url)) return 'Open in CRM'
  if (/^https?:\/\//i.test(url)) return 'Open source'
  return 'Open source'
}

/** True when the text is a web address rather than a plain word such as linkedin_post. */
export function isLink(text: string | null | undefined): text is string {
  return typeof text === 'string' && /^https?:\/\//i.test(text)
}
