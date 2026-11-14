import { Card } from '../../components/Card'
import { TextLink } from '../../components/TextLink'
import { coachingQuestions } from '../../lib/bd'
import type { CalendarCall, FollowUp, WeekTargets } from '../../lib/data'
import { ukTime } from '../../lib/time'

// The Calls today card and the prep cards (section 26.4). Text only: a prep
// card has one link, Open in CRM, and no actions.

export const callTypeWord: Record<string, string> = {
  candidate_screen: 'Candidate screen',
  coaching: 'Coaching',
  client_update: 'Client update',
  reference: 'Reference',
  internal: 'Internal',
  other: 'Call',
}

/** US Eastern, for the client on the other end. */
export function easternTime(at: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)
}

type CallsProps = { calls: CalendarCall[]; onPrep: (id: string) => void; onClose: () => void }

export function CallsCard({ calls, onPrep, onClose }: CallsProps) {
  return (
    <Card
      label="Today"
      title="Calls today"
      sections={[
        {
          body:
            calls.length === 0 ? (
              <p className="text-ink-2">No calls left today</p>
            ) : (
              <ul className="flex flex-col">
                {calls.map((c) => {
                  const at = new Date(c.startsAt)
                  return (
                    <li key={c.id} className="flex min-h-12 items-center gap-4 border-b border-rule" data-call>
                      <span className="shrink-0 font-mono text-label tabular-nums text-ink">
                        {ukTime(at)} <span className="text-ink-3">{easternTime(at)} ET</span>
                      </span>
                      <span className="min-w-0 flex-1 truncate">{c.personName ?? c.title}</span>
                      <span className="hidden truncate text-ink-2 sm:inline">{callTypeWord[c.callType] ?? c.title}</span>
                      <TextLink label="Prep" onClick={() => onPrep(c.id)} />
                    </li>
                  )
                })}
              </ul>
            ),
        },
      ]}
      onClose={onClose}
    />
  )
}

const referenceQuestions = [
  'How long did you work together, and in what roles?',
  'What were they responsible for, and what did they deliver?',
  'How did they work with product, sales and leadership?',
  'Where would they need support?',
  'Would you hire them again?',
]

type PrepProps = {
  call: CalendarCall
  /** Chases the owner is waiting on, for a client update. */
  waitingOn: FollowUp[]
  week: WeekTargets | undefined
  onClose: () => void
}

export function PrepCard({ call, waitingOn, week, onClose }: PrepProps) {
  const at = new Date(call.startsAt)
  const who = call.personName ?? call.title
  const sections = (() => {
    switch (call.callType) {
      case 'candidate_screen':
        return [
          { label: 'The role', body: <p>{call.title}</p> },
          { label: 'From the brief', body: <p className="text-ink-2">The brief and what the client cares about arrive with searches, in phase 2.</p> },
          { label: 'Last contact', body: <p className="text-ink-2">Last contact arrives with the league, in week 4.</p> },
        ]
      case 'coaching':
        return [
          { label: 'League', body: <p className="text-ink-2">Tier and last touch arrive with the league, in week 4.</p> },
          {
            label: 'The standing questions',
            body: (
              <ul className="flex flex-col gap-1">
                {coachingQuestions.map((q) => (
                  <li key={q.key}>{q.question}</li>
                ))}
              </ul>
            ),
          },
        ]
      case 'client_update': {
        const theirs = waitingOn.filter((f) => f.personName === who)
        return [
          { label: 'Stage counts', body: <p className="text-ink-2">Stage counts arrive with searches, in phase 2.</p> },
          {
            label: 'Waiting on feedback',
            body:
              theirs.length === 0 ? (
                <p className="text-ink-2">Nothing outstanding</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {theirs.map((f) => (
                    <li key={f.id}>{f.reason}</li>
                  ))}
                </ul>
              ),
          },
        ]
      }
      case 'reference':
        return [
          {
            label: 'Reference questions',
            body: (
              <ol className="flex flex-col gap-1">
                {referenceQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            ),
          },
          { label: 'What the client asked to cover', body: <p className="text-ink-2">Arrives with searches, in phase 2.</p> },
        ]
      case 'internal':
        return [
          { label: 'Live searches', body: <p className="text-ink-2">Arrive with searches, in phase 2.</p> },
          { label: 'This week', body: <p className="font-mono tabular-nums">{week ? `${week.hit}/${week.total}` : '–'}</p> },
        ]
      default:
        return [{ body: <p>{call.title}</p> }]
    }
  })()

  return (
    <Card
      label={callTypeWord[call.callType] ?? 'Call'}
      title={who}
      sections={sections}
      links={call.crmUrl ? <TextLink label="Open in CRM" href={call.crmUrl} /> : undefined}
      foot={`${ukTime(at)}, ${easternTime(at)} ET`}
      onClose={onClose}
    />
  )
}
