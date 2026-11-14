import { useState } from 'react'
import { Card } from '../../components/Card'
import { Field } from '../../components/Field'
import { PillButton } from '../../components/PillButton'
import { TextLink } from '../../components/TextLink'
import { cityName } from '../../lib/leads'
import { data, type Member, type PeopleList, type Tier, type Touch } from '../../lib/data'
import { signalWord, sinceWord, tierWord, tiers } from '../../lib/people'
import { useQuery } from '../../lib/query'

type Mode = 'view' | 'tier' | 'remove' | 'dnc'

type Props = {
  member: Member
  list: PeopleList | undefined
  today: string
  onReply: () => void
  onTier: (tier: Tier, reason: string) => void
  onNotes: (notes: string) => void
  onRemove: (reason: string) => void
  onDoNotContact: () => void
  onClose: () => void
}

const kindWord: Record<string, string> = {
  call: 'Call',
  coaching: 'Coaching',
  meeting: 'Meeting',
  event_invite: 'Event invitation',
  event_attended: 'Event',
  message_replied: 'Reply',
  voice_note: 'Voice note',
  intro: 'Introduction',
  other: 'Touch',
}

// The person card (29.1): header, list and tier, next contact, the live
// signal, history, value, one primary and the quiet links. Never an email
// address or phone number (PEO-4): those are one click away in the CRM.
export function PersonCard({ member: m, list, today, onReply, onTier, onNotes, onRemove, onDoNotContact, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('view')
  const [tier, setTier] = useState<Tier>(m.tier)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState(m.notesForNextContact ?? '')
  const [problem, setProblem] = useState<string | undefined>()
  const [showAll, setShowAll] = useState(false)
  const touches = useQuery(`people.touches.${m.personId}`, () => data.touches(m.personId, 20))

  const history: Touch[] = touches.data ?? []
  const shown = showAll ? history : history.slice(0, 5)

  function confirmTier() {
    if (!reason.trim()) {
      setProblem('Say why, in a line')
      return
    }
    onTier(tier, reason.trim())
    setMode('view')
    setReason('')
    setProblem(undefined)
  }

  function confirmRemove() {
    if (!reason.trim()) {
      setProblem('Say why, in a line')
      return
    }
    onRemove(reason.trim())
  }

  const header = [m.title, m.company, cityName(m.city)].filter(Boolean).join(', ')

  return (
    <Card
      label={list?.name ?? 'People'}
      title={m.name}
      sections={[
        {
          body: (
            <div className="flex flex-col gap-2">
              {header && <p className="text-ink-2">{header}</p>}
              <p className="flex flex-wrap gap-x-6">
                {m.crmUrl && <TextLink label="Open in CRM" href={m.crmUrl} />}
                {m.profileUrl && <TextLink label="Open profile" href={m.profileUrl} />}
              </p>
            </div>
          ),
        },
        {
          label: 'List',
          body: (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Tier">
                {tiers.map((t) => (
                  <PillButton
                    key={t}
                    label={tierWord[t]}
                    current={mode !== 'tier' ? t === m.tier : t === tier}
                    onClick={() => {
                      setMode('tier')
                      setTier(t)
                      setProblem(undefined)
                    }}
                  />
                ))}
              </div>
              {m.why && mode !== 'tier' && <p className="text-ink-2">{m.why}</p>}
              {mode === 'tier' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    confirmTier()
                  }}
                  className="flex max-w-sm flex-col gap-4"
                  aria-label="Move tier"
                >
                  <Field label="Why" value={reason} onChange={(v) => { setReason(v); setProblem(undefined) }} placeholder="In a line" error={problem} autoFocus />
                  <div className="flex items-center gap-6">
                    <PillButton label={`Move to ${tierWord[tier]}`} type="submit" />
                    <TextLink label="Keep as is" onClick={() => { setMode('view'); setTier(m.tier) }} />
                  </div>
                </form>
              )}
            </div>
          ),
        },
        {
          label: 'Next contact',
          body: (
            <div className="flex flex-col gap-3">
              <Field label="Notes for next contact" value={notes} onChange={setNotes} placeholder="What to raise next time" />
              {notes !== (m.notesForNextContact ?? '') && (
                <div>
                  <TextLink label="Save notes" onClick={() => onNotes(notes)} />
                </div>
              )}
              <p className="font-mono text-label text-ink-2">
                Last touch {m.lastTouchOn ?? 'never'}. Next due {m.nextDueOn}
                {m.state === 'late' ? `, ${m.daysLate} days late` : ''}
              </p>
            </div>
          ),
        },
        ...(m.liveSignal
          ? [{ label: 'Signal', body: <p className="label-caps">{signalWord[m.liveSignal] ?? m.liveSignal}</p> }]
          : []),
        {
          label: 'History',
          body:
            history.length === 0 ? (
              <p className="text-ink-2">No touches recorded yet</p>
            ) : (
              <div className="flex flex-col gap-2">
                <ul className="flex flex-col gap-1">
                  {shown.map((t) => (
                    <li key={t.id} className="flex gap-4">
                      <span className="font-mono text-label text-ink-2">{t.touchedOn}</span>
                      <span>{kindWord[t.kind] ?? t.kind}</span>
                      {t.note && <span className="text-ink-2">{t.note}</span>}
                    </li>
                  ))}
                </ul>
                {!showAll && history.length > 5 && <TextLink label="Show all" onClick={() => setShowAll(true)} />}
              </div>
            ),
        },
        {
          label: 'Value',
          body: (
            <p className="font-mono text-label tabular-nums text-ink-2">
              {m.jobsBriefed} jobs briefed, {m.referralsGiven} referrals given, {m.introsMade} introductions
            </p>
          ),
        },
        ...(mode === 'remove'
          ? [
              {
                label: 'Remove from the list',
                body: (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      confirmRemove()
                    }}
                    className="flex max-w-sm flex-col gap-4"
                    aria-label="Remove from the list"
                  >
                    <Field label="Why" value={reason} onChange={(v) => { setReason(v); setProblem(undefined) }} placeholder="In a line" error={problem} autoFocus />
                    <div className="flex items-center gap-6">
                      <PillButton label="Remove" type="submit" />
                      <TextLink label="Keep them" onClick={() => setMode('view')} />
                    </div>
                  </form>
                ),
              },
            ]
          : mode === 'dnc'
            ? [
                {
                  label: 'Do not contact',
                  body: (
                    <div className="flex flex-col gap-4">
                      <p>They come off the list, their drafts are cancelled and their follow-ups are closed. This is not undone.</p>
                      <div className="flex items-center gap-6">
                        <PillButton label="Do not contact" onClick={onDoNotContact} />
                        <TextLink label="Keep them" onClick={() => setMode('view')} />
                      </div>
                    </div>
                  ),
                },
              ]
            : []),
      ]}
      primaryAction={{ label: 'Get in touch', onClick: () => window.open(m.profileUrl ?? m.crmUrl ?? undefined, '_blank', 'noopener') }}
      links={
        <>
          <TextLink label="Logged a reply" onClick={onReply} />
          {mode !== 'remove' && <TextLink label="Remove from list" onClick={() => { setMode('remove'); setReason(''); setProblem(undefined) }} />}
          {mode !== 'dnc' && <TextLink label="Do not contact" onClick={() => setMode('dnc')} />}
        </>
      }
      foot={`${tierWord[m.tier]}, last touch ${sinceWord(m.lastTouchOn, today).toLowerCase()}`}
      onClose={onClose}
    />
  )
}
