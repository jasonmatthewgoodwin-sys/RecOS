import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { agentsFor, connectionWord, criteriaWord, lastRanWords } from '../lib/agents'
import { data, type Agent } from '../lib/data'
import { invalidate, useQuery } from '../lib/query'
import { Card } from './Card'
import { Field } from './Field'
import { Icon } from './Icon'
import { Dots } from './Quiet'
import { TextLink } from './TextLink'

// The agent behind the page (Jason, 14 November 2026): a button at the
// top right of every tab's header that opens the agent feeding it, with
// when it last ran, what it connects to, the criteria it works to, which
// the owner edits here, Run now, and a way to the full page in Settings.

export function PageAgent() {
  const { pathname } = useLocation()
  const codes = agentsFor(pathname)
  const [open, setOpen] = useState(false)
  if (codes.length === 0) return null
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-8 items-center gap-1.5 font-mono text-label text-ink-3 hover:text-ink" aria-label="Agent">
        <Icon name="sparkle" size={13} />
        Agent{codes.length > 1 ? 's' : ''}
      </button>
      {open && <AgentWindow codes={codes} onClose={() => setOpen(false)} />}
    </>
  )
}

export function AgentWindow({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const navigate = useNavigate()
  const agents = useQuery('settings.agents', data.agents)
  const mine = (agents.data ?? []).filter((a) => codes.includes(a.code)).sort((a, b) => codes.indexOf(a.code) - codes.indexOf(b.code))
  const [asked, setAsked] = useState<Record<string, boolean>>({})
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  function value(a: Agent, key: string): string {
    const e = edits[a.code]?.[key]
    if (e !== undefined) return e
    const v = a.criteria[key]
    return v === undefined || v === null ? '' : String(v)
  }

  async function save(a: Agent) {
    const next: Record<string, unknown> = { ...a.criteria }
    for (const [k, v] of Object.entries(edits[a.code] ?? {})) {
      const was = a.criteria[k]
      next[k] = typeof was === 'number' ? Number(v) || 0 : typeof was === 'boolean' ? v === 'true' || v === 'yes' : v
    }
    try {
      await data.updateAgentSetup(a.code, { criteria: next })
      setSaved((s) => ({ ...s, [a.code]: true }))
      invalidate('settings.agents')
    } catch {
      setError('That did not save. Try again.')
    }
  }

  async function run(a: Agent) {
    try {
      await data.requestRun(a.code)
      setAsked((s) => ({ ...s, [a.code]: true }))
    } catch {
      setError('Could not ask for a run. Try again.')
    }
  }

  const sections = mine.flatMap((a) => [
    {
      label: a.name,
      body: (
        <div className="flex flex-col gap-3" data-agent={a.code}>
          <p className="font-mono text-label text-ink-2">
            {a.enabled ? 'On' : 'Off'}, {a.schedule}. {lastRanWords(a.lastRun)}.
          </p>
          <div className="flex flex-col gap-1">
            <span className="label-caps text-ink-2">Connects to</span>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-body text-ink" aria-label={`${a.name} connects to`}>
              {a.connections.length === 0 && <li className="text-ink-3">Nothing yet</li>}
              {a.connections.map((c) => (
                <li key={c} className="flex items-center gap-1.5">
                  <Icon name="check" size={12} className="text-ink-3" />
                  {connectionWord[c] ?? c}
                </li>
              ))}
            </ul>
          </div>
          {Object.keys(a.criteria).length > 0 && (
            <form
              className="flex flex-col gap-3"
              aria-label={`${a.name} criteria`}
              onSubmit={(e) => {
                e.preventDefault()
                void save(a)
              }}
            >
              <span className="label-caps text-ink-2">Works to</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.keys(a.criteria).map((k) => (
                  <Field key={k} label={criteriaWord[k] ?? k.replace(/_/g, ' ')} value={value(a, k)} onChange={(v) => setEdits((s) => ({ ...s, [a.code]: { ...s[a.code], [k]: v } }))} />
                ))}
              </div>
              {edits[a.code] && Object.keys(edits[a.code]).length > 0 && (
                <div>
                  <TextLink label={saved[a.code] ? 'Saved' : 'Save criteria'} onClick={() => void save(a)} />
                </div>
              )}
            </form>
          )}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            {asked[a.code] ? <span className="font-mono text-label text-ink-2">Asked. It runs at the top of its schedule.</span> : <TextLink label="Run now" icon="sparkle" onClick={() => void run(a)} />}
            <TextLink label="Refresh" onClick={() => invalidate('settings.agents')} />
            <TextLink label="Prompt and runs" onClick={() => navigate(`/settings/agents?card=${a.code}`)} />
          </div>
        </div>
      ),
    },
  ])

  return (
    <Card
      label="Behind this page"
      title={mine.length === 1 ? mine[0].name : `${mine.length} agents`}
      tone="new"
      sections={agents.status === 'loading' && !agents.data ? [{ body: <Dots /> }] : [...sections, ...(error ? [{ body: <p className="text-body text-ink-2">{error}</p> }] : [])]}
      foot="Agents run as Claude scheduled tasks and write through agent-write. Nothing here sends a message."
      onClose={onClose}
    />
  )
}
