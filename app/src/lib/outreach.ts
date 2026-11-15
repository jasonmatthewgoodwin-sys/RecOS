import type { JobLead, OutreachStage } from './data'

// The outreach ladder on a job lead (Jason, 14 November 2026): the jobs
// agent connects on LinkedIn, then messages once connected; the owner marks
// replies by hand. Nothing here sends anything.

export const outreachSteps: { key: OutreachStage; label: string }[] = [
  { key: 'found', label: 'Found' },
  { key: 'connection_sent', label: 'Connection sent' },
  { key: 'connected', label: 'Connected' },
  { key: 'messaged', label: 'Messaged' },
  { key: 'replied', label: 'Replied' },
]

export const outreachWord: Record<OutreachStage, string> = {
  found: 'Found',
  connection_sent: 'Connection sent',
  connected: 'Connected',
  messaged: 'Messaged',
  replied: 'Replied',
}

export const outcomeWord: Record<string, string> = { interested: 'Interested', not_interested: 'Not interested', no_answer: 'No answer' }

/** The step after this one, or null at the top. */
export function nextOutreach(stage: OutreachStage): OutreachStage | null {
  const i = outreachSteps.findIndex((s) => s.key === stage)
  return i >= 0 && i < outreachSteps.length - 1 ? outreachSteps[i + 1].key : null
}

/** The default note the agent sends with a connection request (Jason's words). */
export const defaultConnectionNote = "I'm the only product marketing headhunter in the world. Let's connect."

/** The date a lead reached its current step, for the line under the strip. */
export function outreachDate(l: JobLead): string | null {
  switch (l.outreachStage) {
    case 'connection_sent':
      return l.outreachConnectionOn
    case 'connected':
      return l.outreachConnectedOn
    case 'messaged':
      return l.outreachMessagedOn
    case 'replied':
      return l.outreachRepliedOn
    default:
      return null
  }
}
