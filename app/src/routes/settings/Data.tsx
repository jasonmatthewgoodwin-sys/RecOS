import { useState, type FormEvent } from 'react'
import { Field } from '../../components/Field'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { TextLink } from '../../components/TextLink'
import { data, type FoundPerson } from '../../lib/data'
import { downloadJson } from '../../lib/download'
import { invalidate, useQuery } from '../../lib/query'
import { settings } from '../../lib/sections'
import { runWhen } from '../../lib/settings'

// Settings, Data (32.4, 15.7, 15.8, 34.5): find a person and see where they
// appear, export or delete them; the do-not-contact list with Add; export
// everything; the integrations; the last 50 audit entries; the retention
// periods, read only. A delete asks for the word DELETE and shows the counts
// (T-SET-5).

const DNC_KEY = 'settings.doNotContact'
const AUDIT_KEY = 'settings.audit'

const tableWord: [string, string, string][] = [
  ['league_members', 'list place', 'list places'],
  ['league_history', 'list move', 'list moves'],
  ['touches', 'touch', 'touches'],
  ['signals', 'signal', 'signals'],
  ['follow_ups', 'follow-up', 'follow-ups'],
  ['inbox_items', 'inbox item', 'inbox items'],
  ['messages', 'message', 'messages'],
  ['calendar_today', 'call today', 'calls today'],
  ['coaching_sessions', 'coaching session', 'coaching sessions'],
  ['referrals', 'referral', 'referrals'],
  ['job_leads', 'job lead', 'job leads'],
  ['wider_leads', 'wider lead', 'wider leads'],
  ['do_not_contact', 'do-not-contact entry', 'do-not-contact entries'],
  ['people', 'person row', 'person rows'],
]

/** 1 list place, 2 touches, in a fixed order. */
export function countsWords(counts: Record<string, number | string>): string {
  const parts = tableWord
    .map(([k, one, many]) => {
      const v = counts[k]
      return typeof v === 'number' && v > 0 ? `${v} ${v === 1 ? one : many}` : null
    })
    .filter((p): p is string => p !== null)
  return parts.length ? parts.join(', ') : 'nothing else'
}

const retention: [string, string][] = [
  ['Inbox items', 'Drafts cleared 30 days after closing. Deleted after 12 months'],
  ['Messages', 'Body and address cleared 30 days after sending. Deleted after 24 months'],
  ['Send log', '24 months'],
  ['Follow-ups', '12 months after completion'],
  ['Job leads', '12 months after going dead, or after last seen if never chased'],
  ['Signals', '90 days after expiring or being ignored. 12 months after being actioned'],
  ['Referrals', '24 months after received'],
  ['Touches', '24 months'],
  ['Coaching sessions', 'Answers and advice cleared after 12 months'],
  ['League members', '12 months after removal, with history'],
  ['People', 'When nothing refers to them and not updated for 12 months'],
  ['Agent runs', '90 days'],
  ['Audit log', '24 months'],
  ['Calls today', 'Emptied every night'],
  ['KPI events', 'Kept. They hold no personal data'],
]

function Heading({ text }: { text: string }) {
  return <h2 className="label-caps text-ink-2">{text}</h2>
}

function FindPerson({ onNote }: { onNote: (t: string) => void }) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<FoundPerson[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState<string | null>(null)

  async function find(e: FormEvent) {
    e.preventDefault()
    if (query.trim().length < 2) {
      onNote('Type at least two characters.')
      return
    }
    setBusy(true)
    setDone(null)
    try {
      setFound(await data.personFind(query))
      invalidate(AUDIT_KEY)
    } catch {
      onNote('That did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function exportOne(p: FoundPerson) {
    try {
      downloadJson(`recos-${p.displayName.toLowerCase().replace(/\s+/g, '-')}.json`, await data.personExport(p.id))
      invalidate(AUDIT_KEY)
    } catch {
      onNote('That did not work. Try again.')
    }
  }

  async function remove(p: FoundPerson) {
    try {
      const counts = await data.personDelete(p.id, confirm)
      setFound((xs) => (xs ?? []).filter((x) => x.id !== p.id))
      setDeleting(null)
      setConfirm('')
      setDone(`Removed ${p.displayName}: ${countsWords(counts)}. The CRM record was not touched.`)
      invalidate(AUDIT_KEY)
      invalidate('people')
      invalidate('home')
    } catch {
      onNote('Type DELETE to confirm.')
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Find a person">
      <Heading text="Find a person" />
      <form onSubmit={(e) => void find(e)} className="flex items-end gap-4">
        <div className="w-64">
          <Field label="Name or email" value={query} onChange={setQuery} />
        </div>
        <PillButton label="Find" type="submit" busy={busy} />
      </form>
      {found && found.length === 0 && <EmptyLine text="No one by that name" />}
      {found && found.length > 0 && (
        <ul className="flex flex-col divide-y divide-rule" aria-label="People found">
          {found.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <span className="text-body text-ink">{p.displayName}</span>
                <span className="text-body text-ink-2">{[p.displayTitle, p.displayCompany].filter(Boolean).join(', ')}</span>
              </div>
              <p className="text-body text-ink-2">Appears in {countsWords(p.counts)}.</p>
              {deleting === p.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void remove(p)
                  }}
                  className="flex items-end gap-4"
                  aria-label={`Delete ${p.displayName}`}
                >
                  <div className="w-40">
                    <Field label="Type DELETE" value={confirm} onChange={setConfirm} autoFocus />
                  </div>
                  <PillButton label="Delete for good" type="submit" />
                  <TextLink label="Cancel" onClick={() => setDeleting(null)} />
                </form>
              ) : (
                <div className="flex gap-6">
                  <TextLink label="Export" onClick={() => void exportOne(p)} />
                  <TextLink label="Delete" onClick={() => setDeleting(p.id)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {done && <p className="text-body text-ink">{done}</p>}
    </section>
  )
}

function BlockList({ onNote }: { onNote: (t: string) => void }) {
  const blocked = useQuery(DNC_KEY, data.doNotContact)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', company: '', scope: 'person', reason: '' })
  const [problem, setProblem] = useState<string | undefined>()

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim() && !form.company.trim()) {
      setProblem('A name or a company.')
      return
    }
    try {
      await data.addDoNotContact({ name: form.name, company: form.company, scope: form.scope as 'person' | 'company', reason: form.reason })
      invalidate(DNC_KEY)
      setAdding(false)
      setForm({ name: '', company: '', scope: 'person', reason: '' })
      setProblem(undefined)
    } catch {
      onNote('That did not save. Try again.')
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Do-not-contact list">
      <Heading text="Do-not-contact list" />
      {blocked.status === 'loading' && !blocked.data ? (
        <Dots />
      ) : (blocked.data?.length ?? 0) === 0 ? (
        <EmptyLine text="Nobody is blocked" />
      ) : (
        <ul className="flex flex-col divide-y divide-rule" aria-label="Blocked">
          {blocked.data?.map((b) => (
            <li key={b.id} className="flex min-h-10 flex-wrap items-center gap-x-6 py-1 text-body">
              <span className="text-ink">{b.name ?? b.company}</span>
              {b.name && b.company && <span className="text-ink-2">{b.company}</span>}
              <span className="label-caps text-ink-2">{b.scope === 'company' ? 'Whole company' : 'Person'}</span>
              {b.reason && <span className="text-ink-2">{b.reason}</span>}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form onSubmit={(e) => void add(e)} className="flex max-w-prose flex-col gap-4" aria-label="Add to the list">
          <div className="grid grid-cols-2 gap-6">
            <Field label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} error={problem} autoFocus />
            <Field label="Company" value={form.company} onChange={(company) => setForm({ ...form, company })} />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <Field
              label="Scope"
              kind="choice"
              value={form.scope}
              choices={[
                { value: 'person', label: 'This person' },
                { value: 'company', label: 'The whole company' },
              ]}
              onChange={(scope) => setForm({ ...form, scope })}
            />
            <Field label="Why" value={form.reason} onChange={(reason) => setForm({ ...form, reason })} />
          </div>
          <div className="flex items-center gap-6">
            <PillButton label="Add" type="submit" />
            <TextLink label="Cancel" onClick={() => setAdding(false)} />
          </div>
        </form>
      ) : (
        <div>
          <TextLink label="Add" onClick={() => setAdding(true)} />
        </div>
      )}
    </section>
  )
}

export function Data() {
  const audit = useQuery(AUDIT_KEY, () => data.auditLog(50))
  const [note, setNote] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const tabs = settings.pages.map((p) => ({ label: p.label, route: `${settings.path}/${p.slug}` }))

  async function exportAll() {
    setExporting(true)
    try {
      downloadJson(`recos-export-${new Date().toISOString().slice(0, 10)}.json`, await data.exportEverything())
      invalidate(AUDIT_KEY)
    } catch {
      setNote('That did not work. Try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={settings.label} tabs={tabs} />

      <div className="flex max-w-prose flex-col gap-8">
        <FindPerson onNote={setNote} />
        <BlockList onNote={setNote} />

        <section className="flex flex-col gap-4" aria-label="Export everything">
          <Heading text="Export everything" />
          <p className="text-body text-ink-2">One file with every table you can read. Message bodies and drafts are left out. Each export is logged.</p>
          <div>
            <PillButton label="Export everything" kind="primary" busy={exporting} onClick={() => void exportAll()} />
          </div>
        </section>

        <section className="flex flex-col gap-4" aria-label="Integrations">
          <Heading text="Integrations" />
          <ul className="flex flex-col divide-y divide-rule" aria-label="Integrations">
            {['Outlook', 'Granola', 'CRM', 'Drive'].map((name) => (
              <li key={name} className="flex min-h-10 items-center gap-6 py-1 text-body">
                <span className="w-24 text-ink">{name}</span>
                <span className="label-caps text-ink-2">Not connected</span>
                <span className="text-ink-2">Arrives with the adapters</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-4" aria-label="Audit log">
          <Heading text="Audit log" />
          {audit.status === 'loading' && !audit.data ? (
            <Dots />
          ) : (audit.data?.length ?? 0) === 0 ? (
            <EmptyLine text="Nothing logged yet" />
          ) : (
            <ul className="flex flex-col divide-y divide-rule font-mono text-label text-ink" aria-label="Audit entries">
              {audit.data?.map((e) => (
                <li key={e.id} className="flex min-h-8 items-center gap-4 py-1">
                  <span className="w-20 shrink-0 text-ink-2">{runWhen(e.at)}</span>
                  <span>{e.action}</span>
                  {e.detail && <span className="truncate text-ink-2">{Object.values(e.detail).map(String).join(', ')}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4" aria-label="Retention">
          <Heading text="Retention" />
          <table className="border-collapse text-body text-ink" aria-label="Retention periods">
            <tbody>
              {retention.map(([what, rule]) => (
                <tr key={what} className="border-b border-rule">
                  <td className="py-2 pr-8 align-top">{what}</td>
                  <td className="py-2 align-top text-ink-2">{rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
