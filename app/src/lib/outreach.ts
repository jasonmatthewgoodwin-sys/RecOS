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

/** A plain summary of where the owner is with the poster, from the dates on the lead; shown when he has not written his own (Mia, 15 November 2026). */
export function outreachSummary(l: JobLead): string {
  const who = l.posterName ?? 'the poster'
  const when = (d: string | null) => (d ? ` on ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))}` : '')
  const parts: string[] = []
  switch (l.outreachStage) {
    case 'found':
      parts.push(`Not contacted yet. ${who} posted the role.`)
      break
    case 'connection_sent':
      parts.push(`Connection sent to ${who}${when(l.outreachConnectionOn)}. Waiting for them to accept.`)
      break
    case 'connected':
      parts.push(`Connected with ${who}${when(l.outreachConnectedOn)}. First message ${l.firstMessage ? 'staged' : 'not written yet'}.`)
      break
    case 'messaged':
      parts.push(`Messaged ${who}${when(l.outreachMessagedOn)}. No reply yet.`)
      break
    case 'replied':
      parts.push(`${who} replied${when(l.outreachRepliedOn)}${l.replyOutcome ? `, ${outcomeWord[l.replyOutcome].toLowerCase()}` : ''}.`)
      break
  }
  if (l.ukToUs) parts.push('UK company hiring in the US.')
  return parts.join(' ')
}
