import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Field } from '../../components/Field'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { Dots } from '../../components/Quiet'
import { TextLink } from '../../components/TextLink'
import { data, type Connection, type ConnectionProvider, type ConnectionStatus } from '../../lib/data'
import { invalidate, useQuery } from '../../lib/query'
import { settings } from '../../lib/sections'
import { runWhen } from '../../lib/settings'
import { orbClass } from '../../lib/tone'
import type { Tone } from '../../theme/tokens'

// Settings, Connections (24.1, 24.9; 15 November 2026): the apps RecOS
// reaches itself. One row per app with its state in words and colour, the
// account, when it last worked, and one way to connect or disconnect.
// Keys go to the server and are never shown again.

const KEY = 'settings.connections'

export const statusWord: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  needs_sign_in: 'Needs sign-in',
  failing: 'Failing',
  not_connected: 'Not connected',
}

export const statusTone: Record<ConnectionStatus, Tone> = {
  connected: 'clear',
  needs_sign_in: 'action',
  failing: 'action',
  not_connected: 'new',
}

const apps: { provider: ConnectionProvider; name: string; what: string; where?: string }[] = [
  { provider: 'outlook', name: 'Outlook', what: 'Sends your queued email, reads your calendar and the mail the agents look for.' },
  { provider: 'granola', name: 'Granola', what: 'Call notes for the calls agent.', where: 'In Granola: Settings, API. Needs the Business plan.' },
  { provider: 'spott', name: 'Spott', what: 'The CRM record behind each person and search.', where: 'In Spott: Settings, API. Only an admin can make one.' },
]

const outlookReason: Record<string, string> = {
  state: 'the sign-in link had run out',
  declined: 'permission was not given',
  microsoft: 'Microsoft refused the sign-in',
  token: 'Microsoft did not hand back a sign-in',
  profile: 'your account could not be read',
  store: 'the sign-in could not be kept',
  not_configured: 'the app registration is not set up yet',
}

function Status({ c }: { c: Connection }) {
  return (
    <span className="flex items-center gap-2" data-status={c.status}>
      <span aria-hidden className={`block size-3 rounded-pill ${orbClass[statusTone[c.status]]}`} />
      <span className="label-caps text-ink">{statusWord[c.status]}</span>
    </span>
  )
}

function KeyForm({ provider, name, onSaved, onProblem }: { provider: 'granola' | 'spott'; name: string; onSaved: () => void; onProblem: (t: string) => void }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  async function save(e: FormEvent) {
    e.preventDefault()
    if (key.trim().length < 8) {
      setError('Paste the whole key.')
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      await data.saveConnectionKey(provider, key.trim())
      setKey('')
      onSaved()
    } catch (err) {
      setKey('')
      onProblem(err instanceof Error && err.message ? err.message : 'That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="flex flex-wrap items-end gap-4" aria-label={`${name} key`}>
      <div className="w-72">
        <Field label="Paste your API key" kind="password" autoComplete="off" value={key} onChange={setKey} error={error} />
      </div>
      <PillButton label="Save" type="submit" busy={busy} />
    </form>
  )
}

export function Connections({ go }: { go?: (url: string) => void }) {
  const list = useQuery(KEY, data.connections)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [line, setLine] = useState<string | null>(null)
  const [problem, setProblem] = useState<Partial<Record<ConnectionProvider, string>>>({})
  const tabs = settings.pages.map((p) => ({ label: p.label, route: `${settings.path}/${p.slug}` }))

  // The way back from Microsoft: one quiet line, then the address is tidied.
  useEffect(() => {
    const outcome = params.get('outlook')
    if (!outcome) return
    if (outcome === 'connected') setLine('Outlook is connected.')
    else setLine(`Outlook did not connect: ${outlookReason[params.get('reason') ?? ''] ?? 'something went wrong'}. Try again.`)
    invalidate(KEY)
    setParams({}, { replace: true })
  }, [params, setParams])

  function goTo(url: string) {
    if (go) go(url)
    else if (url.startsWith('/')) navigate(url)
    else window.location.assign(url)
  }

  async function connectOutlook() {
    setProblem((p) => ({ ...p, outlook: undefined }))
    try {
      goTo(await data.outlookStartUrl())
    } catch {
      setProblem((p) => ({ ...p, outlook: 'Could not start the sign-in. Try again.' }))
    }
  }

  async function disconnect(provider: ConnectionProvider, name: string) {
    try {
      await data.disconnect(provider)
      setLine(`${name} is disconnected.`)
      invalidate(KEY)
    } catch {
      setProblem((p) => ({ ...p, [provider]: 'That did not work. Try again.' }))
    }
  }

  const byProvider = new Map((list.data ?? []).map((c) => [c.provider, c]))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={settings.label} tabs={tabs} />

      <div className="flex max-w-prose flex-col gap-6">
        <p className="text-body text-ink-2">The apps RecOS reaches by itself. Keys and sign-ins are kept on the server and never shown again.</p>
        {line && (
          <p role="status" className="text-body text-ink">
            {line}
          </p>
        )}

        {list.status === 'loading' && !list.data ? (
          <Dots />
        ) : (
          <ul className="flex flex-col divide-y divide-rule border-y border-rule" aria-label="Connections">
            {apps.map((app) => {
              const c: Connection = byProvider.get(app.provider) ?? {
                provider: app.provider, status: 'not_connected', accountLabel: null, connectedAt: null, lastOkAt: null, lastError: null,
              }
              const linked = c.status !== 'not_connected'
              return (
                <li key={app.provider} className="flex flex-col gap-3 py-4" data-provider={app.provider} aria-label={app.name}>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                    <span className="w-24 text-body font-medium text-ink">{app.name}</span>
                    <Status c={c} />
                    {c.accountLabel && <span className="text-body text-ink-2">{c.accountLabel}</span>}
                    {c.lastOkAt && <span className="font-mono text-label text-ink-3">Last OK {runWhen(c.lastOkAt)}</span>}
                  </div>
                  <p className="text-body text-ink-2">{app.what}</p>
                  {c.lastError && c.status !== 'connected' && <p className="text-body text-ink-2">{c.lastError}</p>}

                  {app.provider === 'outlook' ? (
                    <div className="flex flex-wrap items-center gap-6">
                      {c.status !== 'connected' && (
                        <PillButton label={linked ? 'Sign in again' : 'Connect Outlook'} kind={linked ? 'plain' : 'primary'} onClick={() => void connectOutlook()} />
                      )}
                      {linked && <TextLink label="Disconnect" onClick={() => void disconnect('outlook', app.name)} />}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {c.status !== 'connected' && (
                        <KeyForm
                          provider={app.provider as 'granola' | 'spott'}
                          name={app.name}
                          onSaved={() => {
                            setProblem((p) => ({ ...p, [app.provider]: undefined }))
                            setLine(`${app.name} is connected.`)
                            invalidate(KEY)
                          }}
                          onProblem={(t) => setProblem((p) => ({ ...p, [app.provider]: t }))}
                        />
                      )}
                      {c.status !== 'connected' && app.where && <p className="font-mono text-label text-ink-3">{app.where}</p>}
                      {linked && (
                        <div>
                          <TextLink label="Disconnect" onClick={() => void disconnect(app.provider, app.name)} />
                        </div>
                      )}
                    </div>
                  )}
                  {problem[app.provider] && <p className="text-body text-ink-2">{problem[app.provider]}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
