import { useEffect, useState, type FormEvent } from 'react'
import { Field } from '../../components/Field'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { MIN_PASSWORD_LENGTH, useAuth } from '../../lib/auth'
import { data, type AppSettings } from '../../lib/data'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { settings } from '../../lib/sections'
import { applyTheme, monoChoices, sansChoices } from '../../lib/theme'

// Settings, Profile (32.4): theme, fonts, the four Home numbers, working
// hours, deck or list, league cadence, health and feedback thresholds, the
// ICP, voice rules and post format, the reviewer, and the password (a
// departure agreed on 14 November 2026). Each field saves itself when left.

const KEY = 'settings.app'
const BLOCKS_KEY = 'settings.blocks'

const homeChoices = [
  { value: 'needs_you', label: 'Needs you' },
  { value: 'follow_ups', label: 'Follow-ups' },
  { value: 'calls_today', label: 'Calls today' },
  { value: 'this_week', label: 'This week' },
  { value: 'cold_searches', label: 'Cold searches' },
  { value: 'league_due', label: 'League due' },
  { value: 'drafts_to_post', label: 'Drafts to post' },
]

const days: [string, string][] = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
]

function Heading({ text }: { text: string }) {
  return <h2 className="label-caps text-ink-2">{text}</h2>
}

function Pills({ label, value, choices, onChange }: { label: string; value: string; choices: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-3" role="group" aria-label={label}>
      {choices.map((c) => (
        <PillButton key={c.value} label={c.label} current={value === c.value} onClick={() => onChange(c.value)} />
      ))}
    </div>
  )
}

function NumField({ label, value, onCommit }: { label: string; value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <Field
      label={label}
      value={text}
      onChange={setText}
      onBlur={() => {
        const n = Number(text.trim())
        if (Number.isInteger(n) && n > 0 && n !== value) onCommit(n)
        else setText(String(value))
      }}
    />
  )
}

function Password() {
  const auth = useAuth()
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [saved, setSaved] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    if (password !== again) {
      setError('The two do not match')
      return
    }
    setError(undefined)
    setBusy(true)
    const result = await auth.setPassword(password)
    setBusy(false)
    if (result === 'ok') {
      setSaved(true)
      setPassword('')
      setAgain('')
    } else {
      setError('That did not save. Try again')
    }
  }

  return (
    <form onSubmit={save} className="flex w-full max-w-sm flex-col items-start gap-6">
      <Heading text="Password" />
      <p className="text-body text-ink-2">Set one to sign in without an emailed link. At least {MIN_PASSWORD_LENGTH} characters. The Microsoft button and the emailed link still work.</p>
      <Field label="New password" kind="password" value={password} onChange={setPassword} autoComplete="new-password" />
      <Field label="Again" kind="password" value={again} onChange={setAgain} autoComplete="new-password" error={error} />
      <PillButton kind="primary" type="submit" label="Save" busy={busy} />
      {saved && <EmptyLine text="Saved. Use it next time." />}
    </form>
  )
}

export function Profile() {
  const prefs = useQuery(KEY, data.appSettings)
  const blocks = useQuery(BLOCKS_KEY, data.sharedBlocks)
  const [form, setForm] = useState<AppSettings | null>(null)
  const [voice, setVoice] = useState<string | null>(null)
  const [post, setPost] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const tabs = settings.pages.map((p) => ({ label: p.label, route: `${settings.path}/${p.slug}` }))

  useEffect(() => {
    if (prefs.data && !form) setForm(prefs.data)
  }, [prefs.data, form])

  async function save(patch: Partial<AppSettings>) {
    if (!form) return
    const next = { ...form, ...patch }
    setForm(next)
    setQueryData<AppSettings>(KEY, () => next)
    applyTheme(next)
    try {
      await data.updateAppSettings(patch)
      if (patch.deckDefault !== undefined || patch.homeStats) invalidate('home')
    } catch {
      setNote('That did not save. Try again.')
    }
  }

  async function saveBlock(code: string, body: string) {
    try {
      await data.updateSharedBlock(code, body)
      invalidate(BLOCKS_KEY)
    } catch {
      setNote('That did not save. Try again.')
    }
  }

  if (!form) {
    return (
      <div className="flex flex-col gap-12">
        <PageHeader title={settings.label} tabs={tabs} />
        {prefs.status === 'error' ? <EmptyLine text="The settings did not load. Try again in a moment" /> : <Dots />}
        <div className="flex max-w-prose flex-col gap-12">
          <Password />
        </div>
      </div>
    )
  }

  const voiceBlock = blocks.data?.find((b) => b.code === 'voice')
  const postBlock = blocks.data?.find((b) => b.code === 'post_format')
  const list = (xs: string[]) => xs.join(', ')
  const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={settings.label} tabs={tabs} />

      <div className="flex max-w-prose flex-col gap-12">
        <section className="flex flex-col gap-4">
          <Heading text="Theme" />
          <Pills
            label="Theme"
            value={form.theme}
            choices={[
              { value: 'paper', label: 'Paper' },
              { value: 'night', label: 'Night' },
            ]}
            onChange={(theme) => void save({ theme: theme as AppSettings['theme'] })}
          />
        </section>

        <section className="flex flex-col gap-4">
          <Heading text="Fonts" />
          <div className="grid grid-cols-2 gap-6">
            <Field label="Sans" kind="choice" value={form.fontSans} choices={sansChoices.map((f) => ({ value: f, label: f }))} onChange={(fontSans) => void save({ fontSans })} />
            <Field label="Mono" kind="choice" value={form.fontMono} choices={monoChoices.map((f) => ({ value: f, label: f }))} onChange={(fontMono) => void save({ fontMono })} />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <Heading text="Home numbers" />
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {form.homeStats.map((v, i) => (
              <Field
                key={i}
                label={`Number ${i + 1}`}
                kind="choice"
                value={v}
                choices={homeChoices}
                onChange={(next) => {
                  const homeStats = [...form.homeStats]
                  // The four stay distinct: the one it replaces takes the old place.
                  const at = homeStats.indexOf(next)
                  if (at >= 0) homeStats[at] = v
                  homeStats[i] = next
                  void save({ homeStats })
                }}
              />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <Heading text="Working hours" />
          <ul className="flex flex-col gap-3" aria-label="Working hours">
            {days.map(([key, name]) => {
              const [start, end] = form.workingHours[key] ?? ['', '']
              return (
                <li key={key} className="grid grid-cols-3 items-end gap-6">
                  <span className="text-body text-ink">{name}</span>
                  <Field label="Start" value={start} onChange={(s) => setForm({ ...form, workingHours: { ...form.workingHours, [key]: [s, end] } })} onBlur={() => void save({ workingHours: form.workingHours })} />
                  <Field label="Finish" value={end} onChange={(e) => setForm({ ...form, workingHours: { ...form.workingHours, [key]: [start, e] } })} onBlur={() => void save({ workingHours: form.workingHours })} />
                </li>
              )
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-4">
          <Heading text="Open Inbox and Follow-ups as" />
          <Pills
            label="Open as"
            value={form.deckDefault ? 'deck' : 'list'}
            choices={[
              { value: 'deck', label: 'Deck' },
              { value: 'list', label: 'List' },
            ]}
            onChange={(v) => void save({ deckDefault: v === 'deck' })}
          />
        </section>

        <section className="flex flex-col gap-4">
          <Heading text="League cadence, in days" />
          <div className="grid grid-cols-3 gap-6">
            <NumField label="Premier" value={form.leagueDays.premier} onCommit={(n) => void save({ leagueDays: { ...form.leagueDays, premier: n } })} />
            <NumField label="Championship" value={form.leagueDays.championship} onCommit={(n) => void save({ leagueDays: { ...form.leagueDays, championship: n } })} />
            <NumField label="League One" value={form.leagueDays.leagueOne} onCommit={(n) => void save({ leagueDays: { ...form.leagueDays, leagueOne: n } })} />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <Heading text="Health and feedback, in working days" />
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <NumField label="Client cooling" value={form.health.clientCooling} onCommit={(n) => void save({ health: { ...form.health, clientCooling: n } })} />
            <NumField label="Client cold" value={form.health.clientCold} onCommit={(n) => void save({ health: { ...form.health, clientCold: n } })} />
            <NumField label="Candidate cooling" value={form.health.candidateCooling} onCommit={(n) => void save({ health: { ...form.health, candidateCooling: n } })} />
            <NumField label="Candidate cold" value={form.health.candidateCold} onCommit={(n) => void save({ health: { ...form.health, candidateCold: n } })} />
            <NumField label="Feedback nudge" value={form.feedback.nudge} onCommit={(n) => void save({ feedback: { ...form.feedback, nudge: n } })} />
            <NumField label="Feedback cooling" value={form.feedback.cooling} onCommit={(n) => void save({ feedback: { ...form.feedback, cooling: n } })} />
            <NumField label="Feedback cold" value={form.feedback.cold} onCommit={(n) => void save({ feedback: { ...form.feedback, cold: n } })} />
            <NumField label="Inbox stale after" value={form.staleAfterDays} onCommit={(n) => void save({ staleAfterDays: n })} />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <Heading text="Ideal client" />
          <Field label="Sector" value={form.icp.sector} onChange={(sector) => setForm({ ...form, icp: { ...form.icp, sector } })} onBlur={() => void save({ icp: form.icp })} />
          <Field label="Company size" value={form.icp.companySize} onChange={(companySize) => setForm({ ...form, icp: { ...form.icp, companySize } })} onBlur={() => void save({ icp: form.icp })} />
          <Field label="Buyer" value={form.icp.buyer} onChange={(buyer) => setForm({ ...form, icp: { ...form.icp, buyer } })} onBlur={() => void save({ icp: form.icp })} />
          <Field label="Cities, with commas" value={list(form.icp.locations)} onChange={(v) => setForm({ ...form, icp: { ...form.icp, locations: split(v) } })} onBlur={() => void save({ icp: form.icp })} />
          <Field label="Second angle" kind="lines" rows={2} value={form.icp.secondAngle} onChange={(secondAngle) => setForm({ ...form, icp: { ...form.icp, secondAngle } })} onBlur={() => void save({ icp: form.icp })} />
          <Field label="Exclusions, with commas" value={list(form.icp.excluded)} onChange={(v) => setForm({ ...form, icp: { ...form.icp, excluded: split(v) } })} onBlur={() => void save({ icp: form.icp })} />
        </section>

        <section className="flex flex-col gap-4">
          <Heading text="Voice rules and post format" />
          <p className="text-body text-ink-2">Shared by every agent.</p>
          {blocks.status === 'loading' && !blocks.data ? (
            <Dots />
          ) : (
            <>
              <Field label="Voice rules" kind="lines" rows={4} value={voice ?? voiceBlock?.body ?? ''} onChange={setVoice} onBlur={() => voice !== null && voice !== voiceBlock?.body && void saveBlock('voice', voice)} />
              <Field label="Post format" kind="lines" rows={4} value={post ?? postBlock?.body ?? ''} onChange={setPost} onBlur={() => post !== null && post !== postBlock?.body && void saveBlock('post_format', post)} />
            </>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <Heading text="Reviewer" />
          <p className="text-body text-ink-2">One address that may sign in and read the numbers. Leave it empty for none.</p>
          <Field label="Email" value={form.reviewerEmail ?? ''} onChange={(reviewerEmail) => setForm({ ...form, reviewerEmail })} onBlur={() => void save({ reviewerEmail: form.reviewerEmail })} />
        </section>

        <Password />
      </div>

      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
