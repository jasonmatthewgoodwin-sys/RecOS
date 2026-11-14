import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../../components/Card'
import { isOutlookLink } from '../../lib/links'
import { Draft } from '../../components/Draft'
import { Field } from '../../components/Field'
import { PillButton } from '../../components/PillButton'
import { Steps } from '../../components/Steps'
import { TextLink } from '../../components/TextLink'
import type { JobLead, JobStage } from '../../lib/data'
import { cityName, deadReasonWord, deadReasons, nextStage, primaryLabel, sourceWord, stagePills, stageWord } from '../../lib/leads'

export type CardMode = 'view' | 'bin' | 'pass'

type Props = {
  lead: JobLead
  mode: CardMode
  onMode: (mode: CardMode) => void
  onStage: (stage: JobStage, deadReason?: string) => void
  onPass: (colleague: string) => void
  onClose: () => void
}

function longDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}

// The job card (28.2): header, fit, sources, poster, suggested people, draft,
// stage pills, one primary and the quiet links. Names only, never contact
// details (CLAUDE.md, rule 1).
export function JobCard({ lead, mode, onMode, onStage, onPass, onClose }: Props) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState(lead.draft ?? '')
  const [reason, setReason] = useState('')
  const [colleague, setColleague] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const open = lead.stage !== 'dead' && lead.stage !== 'passed'
  const primary = primaryLabel(lead)
  const next = nextStage(lead.stage)

  function pick(stage: JobStage) {
    setProblem(null)
    if (stage === lead.stage) return
    if (stage === 'job_won') {
      setProblem('Job won needs a search. Searches arrive in phase 2.')
      return
    }
    if (stage === 'dead') {
      onMode('bin')
      return
    }
    onStage(stage)
  }

  function confirmBin() {
    if (!reason) {
      setProblem('Choose a reason')
      return
    }
    onStage('dead', reason)
    onMode('view')
    setProblem(null)
  }

  function confirmPass() {
    if (!colleague.trim()) {
      setProblem('Say who takes it')
      return
    }
    onPass(colleague.trim())
    onMode('view')
    setProblem(null)
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const header = [lead.company, cityName(lead.city)].filter(Boolean).join(', ')

  const sections = [
    { body: <p className="text-ink-2">{header}</p> },
    ...(lead.stage === 'dead'
      ? [{ label: 'Dead', body: <p>{deadReasonWord(lead.deadReason)}</p> }]
      : lead.stage === 'passed'
        ? [{ label: 'Passed', body: <p>Handed to a colleague. It lives under Wider business now.</p> }]
        : []),
    ...(lead.fitReason ? [{ label: 'Fit', body: <p>{lead.fitReason}</p> }] : []),
    ...(lead.sources.length > 0
      ? [
          {
            label: 'Sources',
            body: (
              <ul className="flex flex-wrap gap-x-6">
                {lead.sources.map((s, i) => {
                  const word = sourceWord[s] ?? s
                  const url = lead.sourceUrls[i]
                  return <li key={`${s}-${i}`}>{url ? <TextLink label={isOutlookLink(url) ? `${word}: open the email` : word} href={url} icon="open" /> : <span className="inline-flex min-h-10 items-center text-ink-2">{word}</span>}</li>
                })}
              </ul>
            ),
          },
        ]
      : []),
    ...(lead.posterName
      ? [
          {
            label: 'Poster',
            body: (
              <p className="flex flex-wrap items-baseline gap-x-6">
                <span>
                  {lead.posterName}
                  {lead.posterTitle && <span className="text-ink-2">, {lead.posterTitle}</span>}
                </span>
                {lead.posterProfileUrl && <TextLink label="Open profile" href={lead.posterProfileUrl} />}
              </p>
            ),
          },
        ]
      : []),
    ...(lead.matched.length > 0
      ? [
          {
            label: 'Suggested people',
            body: (
              <ul className="flex flex-col gap-1">
                {lead.matched.slice(0, 3).map((m) => (
                  <li key={m.name} className="flex flex-wrap items-baseline gap-x-3">
                    {m.personId ? (
                      <TextLink label={m.name} onClick={() => navigate(`/people/league?card=person:${m.personId}`)} />
                    ) : (
                      <span>{m.name}</span>
                    )}
                    <span className="text-ink-2">{m.reason}</span>
                  </li>
                ))}
              </ul>
            ),
          },
        ]
      : []),
    ...(lead.draft !== null && open
      ? [
          {
            body: (
              <Draft
                label={lead.existingClient ? 'Introduction' : 'Draft'}
                text={draft}
                original={lead.draft}
                onChange={(t) => {
                  setDraft(t)
                  setCopied(false)
                }}
              />
            ),
          },
        ]
      : []),
    {
      label: 'Stage',
      body: (
        <div className="flex flex-col gap-4">
          <Steps
            steps={['new', 'chased', 'replied', 'meeting_booked', 'job_won'].map((k) => ({ key: k, label: stageWord[k as JobStage] }))}
            at={open ? lead.stage : 'job_won'}
            tone={!open ? 'clear' : lead.stage === 'new' ? 'new' : lead.stage === 'replied' ? 'action' : 'pending'}
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Stage">
            {stagePills.map((s) => (
              <PillButton key={s} label={stageWord[s]} current={s === lead.stage} disabled={!open} onClick={() => pick(s)} />
            ))}
          </div>
          {mode === 'bin' && (
            <div className="flex flex-col gap-4">
              <Field
                label="Reason"
                kind="choice"
                value={reason}
                onChange={(v) => {
                  setReason(v)
                  setProblem(null)
                }}
                choices={deadReasons}
                placeholder="Why it is dead"
                error={problem ?? undefined}
                autoFocus
              />
              <div className="flex items-center gap-6">
                <PillButton label="Bin" onClick={confirmBin} />
                <TextLink label="Keep it" onClick={() => onMode('view')} />
              </div>
            </div>
          )}
          {mode === 'pass' && (
            <div className="flex flex-col gap-4">
              <Field
                label="Colleague"
                value={colleague}
                onChange={(v) => {
                  setColleague(v)
                  setProblem(null)
                }}
                placeholder="Who takes it"
                error={problem ?? undefined}
                autoFocus
              />
              <div className="flex items-center gap-6">
                <PillButton label="Pass" onClick={confirmPass} />
                <TextLink label="Keep it" onClick={() => onMode('view')} />
              </div>
            </div>
          )}
          {mode === 'view' && problem && <p className="text-ink-2">{problem}</p>}
        </div>
      ),
    },
  ]

  return (
    <Card
      label="Job"
      title={lead.role}
      sections={sections}
      primaryAction={open && primary && next ? { label: primary, onClick: () => onStage(next) } : undefined}
      links={
        open ? (
          <>
            {lead.draft !== null && <TextLink label={copied ? 'Copied' : 'Copy draft'} onClick={copyDraft} />}
            {mode !== 'pass' && <TextLink label="Pass to a colleague" onClick={() => onMode('pass')} />}
            {mode !== 'bin' && <TextLink label="Bin" onClick={() => onMode('bin')} />}
          </>
        ) : undefined
      }
      foot={`First seen ${longDate(lead.firstSeenOn)}`}
      onClose={onClose}
    />
  )
}
