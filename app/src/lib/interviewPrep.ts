// Candidate interview prep (Jason, 16 November 2026): one light action on a
// search that writes the prep email, an offer of a call, or both. The call
// is offered through his booking page, so the candidate picks the time and
// nothing has to be held in the diary first. Pure text: no address, no CV
// and no pay ever pass through here (CLAUDE.md, rule 1).

export type PrepKind = 'email' | 'call' | 'both'

export const prepKindWord: Record<PrepKind, string> = {
  email: 'Prep email',
  call: 'Offer a call',
  both: 'Both',
}

/** Jason's public booking page for a prep or feedback call. */
export const PREP_BOOKING_URL = 'https://calendly.com/jason3search/interview-prep-feedback'

export type PrepInput = {
  kind: PrepKind
  /** The candidate's name as typed; the first word is used in the greeting. */
  name: string
  client: string
  role: string
  /** ISO time of the interview, when known. */
  interviewAt?: string | null
  /** A confidential search never names the client in the subject line. */
  confidential?: boolean
}

function when(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return ` on ${new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' }).format(d)}`
}

export function prepSubject(p: PrepInput): string {
  return p.confidential ? `Interview prep: ${p.role}` : `Interview prep: ${p.role} at ${p.client}`
}

/** The draft, in his voice: plain, short, no exclamation marks. He edits it before it goes. */
export function prepBody(p: PrepInput): string {
  const first = p.name.trim().split(/\s+/)[0] || 'there'
  const opening = `Ahead of your interview${when(p.interviewAt)} for the ${p.role} role at ${p.client}`
  const points = [
    '- Your story in two minutes: why you made each move, and why this role now.',
    '- Two or three launches or results you can talk through with numbers, and what you did yourself.',
    `- What you know of ${p.client}: the product, who buys it and who they compete with.`,
    '- Three questions for them, on the team, the first 90 days and how success is measured.',
  ].join('\n')
  const call = `Pick a time that suits you here: ${PREP_BOOKING_URL}`
  const close = `Let me know how it goes afterwards and I will get feedback from ${p.client} as quickly as I can.`

  const middle =
    p.kind === 'email'
      ? `${opening}, a few things worth preparing:\n\n${points}`
      : p.kind === 'call'
        ? `${opening}, it would be good to speak for 15 minutes so I can take you through who you are meeting and what they will look for.\n\n${call}`
        : `${opening}, a few things worth preparing:\n\n${points}\n\nIt would also be good to speak for 15 minutes before you go in. ${call}`

  return `Hi ${first},\n\n${middle}\n\n${close}\n\nJason`
}
