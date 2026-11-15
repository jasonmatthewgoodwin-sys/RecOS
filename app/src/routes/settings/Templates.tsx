import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Field } from '../../components/Field'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { RowList, type ListItem } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { data, type SendPolicy, type Template } from '../../lib/data'
import { invalidate, useQuery } from '../../lib/query'
import { settings } from '../../lib/sections'
import { SEND_VARIABLES, fillTemplate, sampleValues, templateWord, tooLong, unknownVariables } from '../../lib/send'
import { channelWord } from '../../lib/settings'

// Settings, Templates (12.5, 20.4, 32.4): a list of templates by message
// type. The card shows subject and body, the allowed variables as small
// pills that insert on click, a preview with sample values, and Approve.
// An unapproved template shows NEEDS APPROVAL. Editing an approved one
// makes the next version, unapproved, and automatic sending for that type
// waits until it is approved (TPL-1).

export const TEMPLATES_KEY = 'settings.templates'

export function Templates() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const templates = useQuery(TEMPLATES_KEY, data.templates)
  const policies = useQuery('settings.sendPolicies', data.sendPolicies)
  const [note, setNote] = useState<string | null>(null)
  const tabs = settings.pages.map((p) => ({ label: p.label, route: `${settings.path}/${p.slug}` }))
  const card = params.get('card')
  const chosen = card?.startsWith('template:') ? templates.data?.find((t) => t.id === card.slice(9)) : undefined
  const adding = card === 'template:new'
  const label = (type: string) => policies.data?.find((p) => p.type === type)?.label ?? type.replace(/_/g, ' ')

  function openCard(v: string) {
    setParams(
      (p) => {
        p.set('card', v)
        return p
      },
      { state: { card: true } },
    )
  }
  function closeCard() {
    if ((location.state as { card?: boolean } | null)?.card) {
      navigate(-1)
      return
    }
    setParams(
      (p) => {
        p.delete('card')
        return p
      },
      { replace: true },
    )
  }

  async function seed() {
    try {
      const n = await data.seedTemplates()
      invalidate(TEMPLATES_KEY)
      setNote(n > 0 ? `${n} starter templates added. None sends until you approve it.` : 'The starter templates are already here.')
    } catch {
      setNote('That did not save. Try again.')
    }
  }

  // Current versions first, by type; superseded ones after, dimmed.
  const rows: ListItem[] = [...(templates.data ?? [])]
    .sort((a, b) => Number(b.active) - Number(a.active) || label(a.type).localeCompare(label(b.type)) || b.version - a.version)
    .map((t) => {
      const w = templateWord(t)
      return {
        id: t.id,
        section: t.active ? 'In use' : 'Earlier versions',
        dot: t.approved && t.active ? ('solid' as const) : ('hollow' as const),
        done: !t.active,
        title: label(t.type),
        detail: `${t.name}, version ${t.version}`,
        meta: channelWord[t.channel],
        word: w === 'Approved' ? undefined : w,
        tone: w === 'Approved' ? ('clear' as const) : w === 'Needs approval' ? ('action' as const) : undefined,
        icon: 'mail' as const,
        onOpen: () => openCard(`template:${t.id}`),
      }
    })

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={settings.label} tabs={tabs} aside={<TextLink label="New template" icon="plus" onClick={() => openCard('template:new')} />} />
      {templates.status === 'loading' ? (
        <Dots />
      ) : templates.status === 'error' ? (
        <EmptyLine text="Could not load. Try again." />
      ) : (templates.data ?? []).length === 0 ? (
        <div className="flex flex-col gap-4">
          <EmptyLine text="No templates yet. Nothing sends by itself until a template is approved." />
          <div>
            <TextLink label="Add the starter templates" icon="plus" onClick={() => void seed()} />
          </div>
        </div>
      ) : (
        <RowList rows={rows} view="rows" emptyText="No templates yet." />
      )}
      {chosen && <TemplateCard key={chosen.id} t={chosen} policy={policies.data?.find((p) => p.type === chosen.type)} onNote={setNote} onClose={closeCard} />}
      {adding && policies.data && (
        <NewTemplateCard
          policies={policies.data.filter((p) => p.requiresTemplate)}
          onAdd={async (input) => {
            try {
              await data.addTemplate(input)
              invalidate(TEMPLATES_KEY)
              closeCard()
            } catch (e) {
              setNote(e instanceof Error && /TPL-|goes by/.test(e.message) ? e.message.replace(/^.*?: /, '') : 'That did not save. Try again.')
            }
          }}
          onClose={closeCard}
        />
      )}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}

function TemplateCard({ t, policy, onNote, onClose }: { t: Template; policy: SendPolicy | undefined; onNote: (text: string) => void; onClose: () => void }) {
  const [subject, setSubject] = useState(t.subject ?? '')
  const [body, setBody] = useState(t.body)
  const [busy, setBusy] = useState(false)
  const edited = subject !== (t.subject ?? '') || body !== t.body
  const unknown = unknownVariables(`${subject} ${body}`)
  const long = tooLong({ type: t.type, body })
  const w = templateWord(t)

  async function save() {
    if (unknown.length > 0 || long || !body.trim()) return
    setBusy(true)
    try {
      await data.saveTemplate(t.id, { subject: t.channel === 'email' ? subject.trim() || null : null, body })
      invalidate(TEMPLATES_KEY)
      onNote(t.approved ? `Saved as version ${t.version + 1}. It needs approval before anything sends by itself.` : 'Saved.')
    } catch {
      onNote('That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function approve() {
    setBusy(true)
    try {
      const n = await data.approveTemplate(t.id)
      invalidate(TEMPLATES_KEY)
      invalidate('settings.sendPolicies')
      onNote(n > 0 ? `Approved. ${n} waiting ${n === 1 ? 'message' : 'messages'} went through the engine.` : 'Approved.')
    } catch {
      onNote('That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      label={`${policy?.label ?? t.type}, ${w.toLowerCase()}`}
      title={`${t.name}, version ${t.version}`}
      tone={w === 'Approved' ? 'clear' : w === 'Needs approval' ? 'action' : undefined}
      sections={[
        {
          body: (
            <form
              className="flex flex-col gap-4"
              aria-label="Template"
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                void save()
              }}
            >
              {t.channel === 'email' && <Field label="Subject" value={subject} onChange={setSubject} />}
              <Field label="Body" kind="lines" rows={8} value={body} onChange={setBody} error={unknown.length > 0 ? `Unknown variable ${unknown.join(', ')}` : long ? `${body.length} characters. A connection note is 300 at most` : undefined} />
              <div className="flex flex-wrap gap-2" role="group" aria-label="Variables">
                {SEND_VARIABLES.map((v) => (
                  <button key={v} type="button" onClick={() => setBody((b) => `${b}${b.endsWith(' ') || b.endsWith('\n') || b === '' ? '' : ' '}{{${v}}}`)} className="inline-flex h-8 items-center rounded-pill border border-rule px-2.5 font-mono text-label text-ink-2 hover:border-ink hover:text-ink">
                    {v}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-6">
                {edited && <PillButton label={t.approved ? 'Save as a new version' : 'Save'} type="submit" kind={w === 'Approved' ? 'primary' : 'plain'} busy={busy} disabled={unknown.length > 0 || long || !body.trim()} />}
                {!t.approved && t.active && !edited && <PillButton label="Approve" kind="primary" busy={busy} onClick={() => void approve()} />}
                {!t.approved && t.active && edited && <span className="font-mono text-label text-ink-3">Save first, then approve</span>}
                {t.approved && !edited && <span className="font-mono text-label text-ink-2">Approved {t.approvedAt?.slice(0, 10)}</span>}
                {!t.active && <span className="font-mono text-label text-ink-3">Superseded by a later version</span>}
              </div>
            </form>
          ),
        },
        {
          label: 'Preview with sample values',
          body: (
            <div className="flex flex-col gap-2 font-mono text-label text-ink">
              {t.channel === 'email' && <p className="text-ink-2">Subject: {fillTemplate(subject, sampleValues) || '(none)'}</p>}
              <pre className="whitespace-pre-wrap font-mono text-label">{fillTemplate(body, sampleValues)}</pre>
            </div>
          ),
        },
      ]}
      foot={`${channelWord[t.channel]}. ${t.type === 'linkedin_connect' ? `${body.length} of 300 characters.` : `Variables: ${t.variables.length > 0 ? t.variables.join(', ') : 'none'}.`}`}
      onClose={onClose}
    />
  )
}

function NewTemplateCard({ policies, onAdd, onClose }: { policies: SendPolicy[]; onAdd: (input: { type: string; name: string; channel: 'email' | 'linkedin'; subject: string | null; body: string }) => Promise<void>; onClose: () => void }) {
  const [type, setType] = useState(policies[0]?.type ?? '')
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const policy = policies.find((p) => p.type === type)
  const channel: 'email' | 'linkedin' = policy?.channel === 'linkedin' ? 'linkedin' : 'email'
  const unknown = unknownVariables(`${subject} ${body}`)
  return (
    <Card
      label="Template"
      title="New template"
      tone="new"
      sections={[
        {
          body: (
            <form
              className="flex flex-col gap-4"
              aria-label="New template"
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                if (!name.trim() || !body.trim()) {
                  setProblem('A name and a body are needed')
                  return
                }
                if (unknown.length > 0) {
                  setProblem(`Unknown variable ${unknown.join(', ')}`)
                  return
                }
                void onAdd({ type, name: name.trim(), channel, subject: channel === 'email' ? subject.trim() || null : null, body })
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Message type" kind="choice" value={type} onChange={setType} choices={policies.map((p) => ({ value: p.type, label: p.label }))} />
                <Field label="Name" value={name} onChange={setName} placeholder="Starter" error={problem && !name.trim() ? problem : undefined} />
              </div>
              {channel === 'email' && <Field label="Subject" value={subject} onChange={setSubject} />}
              <Field label="Body" kind="lines" rows={6} value={body} onChange={setBody} error={problem && (!body.trim() || unknown.length > 0) ? problem : undefined} />
              <p className="font-mono text-label text-ink-3">Variables: {SEND_VARIABLES.map((v) => `{{${v}}}`).join(' ')}</p>
              <div>
                <PillButton label="Add" type="submit" kind="primary" />
              </div>
            </form>
          ),
        },
      ]}
      onClose={onClose}
    />
  )
}
