import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Draft } from '../../components/Draft'
import { Field } from '../../components/Field'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { Dots, EmptyLine } from '../../components/Quiet'
import { RowList } from '../../components/RowList'
import { Switch } from '../../components/Switch'
import { TextLink } from '../../components/TextLink'
import { data, type Agent } from '../../lib/data'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { settings } from '../../lib/sections'
import { agentMeta, costWords, runLine } from '../../lib/settings'

// Settings, Agents (32.4): one row per agent, and a card with the on and off
// switch, the schedule, the last 5 runs, this month's cost as two plain
// numbers, the prompt with its version history and Save as new version, and
// when the key was made. Keys are made by the agent endpoints, never here.

const KEY = 'settings.agents'

function AgentCard({ agent, onClose, onNote }: { agent: Agent; onClose: () => void; onNote: (text: string) => void }) {
  const runs = useQuery(`settings.runs.${agent.code}`, () => data.agentRuns(agent.code))
  const prompts = useQuery(`settings.prompts.${agent.code}`, () => data.agentPrompts(agent.code))
  const active = prompts.data?.find((p) => p.active)
  const [body, setBody] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [asked, setAsked] = useState(false)

  useEffect(() => {
    setBody(null)
  }, [active?.version])

  const text = body ?? active?.body ?? ''
  const edited = text !== (active?.body ?? '')

  async function toggle(on: boolean) {
    setQueryData<Agent[]>(KEY, (rows) => (rows ?? []).map((a) => (a.code === agent.code ? { ...a, enabled: on } : a)))
    try {
      await data.setAgentEnabled(agent.code, on)
    } catch {
      setQueryData<Agent[]>(KEY, (rows) => (rows ?? []).map((a) => (a.code === agent.code ? { ...a, enabled: !on } : a)))
      onNote('That did not save. Try again.')
    }
  }

  async function save() {
    if (!text.trim()) {
      onNote('A prompt needs some text.')
      return
    }
    setBusy(true)
    try {
      await data.saveAgentPrompt(agent.code, text, note)
      invalidate(`settings.prompts.${agent.code}`)
      setNote('')
      setBody(null)
    } catch {
      onNote('That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function makeKey() {
    try {
      const key = await data.createAgentKey(agent.code)
      setNewKey(key)
      invalidate(KEY)
    } catch {
      onNote('That did not work. Try again.')
    }
  }

  async function revokeKey() {
    try {
      await data.revokeAgentKey(agent.code)
      setNewKey(null)
      invalidate(KEY)
    } catch {
      onNote('That did not work. Try again.')
    }
  }

  async function askForRun() {
    try {
      await data.requestRun(agent.code)
      setAsked(true)
    } catch {
      onNote('That did not work. Try again.')
    }
  }

  async function activate(version: number) {
    try {
      await data.activateAgentPrompt(agent.code, version)
      invalidate(`settings.prompts.${agent.code}`)
    } catch {
      onNote('That did not save. Try again.')
    }
  }

  return (
    <Card
      key={agent.code}
      label="Agent"
      title={agent.name}
      sections={[
        { body: <Switch on={agent.enabled} label={agent.enabled ? 'On' : 'Off'} onChange={(on) => void toggle(on)} /> },
        { label: 'Schedule', body: <p className="text-body text-ink">{agent.schedule}</p> },
        {
          label: 'Last runs',
          body:
            runs.status === 'loading' && !runs.data ? (
              <Dots />
            ) : runs.data && runs.data.length > 0 ? (
              <ul className="flex flex-col gap-1 font-mono text-label text-ink" aria-label="Last runs">
                {runs.data.map((r) => (
                  <li key={r.id}>{runLine(r)}</li>
                ))}
              </ul>
            ) : (
              <EmptyLine text="Not run yet" />
            ),
        },
        { label: 'This month', body: <p className="font-mono text-body tabular-nums text-ink">{costWords(agent.spentThisMonth, agent.monthlyBudget)}</p> },
        {
          label: 'Prompt',
          body:
            prompts.status === 'loading' && !prompts.data ? (
              <Dots />
            ) : (
              <div className="flex flex-col gap-4">
                <Draft label={active ? `Version ${active.version}` : 'No version yet'} text={text} original={active?.body} onChange={setBody} />
                {edited && <Field label="Note for this version" value={note} onChange={setNote} placeholder="What changed, in a few words" />}
                <div className="flex flex-wrap gap-x-6">
                  {(prompts.data?.length ?? 0) > 1 && <TextLink label={history ? 'Hide history' : 'Version history'} onClick={() => setHistory((h) => !h)} active={history} />}
                </div>
                {history && (
                  <ul className="flex flex-col divide-y divide-rule" aria-label="Version history">
                    {prompts.data?.map((p) => (
                      <li key={p.version} className="flex min-h-10 items-center gap-4 py-1 text-body">
                        <span className="font-mono text-label text-ink">v{p.version}</span>
                        <span className="flex-1 truncate text-ink-2">{p.note ?? p.body.slice(0, 60)}</span>
                        {p.active ? <span className="label-caps text-ink">Active</span> : <TextLink label="Use this" onClick={() => void activate(p.version)} />}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ),
        },
        {
          label: 'Key',
          body: (
            <div className="flex flex-col gap-3">
              {newKey ? (
                <>
                  <p className="text-body text-ink">Copy it now. It is shown once and never again.</p>
                  <code className="break-all font-mono text-label text-ink" data-testid="new-key">
                    {newKey}
                  </code>
                  <div className="flex gap-6">
                    <TextLink label="Copy" onClick={() => void navigator.clipboard?.writeText(newKey)} />
                    <TextLink label="Done" onClick={() => setNewKey(null)} />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-body text-ink-2">{agent.keyCreatedAt ? `Made on ${agent.keyCreatedAt.slice(0, 10)}. Rotate every 90 days.` : 'No key yet. The agent cannot post until it has one.'}</p>
                  <div className="flex gap-6">
                    <TextLink label="Create new key" onClick={() => void makeKey()} />
                    {agent.keyCreatedAt && <TextLink label="Revoke" onClick={() => void revokeKey()} />}
                  </div>
                </>
              )}
            </div>
          ),
        },
        {
          label: 'Run now',
          body: asked ? (
            <p className="text-body text-ink">Asked. The agent checks at the top of its schedule. For a faster run, start the task by hand in the Claude app.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-body text-ink-2">Agents run as scheduled tasks outside RecOS.</p>
              <div>
                <TextLink label="Ask for a run" onClick={() => void askForRun()} />
              </div>
            </div>
          ),
        },
      ]}
      primaryAction={{ label: 'Save as new version', onClick: () => void save(), busy }}
      foot={agent.consecutiveFailures >= 2 ? `Failed ${agent.consecutiveFailures} times running` : undefined}
      onClose={onClose}
    />
  )
}

export function Agents() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const agents = useQuery(KEY, data.agents)
  const [note, setNote] = useState<string | null>(null)
  const tabs = settings.pages.map((p) => ({ label: p.label, route: `${settings.path}/${p.slug}` }))
  const cardCode = params.get('card')?.startsWith('agent:') ? params.get('card')!.slice(6) : null
  const chosen = cardCode ? agents.data?.find((a) => a.code === cardCode) : undefined

  function openCard(code: string) {
    setParams(
      (p) => {
        p.set('card', `agent:${code}`)
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

  const rows = (agents.data ?? []).map((a) => ({
    id: a.code,
    dot: a.lastRun?.status === 'failed' || a.lastRun?.status === 'timed_out' ? ('solid' as const) : ('hollow' as const),
    title: a.name,
    detail: a.schedule,
    meta: agentMeta(a),
    word: a.enabled ? undefined : 'Paused',
    onOpen: () => openCard(a.code),
  }))

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={settings.label} tabs={tabs} />
      <RowList icon="sparkle" rows={rows} state={agents.status} emptyText="No agents yet" />
      {chosen && <AgentCard agent={chosen} onClose={closeCard} onNote={setNote} />}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
