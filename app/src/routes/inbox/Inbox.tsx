import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Deck } from '../../components/Deck'
import { Field } from '../../components/Field'
import { HeroStat } from '../../components/HeroStat'
import { MessageRow } from '../../components/MessageRow'
import { Note } from '../../components/Note'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { TextLink } from '../../components/TextLink'
import { data, type InboxAction, type InboxActionExtra, type InboxFolder, type InboxItem } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { sourceLabel } from '../../lib/links'
import { isLive } from '../../lib/searches'
import {
  ageWord,
  agentWord,
  binReasons,
  boxCounts,
  byDeckOrder,
  countByType,
  deckOf,
  autoBox,
  autoFolders,
  autoOf,
  companyKey,
  folderBox,
  folderIdOf,
  folderNameProblem,
  inBox,
  isLate,
  oldestDays,
  primaryWord,
  snoozeChoices,
  typeFilters,
  typeWord,
  waiting,
  whoOf,
  type InboxBox,
} from '../../lib/inbox'
import { isTyping } from '../../lib/keyboard'
import { useIsPhone } from '../../lib/phone'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { ukClock, ukTime } from '../../lib/time'
import { FolderRail } from './FolderRail'
import { ApproveStep, BinStep, InboxItemView, PassStep } from './InboxItemView'

// The Inbox, laid out like a mail client (Jason, 2026-11-14; see
// docs/decisions.md): the owner's folders on the left, a dense list of
// messages, and the chosen one open in a reading pane with the same content
// and actions the deck has (section 27). The deck stays one link away.
// Actions update the screen first and the server second (25.5), and can be
// undone for 8 seconds (INBX-2).

const ITEMS_KEY = 'inbox.items'
const SENT_KEY = 'inbox.sent'
const FOLDERS_KEY = 'inbox.folders'
const DONE_KEY = 'inbox.closed.done'
const BINNED_KEY = 'inbox.closed.binned'
const UNDO_MS = 8000

type Asking = 'bin' | 'snooze' | 'pass' | 'approve' | null

/** What the primary button does to the item's status (22.3). */
function actionFor(item: InboxItem): InboxAction {
  if (item.type === 'wider_lead') return 'pass'
  if (item.type === 'content_draft' || item.type === 'client_nudge') return 'approve'
  return 'done'
}

/** The box named in the address: ?show=sent|done|binned, ?folder=id, or the older ?view=sent. */
function boxFromParams(params: URLSearchParams): InboxBox | null {
  const show = params.get('show') ?? (params.get('view') === 'sent' ? 'sent' : null)
  if (show === 'sent' || show === 'done' || show === 'binned') return show
  const folder = params.get('folder')
  if (folder) return folderBox(folder)
  const auto = params.get('auto')
  if (auto && autoOf(autoBox(auto as never))) return autoBox(auto as never)
  return null
}

/** Where an item lives, for a deep link that names only the item. */
function boxOfItem(item: InboxItem): InboxBox {
  if (item.type === 'auto_sent') return 'sent'
  if (item.status === 'done' || item.status === 'approved') return 'done'
  if (item.status === 'binned') return 'binned'
  return item.folderId ? folderBox(item.folderId) : 'inbox'
}

export function Inbox() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const phone = useIsPhone()
  // Read once when the page opens. Nothing changes while the owner looks at it.
  const [now] = useState(() => new Date())
  const clock = ukClock(now)

  const items = useQuery(ITEMS_KEY, data.inboxItems)
  const sent = useQuery(SENT_KEY, data.sentForYou)
  const folders = useQuery(FOLDERS_KEY, data.inboxFolders)
  const done = useQuery(DONE_KEY, () => data.inboxClosed('done'))
  const binned = useQuery(BINNED_KEY, () => data.inboxClosed('binned'))
  // Live searches name the clients, for the Clients folder (17 November 2026).
  const searches = useQuery('searches.list', data.searches)
  const clientKeys = useMemo(() => new Set((searches.data ?? []).filter(isLive).map((s) => companyKey(s.client))), [searches.data])

  const deckMode = params.get('view') === 'deck'
  const cardId = params.get('card')?.startsWith('item:') ? params.get('card')!.slice(5) : null

  // INBX-1: what waited when the page opened. Arrivals since then wait behind a quiet N new.
  const [shown, setShown] = useState<Set<string> | null>(null)
  // The deck, when chosen, is built once from what was there (INBX-1).
  const [deck, setDeck] = useState<InboxItem[] | null>(null)
  const [deckWaiting, setDeckWaiting] = useState(0)
  const [deckKey, setDeckKey] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [typeFilter, setTypeFilter] = useState('')
  const [clearing, setClearing] = useState(false)
  const [asking, setAsking] = useState<Asking>(null)
  const [undo, setUndo] = useState<{ item: InboxItem; action: InboxAction } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [folderEdit, setFolderEdit] = useState<'rename' | 'delete' | null>(null)
  const [folderName, setFolderName] = useState('')
  const [folderProblem, setFolderProblem] = useState<string | undefined>()
  const [note, setNote] = useState<string | null>(null)
  const reading = useRef<HTMLElement>(null)

  useEffect(() => {
    if (items.status === 'ready' && items.data) {
      if (shown === null) setShown(new Set(waiting(items.data).map((i) => i.id)))
      if (deckMode && deck === null) {
        setDeck(deckOf(items.data.filter((i) => !i.folderId)))
        setDeckWaiting(waiting(items.data).filter((i) => !i.folderId).length)
      }
    }
  }, [shown, deck, deckMode, items.status, items.data])

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current)
    },
    [],
  )

  const all = useMemo(() => items.data ?? [], [items.data])
  const waitingNow = waiting(all)
  const fresh = shown ? waitingNow.filter((i) => !shown.has(i.id)).length : 0
  const oldest = oldestDays(all, now)
  const folderList: InboxFolder[] = folders.data ?? []
  const counts = boxCounts(all, clientKeys)

  // Every item the page knows of, for a deep link to any of them.
  const known = useMemo(
    () => [...all, ...(sent.data ?? []), ...(done.data ?? []), ...(binned.data ?? [])],
    [all, sent.data, done.data, binned.data],
  )
  const linked = cardId ? known.find((i) => i.id === cardId) : undefined
  const explicitBox = boxFromParams(params)
  const box: InboxBox = explicitBox ?? (linked ? boxOfItem(linked) : 'inbox')
  const boxFolder = folderIdOf(box)
  const currentFolder = boxFolder ? folderList.find((f) => f.id === boxFolder) : undefined

  // ------------------------------------------------------------- the list

  const listItems: InboxItem[] = useMemo(() => {
    if (box === 'sent') return sent.data ?? []
    if (box === 'done') return done.data ?? []
    if (box === 'binned') return binned.data ?? []
    return inBox(all, box, clientKeys)
      .filter((i) => shown === null || shown.has(i.id))
      .filter((i) => typeFilter === '' || i.type === typeFilter)
      .sort(byDeckOrder)
  }, [box, all, shown, typeFilter, sent.data, done.data, binned.data, clientKeys])

  const listState =
    box === 'sent' ? sent.status : box === 'done' ? done.status : box === 'binned' ? binned.status : items.status
  const boxAuto = autoOf(box)
  const working = box === 'inbox' || boxFolder !== null || boxAuto !== null
  const staleHere = working ? inBox(all, box, clientKeys).filter((i) => i.status === 'stale') : []

  // On a laptop the first row is open when nothing is chosen. On a phone the list shows first.
  const selected: InboxItem | undefined = linked ?? (phone || cardId ? undefined : listItems[0])
  const selectedAt = selected ? listItems.findIndex((i) => i.id === selected.id) : -1

  function draftOf(item: InboxItem): string {
    return drafts[item.id] ?? item.draft ?? ''
  }

  function select(id: string | null) {
    setAsking(null)
    const pushed = (location.state as { card?: boolean } | null)?.card
    setParams(
      (p) => {
        if (id) p.set('card', `item:${id}`)
        else p.delete('card')
        return p
      },
      phone && id && !pushed ? { state: { card: true } } : { replace: true, state: location.state },
    )
  }

  /** Phone: back from the reading pane to the list. */
  function back() {
    setAsking(null)
    if ((location.state as { card?: boolean } | null)?.card) {
      navigate(-1)
      return
    }
    select(null)
  }

  function chooseBox(next: InboxBox) {
    setAsking(null)
    setFolderEdit(null)
    setClearing(false)
    setParams((p) => {
      p.delete('show')
      p.delete('folder')
      p.delete('auto')
      p.delete('card')
      if (p.get('view') === 'sent') p.delete('view')
      const f = folderIdOf(next)
      const a = autoOf(next)
      if (f) p.set('folder', f)
      else if (a) p.set('auto', a)
      else if (next !== 'inbox') p.set('show', next)
      return p
    })
  }

  function setDeckMode(on: boolean) {
    setAsking(null)
    setParams((p) => {
      if (on) p.set('view', 'deck')
      else p.delete('view')
      p.delete('card')
      return p
    })
    if (on) {
      setDeck(deckOf(all.filter((i) => !i.folderId)))
      setDeckWaiting(waitingNow.filter((i) => !i.folderId).length)
      setDeckKey((k) => k + 1)
    }
  }

  /** The row to open once the chosen one leaves the list: the next, or the one before. */
  function neighbourOf(item: InboxItem): string | null {
    const at = listItems.findIndex((i) => i.id === item.id)
    if (at === -1) return null
    const next = listItems[at + 1] ?? listItems[at - 1]
    return next ? next.id : null
  }

  function startUndo(item: InboxItem, action: InboxAction) {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndo({ item, action })
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS)
  }

  // The screen first, the server second. A failed write puts the item back
  // and says so once (25.5). Home's counts are refreshed after any action.
  async function act(item: InboxItem, action: InboxAction, extra: InboxActionExtra = {}, fromDeck = false) {
    const before = items.data
    const edited = drafts[item.id]
    const withDraft = edited !== undefined && edited !== item.draft ? { ...extra, draft: edited } : extra
    if (!fromDeck) {
      const next = neighbourOf(item)
      if (selected?.id === item.id) {
        if (phone) back()
        else select(next)
      }
      startUndo(item, action)
    }
    setAsking(null)
    setQueryData<InboxItem[]>(ITEMS_KEY, (rows) => (rows ?? []).filter((r) => r.id !== item.id))
    try {
      await data.actOnInbox(item, action, withDraft)
      invalidate('home')
      invalidate('inbox.closed')
    } catch {
      setQueryData<InboxItem[]>(ITEMS_KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  async function undoLast(item: InboxItem, action: InboxAction, fromDeck = false) {
    if (!fromDeck) {
      if (undoTimer.current) clearTimeout(undoTimer.current)
      setUndo(null)
      select(item.id)
    }
    setQueryData<InboxItem[]>(ITEMS_KEY, (rows) => [item, ...(rows ?? []).filter((r) => r.id !== item.id)])
    try {
      await data.undoInbox(item, action)
      invalidate('home')
      invalidate('inbox.closed')
    } catch {
      setNote('Could not undo that. Try again.')
    }
  }

  async function putBack(item: InboxItem) {
    setQueryData<InboxItem[]>(BINNED_KEY, (rows) => (rows ?? []).filter((r) => r.id !== item.id))
    select(neighbourOf(item))
    try {
      await data.undoInbox({ ...item, status: 'new' }, 'bin')
      invalidate('home')
      invalidate(ITEMS_KEY)
    } catch {
      invalidate(BINNED_KEY)
      setNote('That did not save. Try again.')
    }
  }

  async function clearOld() {
    const ids = staleHere.map((s) => s.id)
    const before = items.data
    setQueryData<InboxItem[]>(ITEMS_KEY, (rows) => (rows ?? []).filter((r) => !ids.includes(r.id)))
    setDeck((d) => (d ? d.filter((i) => !ids.includes(i.id)) : d))
    setDeckWaiting((n) => Math.max(0, n - ids.length))
    setDeckKey((k) => k + 1)
    setClearing(false)
    if (selected && ids.includes(selected.id)) select(null)
    try {
      await data.binStale(ids)
      invalidate('home')
      invalidate('inbox.closed')
    } catch {
      setQueryData<InboxItem[]>(ITEMS_KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  // --------------------------------------------------------- folders

  async function move(item: InboxItem, folderId: string | null) {
    if ((item.folderId ?? null) === folderId) return
    const before = items.data
    const leaves = working && (folderId ?? null) !== (boxFolder ?? null)
    if (leaves && selected?.id === item.id) {
      if (phone) back()
      else select(neighbourOf(item))
    }
    setQueryData<InboxItem[]>(ITEMS_KEY, (rows) => (rows ?? []).map((r) => (r.id === item.id ? { ...r, folderId } : r)))
    try {
      await data.moveInboxItem(item.id, folderId)
    } catch {
      setQueryData<InboxItem[]>(ITEMS_KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  async function createFolder(name: string): Promise<string | undefined> {
    try {
      const folder = await data.createInboxFolder(name)
      setQueryData<InboxFolder[]>(FOLDERS_KEY, (rows) => [...(rows ?? []), folder])
      return undefined
    } catch (e) {
      return e instanceof Error && /taken/.test(e.message) ? 'That name is taken' : 'That did not save. Try again.'
    }
  }

  async function renameFolder(folder: InboxFolder) {
    const problem = folderNameProblem(folderName, folderList.filter((f) => f.id !== folder.id).map((f) => f.name))
    if (problem) {
      setFolderProblem(problem)
      return
    }
    const before = folders.data
    setQueryData<InboxFolder[]>(FOLDERS_KEY, (rows) => (rows ?? []).map((f) => (f.id === folder.id ? { ...f, name: folderName.trim() } : f)))
    setFolderEdit(null)
    try {
      await data.renameInboxFolder(folder.id, folderName)
    } catch {
      setQueryData<InboxFolder[]>(FOLDERS_KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  async function deleteFolder(folder: InboxFolder) {
    const beforeFolders = folders.data
    const beforeItems = items.data
    setQueryData<InboxFolder[]>(FOLDERS_KEY, (rows) => (rows ?? []).filter((f) => f.id !== folder.id))
    setQueryData<InboxItem[]>(ITEMS_KEY, (rows) => (rows ?? []).map((r) => (r.folderId === folder.id ? { ...r, folderId: null } : r)))
    chooseBox('inbox')
    try {
      await data.deleteInboxFolder(folder.id)
    } catch {
      setQueryData<InboxFolder[]>(FOLDERS_KEY, () => beforeFolders ?? [])
      setQueryData<InboxItem[]>(ITEMS_KEY, () => beforeItems ?? [])
      setNote('That did not save. Try again.')
    }
  }

  // ------------------------------------------------------------ actions

  const canAct = selected !== undefined && selected.type !== 'auto_sent' && (selected.status === 'new' || selected.status === 'stale')

  function primary() {
    if (!selected || !canAct || asking) return
    if (selected.type === 'wider_lead') return setAsking('pass')
    if (selected.type === 'content_draft') return setAsking('approve')
    if (selected.type === 'system_notice') navigate('/settings')
    void act(selected, actionFor(selected))
  }

  function step(by: 1 | -1) {
    if (listItems.length === 0) return
    const at = selectedAt === -1 ? (by === 1 ? -1 : listItems.length) : selectedAt
    const next = listItems[Math.min(listItems.length - 1, Math.max(0, at + by))]
    if (next) select(next.id)
  }

  // Keys from section 25.6, in the two panes. The deck has its own.
  useEffect(() => {
    if (deckMode) return
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      const onControl = e.target instanceof HTMLElement && ['BUTTON', 'A', 'SELECT'].includes(e.target.tagName)
      switch (e.key) {
        case 'j':
          step(1)
          break
        case 'k':
          step(-1)
          break
        case 'Enter':
          if (!onControl) primary()
          break
        case 'd':
          primary()
          break
        case 'x':
          if (canAct) setAsking((a) => (a === 'bin' ? null : 'bin'))
          break
        case 's':
          if (canAct) setAsking((a) => (a === 'snooze' ? null : 'snooze'))
          break
        case 'Escape':
          if (asking) setAsking(null)
          else if (phone && selected) back()
          break
        case 'e': {
          const draft = reading.current?.querySelector<HTMLTextAreaElement>('[data-draft]')
          if (draft) {
            e.preventDefault()
            draft.focus()
            draft.setSelectionRange(draft.value.length, draft.value.length)
          }
          break
        }
        default:
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const waitingCount = items.data === undefined ? undefined : twoDigits(waitingNow.length)

  const header = (
    <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-12 gap-y-4">
      <h1 className="text-title text-ink">Inbox</h1>
      <div className="flex gap-x-12">
        <HeroStat label="Waiting" value={waitingCount?.text} plus={waitingCount?.plus} onClick={() => chooseBox('inbox')} />
        {oldest !== null && oldest > 7 && <HeroStat label="Oldest" value={twoDigits(oldest).text} plus={twoDigits(oldest).plus} />}
      </div>
    </header>
  )

  // ------------------------------------------------------------- the deck

  if (deckMode) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-8">
        {header}
        <div className="min-h-0 flex-1 overflow-auto">
          {deck === null ? (
            items.status === 'error' ? <EmptyLine text="Could not load. Try again." /> : <Dots />
          ) : (
            <div className="flex flex-col gap-6">
              {fresh > 0 && (
                <TextLink
                  label={`${fresh} new`}
                  onClick={() => {
                    setShown(new Set(waitingNow.map((i) => i.id)))
                    setDeckMode(true)
                  }}
                />
              )}
              <Deck
                key={deckKey}
                items={deck}
                waiting={deckWaiting}
                renderItem={(item) => <InboxItemView item={item} draft={draftOf(item)} onDraft={(t) => setDrafts((d) => ({ ...d, [item.id]: t }))} />}
                primaryAction={{
                  label: (item) => primaryWord[item.type],
                  onClick: (item) => {
                    if (item.type === 'wider_lead' || item.type === 'content_draft') return 'ask'
                    if (item.type === 'system_notice') navigate('/settings')
                    void act(item, actionFor(item), {}, true)
                  },
                  step: (item, dealt, cancel) =>
                    item.type === 'wider_lead' ? (
                      <PassStep
                        onConfirm={(colleague, split) => {
                          void act(item, 'pass', { colleague, split }, true)
                          dealt()
                        }}
                        onCancel={cancel}
                      />
                    ) : (
                      <ApproveStep
                        clock={clock}
                        onConfirm={(on) => {
                          void act(item, 'approve', { on }, true)
                          dealt()
                        }}
                        onCancel={cancel}
                      />
                    ),
                }}
                onBin={(item, reason) => void act(item, 'bin', { binReason: reason }, true)}
                binReasons={(item) => binReasons[item.type]}
                onSnooze={(item, until) => void act(item, 'snooze', { snoozedUntil: until }, true)}
                snoozeChoices={snoozeChoices(clock)}
                onUndo={(item, action) => void undoLast(item, action === 'primary' || action === 'extra' ? actionFor(item) : action, true)}
                links={(item) => (
                  <>
                    {item.type === 'job_lead' && item.draft !== null && (
                      <TextLink label="Copy" onClick={() => void navigator.clipboard?.writeText(draftOf(item))} />
                    )}
                    {item.sourceUrl && <TextLink label={sourceLabel(item.sourceUrl)} href={item.sourceUrl} icon="open" />}
                  </>
                )}
                onList={() => setDeckMode(false)}
                emptyText="All clear"
              />
            </div>
          )}
        </div>
        {note && <Note text={note} onClose={() => setNote(null)} />}
      </div>
    )
  }

  // ------------------------------------------------------------- the panes

  const boxLabel =
    box === 'inbox' ? 'Inbox' : box === 'sent' ? 'Sent for you' : box === 'done' ? 'Done' : box === 'binned' ? 'Binned' : boxAuto ? autoFolders.find((f) => f.key === boxAuto)!.label : currentFolder?.name ?? 'Folder'
  const emptyText =
    box === 'sent'
      ? 'Nothing sent automatically this week'
      : box === 'done'
        ? 'Nothing done in the last 30 days'
        : box === 'binned'
          ? 'Nothing binned in the last 30 days'
          : boxFolder || boxAuto
            ? 'Nothing in this folder'
            : 'All clear'

  const listPane = (
    <section aria-label="Messages" className="flex min-h-0 flex-col gap-3 md:w-[22rem] md:shrink-0 lg:w-[24rem]">
      <div className="flex shrink-0 flex-col gap-2">
        <div className="flex min-h-10 items-center justify-between gap-4">
          <p className="label-caps text-ink-2">{boxLabel}</p>
          <div className="flex items-center gap-4">
            {currentFolder && folderEdit === null && (
              <>
                <TextLink
                  label="Rename"
                  onClick={() => {
                    setFolderEdit('rename')
                    setFolderName(currentFolder.name)
                    setFolderProblem(undefined)
                  }}
                />
                <TextLink label="Delete" onClick={() => setFolderEdit('delete')} />
              </>
            )}
            {box === 'inbox' && !phone && <TextLink label="Deck" onClick={() => setDeckMode(true)} />}
          </div>
        </div>
        {currentFolder && folderEdit === 'rename' && (
          <form
            aria-label="Rename folder"
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void renameFolder(currentFolder)
            }}
          >
            <Field label="Name" value={folderName} onChange={(v) => {
              setFolderName(v)
              setFolderProblem(undefined)
            }} error={folderProblem} autoFocus />
            <div className="flex items-center gap-4">
              <TextLink label="Save" onClick={() => void renameFolder(currentFolder)} />
              <TextLink label="Back" onClick={() => setFolderEdit(null)} />
            </div>
          </form>
        )}
        {currentFolder && folderEdit === 'delete' && (
          <div className="flex flex-col gap-2" role="group" aria-label="Delete folder">
            <p className="text-body text-ink-2">
              Delete {currentFolder.name}? {counts.folders[currentFolder.id] ? 'Its items go back to Inbox.' : 'It is empty.'}
            </p>
            <div className="flex items-center gap-4">
              <TextLink label="Delete it" onClick={() => void deleteFolder(currentFolder)} />
              <TextLink label="Keep it" onClick={() => setFolderEdit(null)} />
            </div>
          </div>
        )}
        {working && (
          <div className="max-w-56">
            <Field
              label="Show"
              kind="choice"
              value={typeFilter}
              onChange={setTypeFilter}
              choices={[{ value: '', label: 'All types' }, ...typeFilters.map((t) => ({ value: t.value, label: t.label }))]}
            />
          </div>
        )}
        {working && fresh > 0 && <TextLink label={`${fresh} new`} onClick={() => setShown(new Set(waitingNow.map((i) => i.id)))} />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" data-pane="list">
        {listState === 'loading' ? (
          <Dots />
        ) : listState === 'error' ? (
          <EmptyLine text="Could not load. Try again." />
        ) : listItems.length === 0 ? (
          <EmptyLine text={emptyText} />
        ) : (
          <ul className="border-t border-rule" aria-label={boxLabel}>
            {listItems.map((i) => (
              <MessageRow
                key={i.id}
                id={i.id}
                dot={i.status === 'new' ? 'solid' : 'hollow'}
                who={whoOf(i)}
                title={i.title}
                type={typeWord[i.type]}
                age={box === 'sent' ? ukTime(new Date(i.createdAt)) : ageWord(i.createdAt, now)}
                word={i.type === 'auto_sent' ? 'Auto' : working && isLate(i, clock.date) ? 'Late' : undefined}
                selected={selected?.id === i.id}
                onSelect={() => select(i.id)}
                draggable={working && !phone}
              />
            ))}
          </ul>
        )}
      </div>

      {working && staleHere.length > 0 && listItems.length > 0 && (
        <div className="flex shrink-0 flex-col gap-2">
          {clearing ? (
            <>
              <p className="text-body text-ink-2">Bin {countByType(staleHere)}?</p>
              <div className="flex items-center gap-6">
                <PillButton label="Bin them" onClick={() => void clearOld()} />
                <TextLink label="Keep them" onClick={() => setClearing(false)} />
              </div>
            </>
          ) : (
            <TextLink label="Clear old items" onClick={() => setClearing(true)} />
          )}
        </div>
      )}
    </section>
  )

  const folderChoices = [{ value: '', label: 'Inbox' }, ...folderList.map((f) => ({ value: f.id, label: f.name }))]

  const readingPane = (
    <article
      ref={reading}
      aria-label="Reading pane"
      data-reading
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto md:border-l md:border-rule md:pl-10"
    >
      {phone && (
        <div className="mb-4">
          <TextLink label="Back" onClick={back} />
        </div>
      )}
      {!selected ? (
        listItems.length === 0 ? null : <EmptyLine text="Choose a message" />
      ) : (
        <div key={selected.id} className="flex flex-col gap-6 animate-fade">
          <div className="flex flex-col gap-2">
            <p className="flex flex-wrap items-center gap-x-4 label-caps text-ink-2">
              <span>{typeWord[selected.type]}</span>
              {selected.type === 'auto_sent' && <span className="text-ink">Auto</span>}
              {isLate(selected, clock.date) && canAct && <span className="text-ink">Late</span>}
              <span className="font-mono text-ink-3 normal-case">{ageWord(selected.createdAt, now)}</span>
            </p>
            <h2 className="text-title text-ink">{selected.title}</h2>
          </div>
          <InboxItemView
            item={selected}
            heading={false}
            draft={draftOf(selected)}
            onDraft={(t) => setDrafts((d) => ({ ...d, [selected.id]: t }))}
          />
          {selected.status === 'binned' && selected.binReason && <p className="text-body text-ink-2">Binned: {selected.binReason}</p>}

          {asking === 'pass' ? (
            <PassStep onConfirm={(colleague, split) => void act(selected, 'pass', { colleague, split })} onCancel={() => setAsking(null)} />
          ) : asking === 'approve' ? (
            <ApproveStep clock={clock} onConfirm={(on) => void act(selected, 'approve', { on })} onCancel={() => setAsking(null)} />
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2" data-controls>
              {canAct && <PillButton kind="primary" label={primaryWord[selected.type]} onClick={primary} />}
              {undo && <TextLink label="Undo" onClick={() => void undoLast(undo.item, undo.action)} />}
              {canAct && <TextLink label="Skip" onClick={() => step(1)} />}
              {canAct && <TextLink label="Snooze" onClick={() => setAsking((a) => (a === 'snooze' ? null : 'snooze'))} active={asking === 'snooze'} />}
              {canAct && <TextLink label="Bin" onClick={() => setAsking((a) => (a === 'bin' ? null : 'bin'))} active={asking === 'bin'} />}
              {selected.status === 'binned' && <TextLink label="Put back" onClick={() => void putBack(selected)} />}
              {selected.draft !== null && canAct && (
                <TextLink label="Copy" onClick={() => void navigator.clipboard?.writeText(draftOf(selected))} />
              )}
              {selected.sourceUrl && <TextLink label={sourceLabel(selected.sourceUrl)} href={selected.sourceUrl} icon="open" />}
            </div>
          )}

          {asking === 'bin' && (
            <BinStep reasons={binReasons[selected.type]} onBin={(r) => void act(selected, 'bin', { binReason: r })} onCancel={() => setAsking(null)} />
          )}
          {asking === 'snooze' && (
            <div className="flex flex-col gap-2" role="group" aria-label="Until">
              <p className="label-caps text-ink-2">Until</p>
              <div className="flex flex-wrap items-center gap-x-6">
                {snoozeChoices(clock).map((c) => (
                  <TextLink key={c.value} label={c.label} onClick={() => void act(selected, 'snooze', { snoozedUntil: c.value })} />
                ))}
              </div>
            </div>
          )}

          {canAct && (
            <div className="max-w-56">
              <Field label="Folder" kind="choice" value={selected.folderId ?? ''} onChange={(v) => void move(selected, v === '' ? null : v)} choices={folderChoices} />
            </div>
          )}

          <p className="mt-auto pt-4 font-mono text-label text-ink-3">
            Found by {agentWord[selected.agent] ?? selected.agent}
            {selected.source ? `, ${selected.source}` : ''}
          </p>
        </div>
      )}
    </article>
  )

  const rail = (
    <div className="hidden w-44 shrink-0 overflow-y-auto md:block" data-pane="folders">
      <FolderRail box={box} folders={folderList} counts={counts} onBox={chooseBox} onCreate={createFolder} onDrop={(id, f) => {
        const item = all.find((i) => i.id === id)
        if (item) void move(item, f)
      }} />
    </div>
  )

  // Phone: the list, or the chosen message full screen with Back (25.8).
  if (phone) {
    return (
      <div className="flex flex-col gap-6">
        {selected ? (
          readingPane
        ) : (
          <>
            {header}
            <Field
              label="Folder"
              kind="choice"
              value={box}
              onChange={(v) => chooseBox(v as InboxBox)}
              choices={[
                { value: 'inbox', label: 'Inbox' },
                ...autoFolders.map((f) => ({ value: autoBox(f.key), label: f.label })),
                ...folderList.map((f) => ({ value: folderBox(f.id), label: f.name })),
                { value: 'sent', label: 'Sent for you' },
                { value: 'done', label: 'Done' },
                { value: 'binned', label: 'Binned' },
              ]}
            />
            {listPane}
          </>
        )}
        {note && <Note text={note} onClose={() => setNote(null)} />}
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-14rem)] min-h-[28rem] flex-col gap-6" data-inbox-panes>
      {header}
      <div className="flex min-h-0 flex-1 gap-8">
        {rail}
        {listPane}
        {readingPane}
      </div>
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
