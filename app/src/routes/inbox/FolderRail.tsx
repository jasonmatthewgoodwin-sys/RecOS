import { useState, type FormEvent } from 'react'
import { Field } from '../../components/Field'
import { TextLink } from '../../components/TextLink'
import type { InboxFolder } from '../../lib/data'
import { autoBox, autoFolders, folderBox, folderNameProblem, type BoxCounts, type InboxBox } from '../../lib/inbox'

type Props = {
  box: InboxBox
  folders: InboxFolder[]
  counts: BoxCounts
  onBox: (box: InboxBox) => void
  /** Resolves to a problem in words, or nothing when made. */
  onCreate: (name: string) => Promise<string | undefined>
  /** An item dragged from the list and dropped here: null is Inbox. */
  onDrop: (itemId: string, folderId: string | null) => void
}

type Place = { box: InboxBox; label: string; count?: number; folderId?: string | null }

// The left side of the Inbox (Jason, 14 and 17 November 2026): Inbox, the
// four automatic folders, the owner's own folders with how many wait in
// each, then Sent for you, Done and Binned. A
// row from the list can be dropped on Inbox or a folder to file it.
export function FolderRail({ box, folders, counts, onBox, onCreate, onDrop }: Props) {
  const [making, setMaking] = useState(false)
  const [name, setName] = useState('')
  const [problem, setProblem] = useState<string | undefined>()
  const [over, setOver] = useState<string | null>(null)

  async function submit() {
    const local = folderNameProblem(name, folders.map((f) => f.name))
    if (local) {
      setProblem(local)
      return
    }
    const remote = await onCreate(name.trim())
    if (remote) {
      setProblem(remote)
      return
    }
    setMaking(false)
    setName('')
    setProblem(undefined)
  }

  const working: Place[] = [{ box: 'inbox', label: 'Inbox', count: counts.inbox, folderId: null }]
  // Automatic: nothing is dropped on these, they sort themselves.
  const auto: Place[] = autoFolders.map((f) => ({ box: autoBox(f.key), label: f.label, count: counts.auto[f.key] }))
  const own: Place[] = [
    ...folders.map((f) => ({ box: folderBox(f.id), label: f.name, count: counts.folders[f.id] ?? 0, folderId: f.id })),
  ]
  const looking: Place[] = [
    { box: 'sent', label: 'Sent for you' },
    { box: 'done', label: 'Done' },
    { box: 'binned', label: 'Binned' },
  ]

  function place(p: Place) {
    const active = p.box === box
    const droppable = p.folderId !== undefined
    return (
      <li key={p.box}>
        <button
          type="button"
          onClick={() => onBox(p.box)}
          aria-current={active || undefined}
          data-box={p.box}
          data-drop-over={over === p.box || undefined}
          onDragOver={
            droppable
              ? (e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setOver(p.box)
                }
              : undefined
          }
          onDragLeave={droppable ? () => setOver((o) => (o === p.box ? null : o)) : undefined}
          onDrop={
            droppable
              ? (e) => {
                  e.preventDefault()
                  setOver(null)
                  const id = e.dataTransfer.getData('text/plain')
                  if (id) onDrop(id, p.folderId ?? null)
                }
              : undefined
          }
          className={`flex min-h-10 w-full items-center gap-3 rounded-tab border px-3 text-left text-body ${
            over === p.box ? 'border-ink' : 'border-transparent'
          } ${active ? 'font-medium text-ink' : 'text-ink-2 hover:text-ink'}`}
        >
          <span className="min-w-0 flex-1 truncate">{p.label}</span>
          {p.count !== undefined && p.count > 0 && <span className="shrink-0 font-mono text-label tabular-nums text-ink-3">{p.count}</span>}
        </button>
      </li>
    )
  }

  return (
    <nav aria-label="Folders" className="flex flex-col gap-4">
      <ul className="flex flex-col">{working.map(place)}</ul>
      <ul className="flex flex-col" aria-label="Sorted for you">{auto.map(place)}</ul>
      {own.length > 0 && <ul className="flex flex-col border-t border-rule pt-4" aria-label="Your folders">{own.map(place)}</ul>}
      {making ? (
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault()
          void submit()
        }} className="flex flex-col gap-2 px-3" aria-label="New folder">
          <Field label="New folder" value={name} onChange={(v) => {
            setName(v)
            setProblem(undefined)
          }} placeholder="A name" error={problem} autoFocus />
          <div className="flex items-center gap-4">
            <TextLink label="Make it" onClick={() => void submit()} />
            <TextLink
              label="Back"
              onClick={() => {
                setMaking(false)
                setName('')
                setProblem(undefined)
              }}
            />
          </div>
        </form>
      ) : (
        <div className="px-3">
          <TextLink label="New folder" onClick={() => setMaking(true)} />
        </div>
      )}
      <ul className="flex flex-col border-t border-rule pt-4">{looking.map(place)}</ul>
    </nav>
  )
}
