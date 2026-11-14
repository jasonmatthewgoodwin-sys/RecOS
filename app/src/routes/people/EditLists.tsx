import { useState, type FormEvent } from 'react'
import { Card } from '../../components/Card'
import { Field } from '../../components/Field'
import { PillButton } from '../../components/PillButton'
import { TextLink } from '../../components/TextLink'
import { data, type PeopleList } from '../../lib/data'
import { keyFromName, LISTS_KEY } from '../../lib/peopleTabs'
import { invalidate } from '../../lib/query'
import { orbClass, toneWord } from '../../lib/tone'
import type { Tone } from '../../theme/tokens'

const colours: (Tone | 'mist')[] = ['mist', 'new', 'action', 'pending', 'clear']

// Edit tabs (14 November 2026): the owner's lists under People. Add one,
// rename it, give it a colour, move it, archive it. Archived lists keep
// their people and come back with Restore.
export function EditLists({ lists, onClose, onNote }: { lists: PeopleList[]; onClose: () => void; onNote: (t: string) => void }) {
  const [names, setNames] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState(false)
  const ordered = [...lists].sort((a, b) => a.position - b.position)

  async function save(id: string, patch: Partial<Pick<PeopleList, 'name' | 'colour' | 'archived' | 'position'>>) {
    try {
      await data.updateList(id, patch)
      invalidate(LISTS_KEY)
    } catch {
      onNote('That did not save. Try again.')
    }
  }

  async function move(id: string, by: -1 | 1) {
    const live = ordered.filter((l) => !l.archived)
    const i = live.findIndex((l) => l.id === id)
    const j = i + by
    if (i < 0 || j < 0 || j >= live.length) return
    const a = live[i]
    const b = live[j]
    try {
      await data.updateList(a.id, { position: b.position === a.position ? b.position + by : b.position })
      await data.updateList(b.id, { position: a.position })
      invalidate(LISTS_KEY)
    } catch {
      onNote('That did not save. Try again.')
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    const name = adding.trim()
    if (!name) return
    setBusy(true)
    try {
      await data.createList({ name, key: keyFromName(name), position: (ordered.at(-1)?.position ?? 0) + 1 })
      invalidate(LISTS_KEY)
      setAdding('')
    } catch {
      onNote('That did not save. A list with that name may already exist.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      label="People"
      title="Edit tabs"
      sections={[
        {
          body: (
            <ul className="flex flex-col divide-y divide-rule" aria-label="Lists">
              {ordered.map((l) => (
                <li key={l.id} className="flex flex-col gap-3 py-4" data-list={l.key}>
                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <Field
                        label={l.archived ? 'Archived' : 'Name'}
                        value={names[l.id] ?? l.name}
                        onChange={(v) => setNames({ ...names, [l.id]: v })}
                        onBlur={() => {
                          const v = (names[l.id] ?? l.name).trim()
                          if (v && v !== l.name) void save(l.id, { name: v })
                        }}
                      />
                    </div>
                    {!l.archived && <TextLink label="Up" onClick={() => void move(l.id, -1)} />}
                    {!l.archived && <TextLink label="Down" onClick={() => void move(l.id, 1)} />}
                    <TextLink label={l.archived ? 'Restore' : 'Archive'} onClick={() => void save(l.id, { archived: !l.archived })} />
                  </div>
                  {!l.archived && (
                    <div className="flex flex-wrap gap-2" role="group" aria-label={`Colour for ${l.name}`}>
                      {colours.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={c === 'mist' ? 'No colour' : toneWord[c]}
                          aria-current={l.colour === c || undefined}
                          onClick={() => void save(l.id, { colour: c })}
                          className={`flex size-8 items-center justify-center rounded-pill border ${l.colour === c ? 'border-ink' : 'border-transparent'}`}
                        >
                          <span aria-hidden className={`block size-5 rounded-pill ${orbClass[c]}`} />
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ),
        },
        {
          label: 'Add a list',
          body: (
            <form onSubmit={(e) => void add(e)} className="flex items-end gap-4" aria-label="Add a list">
              <div className="flex-1">
                <Field label="Name" value={adding} onChange={setAdding} placeholder="Such as Warm clients" />
              </div>
              <PillButton label="Add" type="submit" busy={busy} />
            </form>
          ),
        },
      ]}
      foot="Groups within a list are set on a person's card, under Group."
      onClose={onClose}
    />
  )
}
