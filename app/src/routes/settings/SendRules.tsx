import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Field } from '../../components/Field'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { EmptyLine } from '../../components/Quiet'
import { RowList } from '../../components/RowList'
import { Switch } from '../../components/Switch'
import { TextLink } from '../../components/TextLink'
import { data, type SendPolicy, type SendPolicyPatch } from '../../lib/data'
import { logLine, templateWord } from '../../lib/send'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { settings } from '../../lib/sections'
import { aboveCeiling, channelWord, levelWord, levels } from '../../lib/settings'

// Settings, Send rules (20.9, 32.4): the stop switch alone at the top, then
// one row per message type. The card holds three pills for the level, with
// any level above the ceiling greyed (T-SET-2), the caps, the send window
// and the template. Turning sending off is immediate (T-SET-1); turning it
// back on asks what to do with anything held.

const PAUSED_KEY = 'settings.sendingPaused'
const HELD_KEY = 'settings.held'
const POLICIES_KEY = 'settings.sendPolicies'

function capValue(n: number | null): string {
  return n === null ? '' : String(n)
}

function capNumber(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isInteger(n) && n >= 0 ? n : null
}

function PolicyCard({ policy, onClose, onNote }: { policy: SendPolicy; onClose: () => void; onNote: (t: string) => void }) {
  const navigate = useNavigate()
  const templates = useQuery('settings.templates', data.templates)
  const mine = (templates.data ?? []).filter((t) => t.type === policy.type && t.active)
  const approved = mine.find((t) => t.approved)
  const [caps, setCaps] = useState({ daily: capValue(policy.dailyCap), weekly: capValue(policy.weeklyCap), perRun: capValue(policy.perRunCap), start: policy.windowStart, end: policy.windowEnd })

  async function patch(change: SendPolicyPatch) {
    const before = policy
    setQueryData<SendPolicy[]>(POLICIES_KEY, (rows) => (rows ?? []).map((p) => (p.type === policy.type ? { ...p, ...change, pausedReason: change.paused === false ? null : p.pausedReason } : p)))
    try {
      await data.updateSendPolicy(policy.type, change)
    } catch {
      setQueryData<SendPolicy[]>(POLICIES_KEY, (rows) => (rows ?? []).map((p) => (p.type === policy.type ? before : p)))
      onNote('That did not save. Try again.')
    }
  }

  function saveCaps() {
    void patch({ dailyCap: capNumber(caps.daily), weeklyCap: capNumber(caps.weekly), perRunCap: capNumber(caps.perRun), windowStart: caps.start, windowEnd: caps.end })
  }

  const blocked = levels.filter((l) => aboveCeiling(l, policy))

  return (
    <Card
      key={policy.type}
      label={channelWord[policy.channel]}
      title={policy.label}
      sections={[
        {
          label: 'Level',
          body: (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-3" role="group" aria-label="Level">
                {levels.map((l) => (
                  <PillButton key={l} label={levelWord[l]} current={policy.level === l} disabled={aboveCeiling(l, policy)} onClick={() => void patch({ level: l })} />
                ))}
              </div>
              {blocked.length > 0 && (
                <p className="text-body text-ink-2">
                  {blocked.map((l) => levelWord[l]).join(' and ')} {blocked.length === 1 ? 'is' : 'are'} not available for this type.
                </p>
              )}
            </div>
          ),
        },
        ...(policy.paused
          ? [{ label: 'Paused', body: <div className="flex flex-col gap-3"><p className="text-body text-ink">{policy.pausedReason ?? 'Paused by the system.'}</p><TextLink label="Resume" onClick={() => void patch({ paused: false })} /></div> }]
          : []),
        {
          label: 'Caps',
          body: (
            <div className="grid grid-cols-3 gap-6">
              <Field label="A day" value={caps.daily} onChange={(daily) => setCaps({ ...caps, daily })} onBlur={saveCaps} placeholder="None" />
              <Field label="A week" value={caps.weekly} onChange={(weekly) => setCaps({ ...caps, weekly })} onBlur={saveCaps} placeholder="None" />
              <Field label="A run" value={caps.perRun} onChange={(perRun) => setCaps({ ...caps, perRun })} onBlur={saveCaps} placeholder="None" />
            </div>
          ),
        },
        {
          label: 'Send window',
          body: (
            <div className="grid grid-cols-2 gap-6">
              <Field label="From" value={caps.start} onChange={(start) => setCaps({ ...caps, start })} onBlur={saveCaps} />
              <Field label="To" value={caps.end} onChange={(end) => setCaps({ ...caps, end })} onBlur={saveCaps} />
            </div>
          ),
        },
        // Send a test to yourself (0043): one email to the owner's own mailbox, through the sender, so the whole path is proved.
        ...(policy.channel !== 'linkedin'
          ? [
              {
                label: 'Test',
                body: (
                  <div className="flex flex-col gap-2">
                    <p className="text-body text-ink-2">One email to your own inbox, sent the way a real one would be.</p>
                    <TextLink
                      label="Send a test to yourself"
                      icon="mail"
                      onClick={() =>
                        void data
                          .sendTest(policy.type)
                          .then((r) => {
                            invalidate('settings.sendLog')
                            onNote(r.note ?? 'Queued.')
                          })
                          .catch((e: unknown) => onNote(e instanceof Error ? e.message.replace(/^[a-z_]+: /, '') : 'That did not save. Try again.'))
                      }
                    />
                  </div>
                ),
              },
            ]
          : []),
        {
          label: 'Template',
          body: policy.requiresTemplate ? (
            <div className="flex flex-col gap-2">
              <p className="text-body text-ink">
                {approved
                  ? `${approved.name}, version ${approved.version}, approved.`
                  : mine.length > 0
                    ? `${mine[0].name}, version ${mine[0].version}: ${templateWord(mine[0]).toLowerCase()}. Nothing sends by itself until it is approved.`
                    : 'No template yet. Nothing sends by itself until one is approved.'}
              </p>
              <TextLink label={mine.length > 0 ? 'Open the template' : 'Templates'} onClick={() => navigate(mine.length > 0 ? `/settings/templates?card=template:${mine[0].id}` : '/settings/templates')} />
            </div>
          ) : (
            <p className="text-body text-ink-2">No template. Each one is written by hand.</p>
          ),
        },
      ]}
      foot={`At least ${policy.minDaysBetweenSamePerson} days between messages to the same person. Recipient time by default US Eastern.`}
      onClose={onClose}
    />
  )
}

export function SendRules() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const paused = useQuery(PAUSED_KEY, data.sendingPaused)
  const held = useQuery(HELD_KEY, data.heldMessages)
  const policies = useQuery(POLICIES_KEY, data.sendPolicies)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const log = useQuery('settings.sendLog', () => data.sendLog(30))
  const queue = useQuery('settings.sendQueue', data.sendQueue)
  const tabs = settings.pages.map((p) => ({ label: p.label, route: `${settings.path}/${p.slug}` }))
  const cardType = params.get('card')?.startsWith('type:') ? params.get('card')!.slice(5) : null
  const chosen = cardType ? policies.data?.find((p) => p.type === cardType) : undefined

  const on = paused.data === false

  async function flip(nextOn: boolean) {
    setQueryData<boolean>(PAUSED_KEY, () => !nextOn)
    try {
      await data.setSendingPaused(!nextOn)
      invalidate(HELD_KEY)
      if (nextOn && (held.data ?? 0) > 0) setAsking(true)
    } catch {
      setQueryData<boolean>(PAUSED_KEY, () => nextOn)
      setNote('That did not save. Try again.')
    }
  }

  async function release(to: 'send' | 'draft') {
    setAsking(false)
    try {
      await data.releaseHeld(to)
      setQueryData<number>(HELD_KEY, () => 0)
    } catch {
      setNote('That did not save. Try again.')
    }
  }

  function openCard(type: string) {
    setParams(
      (p) => {
        p.set('card', `type:${type}`)
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

  // Every type on one list, grouped by level, since Settings is visited rarely (32.4).
  const rank = (l: SendPolicy['level']) => levels.indexOf(l)
  const rows = [...(policies.data ?? [])]
    .sort((a, b) => rank(a.level) - rank(b.level) || a.label.localeCompare(b.label))
    .map((p) => ({
      id: p.type,
      section: levelWord[p.level],
      dot: p.level === 'automatic' ? ('solid' as const) : ('hollow' as const),
      title: p.label,
      detail: channelWord[p.channel],
      meta: levelWord[p.level],
      word: p.paused ? 'Paused' : undefined,
      onOpen: () => openCard(p.type),
    }))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={settings.label} tabs={tabs} aside={<TextLink label="Send log" icon="list" onClick={() => setShowLog(true)} />} />

      <section className="flex flex-col gap-4" aria-label="Stop switch">
        {paused.data === undefined ? (
          <EmptyLine text="Loading" />
        ) : (
          <div className="scale-125 origin-left">
            <Switch on={on} label={on ? 'Sending is on' : 'Sending is off'} onChange={(next) => void flip(next)} />
          </div>
        )}
        {asking && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-body text-ink">
            <span>
              {held.data} {held.data === 1 ? 'message was' : 'messages were'} held while sending was off.
            </span>
            <TextLink label="Send them" onClick={() => void release('send')} />
            <TextLink label="Return them to drafts" onClick={() => void release('draft')} />
          </div>
        )}
        {!asking && !on && (held.data ?? 0) > 0 && (
          <p className="text-body text-ink-2">
            {held.data} {held.data === 1 ? 'message is' : 'messages are'} held until sending is on.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-label="Waiting to send">
        <h3 className="label-caps text-ink-2">Waiting to send</h3>
        {queue.status === 'loading' && !queue.data ? (
          <EmptyLine text="Loading" />
        ) : (queue.data ?? []).length === 0 ? (
          <p className="text-body text-ink-3">Nothing waiting. Everything decided has gone.</p>
        ) : (
          <ul className="flex flex-col" data-testid="send-queue">
            {(queue.data ?? []).map((q) => {
              const label = policies.data?.find((p) => p.type === q.type)?.label ?? q.type.replace(/_/g, ' ')
              const needsNote = q.reason === 'Template needs approval'
              return (
                <li key={`${q.type}|${q.state}|${q.reason ?? ''}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule py-2">
                  <span className="w-10 font-mono text-label text-ink">{q.count}</span>
                  <span className="min-w-0 flex-1 text-body text-ink">
                    {label}
                    <span className="ml-3 text-ink-2">
                      {q.state === 'queued'
                        ? `queued${q.nextAt ? `, next ${new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).format(new Date(q.nextAt))}` : ''}`
                        : needsNote
                          ? 'waiting for you to approve the template'
                          : `${q.state === 'held' ? 'held' : 'waiting'}: ${(q.reason ?? 'no reason given').toLowerCase()}`}
                    </span>
                  </span>
                  {needsNote && <TextLink label="Open the template" onClick={() => navigate('/settings/templates')} />}
                  <TextLink label="The rule" onClick={() => openCard(q.type)} />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <RowList icon="mail" view="rows" rows={rows} state={policies.status} emptyText="No message types" limit={rows.length || 7} />

      {chosen && <PolicyCard policy={chosen} onClose={closeCard} onNote={setNote} />}
      {showLog && (
        <Card
          label="Send log"
          title="The last 30 decisions"
          sections={[
            {
              body:
                log.status === 'error' ? (
                  <EmptyLine text="Could not load. Try again." />
                ) : (log.data ?? []).length === 0 ? (
                  <p className="text-ink-3">Nothing has gone through the engine yet.</p>
                ) : (
                  <ul className="flex flex-col font-mono text-label text-ink" aria-label="Send log">
                    {(log.data ?? []).map((r) => (
                      <li key={r.id} className="flex min-h-9 items-center justify-between gap-4 border-b border-rule">
                        <span className="min-w-0 flex-1 truncate">{logLine(r, policies.data?.find((p) => p.type === r.type)?.label ?? r.type)}</span>
                        {r.detail && r.detail !== 'Auto' && r.detail !== 'manual' && r.detail !== 'Sent' && <span className="truncate text-ink-3">{r.detail}</span>}
                      </li>
                    ))}
                  </ul>
                ),
            },
          ]}
          foot="Every hold, downgrade, queue and send is a row. Kept for 24 months."
          onClose={() => setShowLog(false)}
        />
      )}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
