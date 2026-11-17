import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Field } from '../../components/Field'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { SentForYou } from '../../components/SentForYou'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { RowList, type ListItem } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { data, type Campaign, type CampaignPatch } from '../../lib/data'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { toolWord } from '../../lib/searches'
import { sections } from '../../lib/sections'
import { ukClock } from '../../lib/time'

// Content, Campaigns (28.7, moved under Content at Jason's ask on 14
// November 2026): REPLIES as N of M for the most recent campaign, then the
// campaigns newest first with plain numbers. A spec campaign is the
// step-by-step plan for putting one matched candidate in front of one lead.

const KEY = 'content.campaigns'
const statusWord = { planned: 'Planned', running: 'Running', done: 'Done' } as const

export function Campaigns() {
  const [params, setParams] = useSearchParams()
  const campaigns = useQuery(KEY, data.campaigns)
  const [note, setNote] = useState<string | null>(null)
  const all = campaigns.data ?? []
  const latest = all[0]
  const card = params.get('card')
  const open = card?.startsWith('campaign:') ? all.find((c) => c.id === card.slice(9)) : undefined
  const adding = card === 'campaign:new'

  const tab = sections.find((s) => s.key === 'content')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))

  function setCard(v: string | null) {
    setParams((p) => {
      if (v === null) p.delete('card')
      else p.set('card', v)
      return p
    })
  }

  async function patch(c: Campaign, change: CampaignPatch) {
    const before = campaigns.data
    setQueryData<Campaign[]>(KEY, (rows) => (rows ?? []).map((x) => (x.id === c.id ? { ...x, ...change } : x)))
    try {
      await data.updateCampaign(c.id, change)
    } catch {
      setQueryData<Campaign[]>(KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  const rows: ListItem[] = all.map((c) => ({
    id: c.id,
    dot: c.status === 'done' ? ('solid' as const) : ('hollow' as const),
    done: c.status === 'done',
    title: c.name,
    detail: `${toolWord[c.tool] ?? c.tool}. ${c.contacted} contacted, ${c.replies} replies, ${c.callsBooked} calls booked`,
    word: statusWord[c.status],
    tone: c.status === 'running' ? ('pending' as const) : c.status === 'planned' ? ('new' as const) : ('clear' as const),
    icon: 'mail' as const,
    onOpen: () => setCard(`campaign:${c.id}`),
  }))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Content" tabs={tabs} aside={
          <span className="flex flex-wrap items-center gap-x-6">
            <SentForYou area="campaign" />
            <TextLink label="New campaign" icon="plus" onClick={() => setCard('campaign:new')} />
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-x-8 gap-y-8">
        <HeroStat label="Replies" value={latest ? `${latest.replies} of ${latest.contacted}` : campaigns.data ? '0 of 0' : undefined} tone={latest && latest.replies > 0 ? 'new' : undefined} icon="mail" />
      </div>
      {campaigns.status === 'loading' ? <Dots /> : campaigns.status === 'error' ? <EmptyLine text="Could not load. Try again." /> : <RowList rows={rows} view="rows" emptyText="No campaigns yet." />}
      {open && <CampaignCard key={open.id} c={open} onPatch={(change) => void patch(open, change)} onClose={() => setCard(null)} />}
      {adding && (
        <NewCampaignCard
          onAdd={async (name, tool) => {
            try {
              await data.addCampaign({ name, tool, jobLeadId: null, candidatePersonId: null })
              invalidate(KEY)
              setCard(null)
            } catch {
              setNote('That did not save. Try again.')
            }
          }}
          onClose={() => setCard(null)}
        />
      )}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}

function CampaignCard({ c, onPatch, onClose }: { c: Campaign; onPatch: (change: CampaignPatch) => void; onClose: () => void }) {
  const today = ukClock(new Date()).date
  const [v, setV] = useState({ name: c.name, tool: c.tool, contacted: String(c.contacted), replies: String(c.replies), callsBooked: String(c.callsBooked), status: c.status })
  const [step, setStep] = useState({ channel: 'email', note: '' })
  const dirty = v.name !== c.name || v.tool !== c.tool || v.contacted !== String(c.contacted) || v.replies !== String(c.replies) || v.callsBooked !== String(c.callsBooked) || v.status !== c.status
  const num = (s: string) => Math.max(0, Number(s) || 0)
  return (
    <Card
      label={`Campaign, ${statusWord[c.status].toLowerCase()}`}
      title={c.name}
      tone={c.status === 'running' ? 'pending' : c.status === 'planned' ? 'new' : 'clear'}
      sections={[
        {
          body: (
            <form
              className="flex flex-col gap-4"
              aria-label="Campaign"
              onSubmit={(e) => {
                e.preventDefault()
                onPatch({ name: v.name.trim() || c.name, tool: v.tool, contacted: num(v.contacted), replies: num(v.replies), callsBooked: num(v.callsBooked), status: v.status })
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" value={v.name} onChange={(x) => setV({ ...v, name: x })} />
                <Field label="Tool" kind="choice" value={v.tool} onChange={(x) => setV({ ...v, tool: x })} choices={Object.entries(toolWord).map(([value, label]) => ({ value, label }))} />
                <Field label="Contacted" value={v.contacted} onChange={(x) => setV({ ...v, contacted: x })} />
                <Field label="Replies" value={v.replies} onChange={(x) => setV({ ...v, replies: x })} />
                <Field label="Calls booked" value={v.callsBooked} onChange={(x) => setV({ ...v, callsBooked: x })} />
                <Field label="State" kind="choice" value={v.status} onChange={(x) => setV({ ...v, status: x as Campaign['status'] })} choices={(['planned', 'running', 'done'] as const).map((s) => ({ value: s, label: statusWord[s] }))} />
              </div>
              <div>
                <PillButton label={dirty ? 'Save' : 'Saved'} type="submit" kind="primary" />
              </div>
            </form>
          ),
        },
        {
          label: 'Steps',
          body: (
            <div className="flex flex-col gap-3">
              {/* Spott runs the sequence; the campaign runner reports each step back (0040). */}
              {c.status === 'planned' && <p className="font-mono text-label text-ink-2">Waiting for the campaign runner to enrol them in Spott.</p>}
              {c.status === 'running' && c.startedOn && <p className="font-mono text-label text-ink-2">In Spott since {c.startedOn}.</p>}
              {c.steps.length === 0 && <p className="text-ink-3">No steps yet. A spec campaign is a plan: the email, the call, the message.</p>}
              <ol className="flex flex-col" aria-label="Steps">
                {c.steps.map((s, i) => (
                  <li key={i} className="flex min-h-10 items-center gap-3 border-b border-rule">
                    <span className="w-5 font-mono text-label text-ink-3">{i + 1}</span>
                    <span className="label-caps w-20 text-ink-2">{toolWord[s.channel] ?? s.channel}</span>
                    <span className={`flex-1 ${s.doneOn ? 'text-ink-3' : 'text-ink'}`}>{s.note}</span>
                    {s.doneOn ? <span className="font-mono text-label text-ink-3">{s.doneOn}</span> : <TextLink label="Done" onClick={() => onPatch({ steps: c.steps.map((x, j) => (j === i ? { ...x, doneOn: today } : x)) })} />}
                  </li>
                ))}
              </ol>
              <form
                className="flex flex-wrap items-end gap-3"
                aria-label="Add a step"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault()
                  if (!step.note.trim()) return
                  onPatch({ steps: [...c.steps, { channel: step.channel, note: step.note.trim() }] })
                  setStep({ channel: step.channel, note: '' })
                }}
              >
                <Field label="Channel" kind="choice" value={step.channel} onChange={(x) => setStep({ ...step, channel: x })} choices={Object.entries(toolWord).map(([value, label]) => ({ value, label }))} />
                <div className="min-w-48 flex-1">
                  <Field label="Step" value={step.note} onChange={(x) => setStep({ ...step, note: x })} placeholder="Send the two-line profile" />
                </div>
                <PillButton label="Add step" type="submit" />
              </form>
            </div>
          ),
        },
      ]}
      onClose={onClose}
    />
  )
}

function NewCampaignCard({ onAdd, onClose }: { onAdd: (name: string, tool: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState('')
  const [tool, setTool] = useState('linkedin')
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <Card
      label="Campaign"
      title="New campaign"
      tone="new"
      sections={[
        {
          body: (
            <form
              className="flex flex-col gap-4"
              aria-label="New campaign"
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                if (!name.trim()) {
                  setProblem('Give it a name')
                  return
                }
                void onAdd(name.trim(), tool)
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" value={name} onChange={setName} autoFocus error={problem ?? undefined} />
                <Field label="Tool" kind="choice" value={tool} onChange={setTool} choices={Object.entries(toolWord).map(([value, label]) => ({ value, label }))} />
              </div>
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
