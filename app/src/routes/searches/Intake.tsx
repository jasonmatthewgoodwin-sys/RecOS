import { useId, useRef, useState } from 'react'
import { Field } from '../../components/Field'
import { PillButton } from '../../components/PillButton'
import { TextLink } from '../../components/TextLink'
import { ROLE_TYPES, saveSearchJd, saveSearchRoleType, type RoleType, type SearchIntake } from '../../lib/data'
import { textFromFile, wordCount } from '../../lib/jdFile'
import { setQueryData } from '../../lib/query'

// The intake on Pre-brief (Jason, 18 November 2026): the role type in his own
// words or one of the seven, saved as soon as he leaves the field, and the
// job description pasted or read from a PDF or Word file. Only the text is
// kept; the file never leaves the browser.

export const intakeKey = (id: string) => `searches.intake.${id}`

const roleTypeWord: Record<RoleType, string> = {
  ic_pmm: 'Product marketing manager',
  senior_pmm: 'Senior PMM',
  technical_pmm: 'Technical PMM',
  head_of_pmm: 'Head of product marketing',
  director_vp_pmm: 'Director or VP',
  plg_pmm: 'Product-led growth PMM',
  other: 'Other',
}

/** What the field shows for a saved value: a code's words, or his own words as typed. */
function roleTypeText(saved: string | null | undefined): string {
  if (!saved) return ''
  return (roleTypeWord as Record<string, string>)[saved] ?? saved
}

/** What is saved for what he typed: a code when it is one of the choices' words, his own words otherwise. */
function roleTypeValue(typed: string): string | null {
  const t = typed.trim()
  if (!t) return null
  const lower = t.toLowerCase()
  const hit = (Object.entries(roleTypeWord) as [RoleType, string][]).find(([code, word]) => word.toLowerCase() === lower || code === t)
    ?? ROLE_TYPES.map((r) => [r.value, r.label] as [RoleType, string]).find(([, label]) => label.toLowerCase() === lower)
  return hit && hit[0] !== 'other' ? hit[0] : t
}

type Props = { searchId: string; intake: SearchIntake | undefined; onNote: (t: string) => void }

function saveIntake(searchId: string, change: Partial<SearchIntake>) {
  setQueryData<SearchIntake>(intakeKey(searchId), (i) => ({ roleType: null, jdText: null, briefDueOn: null, ...(i ?? {}), ...change }))
}

/** Role type: pick one of the seven or type his own. Saved on leaving the field or on Enter. */
export function RoleTypeField({ searchId, intake, onNote }: Props) {
  const listId = useId()
  const [typed, setTyped] = useState<string | null>(null)
  const shown = typed ?? roleTypeText(intake?.roleType)

  async function save() {
    if (typed === null) return
    const value = roleTypeValue(typed)
    if (value === (intake?.roleType ?? null)) return
    const before = intake?.roleType ?? null
    saveIntake(searchId, { roleType: value })
    try {
      await saveSearchRoleType(searchId, value)
      setTyped(null)
    } catch {
      saveIntake(searchId, { roleType: before })
      onNote('The role type did not save. Try again.')
    }
  }

  return (
    <div data-field className="flex flex-col gap-2">
      <label htmlFor={`${listId}-input`} className="label-caps text-ink-2">
        Role type
      </label>
      <input
        id={`${listId}-input`}
        list={listId}
        value={shown}
        placeholder="Pick one, or type your own"
        onChange={(e) => setTyped(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void save()
          }
        }}
        className="min-h-10 w-full border-b border-rule bg-transparent text-body text-ink outline-none placeholder:text-ink-3 focus:border-ink"
      />
      <datalist id={listId}>
        {ROLE_TYPES.filter((r) => r.value !== 'other').map((r) => (
          <option key={r.value} value={roleTypeWord[r.value]} />
        ))}
      </datalist>
    </div>
  )
}

/** The job description: paste it, or read it from a PDF or Word file. Word count, Replace and Clear. */
export function JobDescription({ searchId, intake, onNote }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'paste' | 'file' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [from, setFrom] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const jd = intake?.jdText ?? null
  const words = wordCount(jd)

  async function save(value: string | null, how: 'paste' | 'file', fileName?: string) {
    setBusy(how)
    setProblem(null)
    try {
      await saveSearchJd(searchId, value)
      saveIntake(searchId, { jdText: value?.trim() || null })
      setEditing(false)
      setText('')
      setFrom(fileName ?? null)
    } catch (e) {
      const msg = e instanceof Error && /too long/.test(e.message) ? 'That is too long. Keep it under 60,000 characters.' : 'The job description did not save. Try again.'
      if (how === 'file') setProblem(msg)
      else onNote(msg)
    } finally {
      setBusy(null)
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy('file')
    setProblem(null)
    try {
      const read = await textFromFile(file)
      await save(read, 'file', file.name)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not read that file.')
      setBusy(null)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
      className="sr-only"
      aria-label="Job description file"
      tabIndex={-1}
      onChange={(e) => void pick(e.target.files?.[0])}
    />
  )

  if (jd && !editing) {
    return (
      <section className="flex flex-col gap-2" aria-label="The job description">
        <h4 className="label-caps text-ink-2">Job description</h4>
        <p className="font-mono text-label text-ink-2" data-testid="jd-words">
          On file, {words} {words === 1 ? 'word' : 'words'}
          {from ? `, read from ${from}` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-x-6">
          <TextLink label={reading ? 'Hide' : 'Read it'} onClick={() => setReading((r) => !r)} />
          <TextLink label="Replace" onClick={() => { setEditing(true); setText(jd) }} />
          <TextLink label="Read from a file" onClick={() => fileRef.current?.click()} />
          <TextLink label="Clear" onClick={() => void save(null, 'paste')} />
          {busy === 'file' && <span className="font-mono text-label text-ink-3">Reading the file</span>}
        </div>
        {fileInput}
        {problem && <p className="text-body text-ink-2">{problem}</p>}
        {reading && <p className="max-h-72 max-w-prose overflow-y-auto whitespace-pre-wrap border-l border-rule pl-4 text-body text-ink-2">{jd}</p>}
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3" aria-label="The job description">
      <Field label="Job description" kind="lines" rows={5} value={text} onChange={setText} placeholder="Paste the job description here" />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <PillButton label="Save" busy={busy === 'paste'} disabled={!text.trim()} onClick={() => void save(text, 'paste')} />
        <TextLink label="Or read a PDF or Word file" icon="plus" onClick={() => fileRef.current?.click()} />
        {editing && <TextLink label="Keep the one on file" onClick={() => { setEditing(false); setText('') }} />}
        {busy === 'file' && <span className="font-mono text-label text-ink-3">Reading the file</span>}
        {text.trim() && <span className="font-mono text-label text-ink-3">{wordCount(text)} words</span>}
      </div>
      {fileInput}
      {problem && <p className="text-body text-ink-2">{problem}</p>}
      <p className="font-mono text-label text-ink-3">Only the text is kept. The file stays on your computer.</p>
    </section>
  )
}
