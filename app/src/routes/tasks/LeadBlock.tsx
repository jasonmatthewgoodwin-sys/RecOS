import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Draft } from '../../components/Draft'
import { Field } from '../../components/Field'
import { TextLink } from '../../components/TextLink'
import { leadEmail, leadLine, leadMove, leadStatus, type Task, type TaskLead } from '../../lib/tasks'

type Props = {
  task: Task
  lead: TaskLead
  /** The LinkedIn words on the card: the connection note, or the first message once connected. */
  text: string
  onText: (body: string) => void
}

// A job lead from LinkedIn (Jason, 17 November 2026): where it came from in
// plain words, where the outreach stands, the LinkedIn words for this step,
// and an email kept to copy for when the campaign tools are not to hand.
// The ladder: connect, wait, message once connected, then chase.
export function LeadBlock({ task, lead, text, onText }: Props) {
  const move = leadMove(lead)
  const start = leadEmail(task)
  const [subject, setSubject] = useState(start.subject)
  const [body, setBody] = useState(start.body)
  const [copied, setCopied] = useState(false)
  const navigate = useNavigate()

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="lead-block" data-move={move}>
      <div className="flex flex-col gap-1">
        <p className="font-mono text-label text-ink-2" data-testid="lead-line">
          {leadLine(task)}
        </p>
        <p className="text-body text-ink" data-testid="lead-status">
          {leadStatus(lead)}
        </p>
        <p className="flex flex-wrap gap-x-6">
          {lead.profileUrl && <TextLink label={`${lead.posterName?.split(' ')[0] ?? 'Poster'} on LinkedIn`} href={lead.profileUrl} icon="open" />}
          {lead.connectHold === 'Template needs approval' && <TextLink label="Approve the note" onClick={() => navigate('/settings/templates')} />}
          {lead.connectState && <TextLink label="Send engine" onClick={() => navigate('/settings/send-rules')} />}
        </p>
      </div>

      {move === 'message' && <Draft label="LinkedIn message" text={text} original={task.draftOriginal ?? undefined} onChange={onText} />}
      {(move === 'connect' || move === 'waiting') && lead.stage === 'found' && (
        <div className="flex flex-col gap-1">
          <span className="label-caps text-ink-2">Connection note</span>
          {text ? <p className="whitespace-pre-wrap text-body text-ink-2">{text}</p> : null}
          <p className="font-mono text-label text-ink-3">The note you approve in Settings, Templates goes with every request. Up to 10 a day, 20 a week.</p>
        </div>
      )}

      <details className="group" data-testid="lead-email">
        <summary className="label-caps cursor-pointer text-ink-2 hover:text-ink">Email, to copy</summary>
        <div className="mt-3 flex flex-col gap-4">
          <Field label="Subject" value={subject} onChange={(v) => { setSubject(v); setCopied(false) }} />
          <Draft label="Email" text={body} original={start.body} onChange={(v) => { setBody(v); setCopied(false) }} />
          <span>
            <TextLink label={copied ? 'Copied' : 'Copy email'} onClick={() => void copyEmail()} />
          </span>
        </div>
      </details>
    </div>
  )
}
