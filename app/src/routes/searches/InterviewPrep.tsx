import { useState } from 'react'
import { Draft } from '../../components/Draft'
import { Field } from '../../components/Field'
import { PillButton } from '../../components/PillButton'
import { TextLink } from '../../components/TextLink'
import { prepBody, prepKindWord, prepSubject, type PrepKind } from '../../lib/interviewPrep'
import { composeLink } from '../../lib/send'

type Props = {
  client: string
  role: string
  confidential?: boolean
  /** Known when it opens from a candidate; typed otherwise, since the pipeline lives in the CRM. */
  name?: string
  interviewAt?: string | null
  /** Called when the draft is opened in Outlook or copied, so the candidate can be marked. */
  onUsed?: () => void
  onClose: () => void
}

const kinds: PrepKind[] = ['email', 'call', 'both']

// Candidate interview prep (Jason, 16 November 2026). Three choices, one
// draft he can edit, then Open in Outlook or Copy. Nothing is sent from here
// and nothing is stored: the candidate's address is typed in Outlook.
export function InterviewPrep({ client, role, confidential, name: given, interviewAt, onUsed, onClose }: Props) {
  const [name, setName] = useState(given ?? '')
  const [kind, setKind] = useState<PrepKind>('both')
  const [edited, setEdited] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const input = { kind, name, client, role, interviewAt, confidential }
  const written = prepBody(input)
  const text = edited ?? written

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      onUsed?.()
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 border-t border-rule pt-4" aria-label="Interview prep" data-interview-prep>
      <h4 className="label-caps text-ink-2">Interview prep</h4>
      {given === undefined && <Field label="Candidate" value={name} onChange={(v) => { setName(v); setCopied(false) }} placeholder="Their name" autoFocus />}
      <div className="flex flex-wrap gap-2" role="group" aria-label="What to send">
        {kinds.map((k) => (
          <PillButton key={k} label={prepKindWord[k]} current={k === kind} onClick={() => { setKind(k); setEdited(null); setCopied(false) }} />
        ))}
      </div>
      <Draft text={text} original={written} onChange={(t) => { setEdited(t); setCopied(false) }} />
      <div className="flex flex-wrap items-center gap-6">
        <TextLink label="Open in Outlook" icon="mail" onClick={() => { window.open(composeLink(null, prepSubject(input), text), '_blank', 'noopener'); onUsed?.() }} />
        <TextLink label={copied ? 'Copied' : 'Copy'} onClick={() => void copy()} />
        <TextLink label="Close" onClick={onClose} />
      </div>
      <p className="font-mono text-label text-ink-3">Opens a draft in Outlook. Add their address there; nothing goes until you press Send.</p>
    </section>
  )
}
