import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isTyping } from '../lib/keyboard'
import { twoDigits } from '../lib/format'
import { Field } from './Field'
import { PillButton } from './PillButton'
import { EmptyLine } from './Quiet'
import { TextLink } from './TextLink'
import { TickMeter } from './TickMeter'

export type DeckItem = { id: string }

export type DeckAction = 'primary' | 'bin' | 'snooze'

export type DeckChoice = { label: string; value: string }

type Props<T extends DeckItem> = {
  /** The deck is built once from these and does not change while worked (INBX-1). */
  items: T[]
  renderItem: (item: T) => ReactNode
  primaryAction: {
    label: (item: T) => string
    /** Return 'ask' to show the step first; the item is dealt with when the step calls done. */
    onClick: (item: T) => void | 'ask'
    step?: (item: T, done: () => void, cancel: () => void) => ReactNode
  }
  /** With binReasons, Bin asks why first: three quick reasons and Other (27.2). */
  onBin?: (item: T, reason: string) => void
  binReasons?: (item: T) => string[]
  /** With snoozeChoices, Snooze asks when first. */
  onSnooze?: (item: T, until: string) => void
  snoozeChoices?: DeckChoice[]
  /** Called when the owner clicks Undo within 8 seconds of an action (INBX-2). */
  onUndo?: (item: T, action: DeckAction) => void
  /** Quiet links after the controls, such as Open source. */
  links?: (item: T) => ReactNode
  /** The List link in the corner. */
  onList?: () => void
  /** How many wait in all when more than fit in the deck (INBX-6). */
  waiting?: number
  emptyText?: string
}

const UNDO_MS = 8000

// One item shown large, like a track in a player (section 3.12). Three
// controls: the primary action for the item, Skip and Bin. Snooze and other
// quiet links sit after them. A tick meter shows progress through the deck.
export function Deck<T extends DeckItem>({
  items,
  renderItem,
  primaryAction,
  onBin,
  binReasons,
  onSnooze,
  snoozeChoices,
  onUndo,
  links,
  onList,
  waiting,
  emptyText = 'All clear',
}: Props<T>) {
  const [queue, setQueue] = useState<T[]>(() => items)
  const [cleared, setCleared] = useState(0)
  const [undo, setUndo] = useState<{ item: T; action: DeckAction } | null>(null)
  const [asking, setAsking] = useState<'primary' | 'bin' | 'snooze' | null>(null)
  const [other, setOther] = useState('')
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const root = useRef<HTMLElement>(null)
  const total = items.length
  const current = queue[0]

  function deal(item: T, action: DeckAction) {
    setQueue((q) => q.filter((i) => i.id !== item.id))
    setCleared((n) => n + 1)
    setUndo({ item, action })
    setAsking(null)
    setOther('')
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS)
  }

  function undoLast() {
    if (!undo) return
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setQueue((q) => [undo.item, ...q])
    setCleared((n) => n - 1)
    onUndo?.(undo.item, undo.action)
    setUndo(null)
  }

  // Skipping asks nothing and moves the item to the end of the deck (27.2).
  const skip = () => {
    setAsking(null)
    setQueue((q) => (q.length > 1 ? [...q.slice(1), q[0]] : q))
  }
  const back = () => {
    setAsking(null)
    setQueue((q) => (q.length > 1 ? [q[q.length - 1], ...q.slice(0, -1)] : q))
  }

  const primary = () => {
    if (!current || asking) return
    const result = primaryAction.onClick(current)
    if (result === 'ask' && primaryAction.step) {
      setAsking('primary')
      return
    }
    deal(current, 'primary')
  }
  const bin = () => {
    if (!current || !onBin) return
    if (binReasons) {
      setAsking((a) => (a === 'bin' ? null : 'bin'))
      return
    }
    onBin(current, 'Other')
    deal(current, 'bin')
  }
  const binWith = (reason: string) => {
    if (!current || !onBin || !reason.trim()) return
    onBin(current, reason.trim())
    deal(current, 'bin')
  }
  const snooze = () => {
    if (!current || !onSnooze) return
    if (snoozeChoices) {
      setAsking((a) => (a === 'snooze' ? null : 'snooze'))
      return
    }
    onSnooze(current, '')
    deal(current, 'snooze')
  }
  const snoozeUntil = (until: string) => {
    if (!current || !onSnooze) return
    onSnooze(current, until)
    deal(current, 'snooze')
  }

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
  }, [])

  // Keys from section 25.6. Enter and d run the primary action only when
  // nothing else has focus, so a focused button is not pressed twice.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      const onControl = e.target instanceof HTMLElement && ['BUTTON', 'A', 'SELECT'].includes(e.target.tagName)
      switch (e.key) {
        case 'j':
          skip()
          break
        case 'k':
          back()
          break
        case 'Enter':
          if (!onControl) primary()
          break
        case 'd':
          primary()
          break
        case 'x':
          bin()
          break
        case 's':
          snooze()
          break
        case 'Escape':
          setAsking(null)
          break
        case 'e': {
          const draft = root.current?.querySelector<HTMLTextAreaElement>('[data-draft]')
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

  if (total === 0) return <EmptyLine text={emptyText} />

  if (!current) {
    // INBX-4: the sheet shows All clear and what was cleared in this sitting.
    return (
      <section aria-label="Deck" data-deck className="flex flex-col gap-4">
        <EmptyLine text={emptyText} />
        <p className="label-caps text-ink-2">
          {twoDigits(cleared).text} cleared this sitting
        </p>
        {undo && (
          <div>
            <TextLink label="Undo" onClick={undoLast} />
          </div>
        )}
      </section>
    )
  }

  const counter = `${twoDigits(cleared + 1).text} of ${twoDigits(total).text}${twoDigits(total).plus ? '+' : ''}`
  const held = waiting !== undefined && waiting > total ? `, ${waiting} waiting` : ''

  return (
    <section ref={root} aria-label="Deck" data-deck className="flex min-h-96 flex-col">
      <div className="flex items-center justify-between">
        <p className="font-mono text-label tabular-nums text-ink-2" data-testid="deck-counter">
          {counter}
          {held}
        </p>
        {onList && <TextLink label="List" onClick={onList} />}
      </div>

      <div key={current.id} className="mt-8 flex-1 animate-fade">
        {renderItem(current)}
      </div>

      {asking === 'primary' && primaryAction.step ? (
        <div className="mt-8" data-deck-step>
          {primaryAction.step(
            current,
            () => deal(current, 'primary'),
            () => setAsking(null),
          )}
        </div>
      ) : (
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
          <PillButton kind="primary" label={primaryAction.label(current)} onClick={primary} />
          {undo && <TextLink label="Undo" onClick={undoLast} />}
          <TextLink label="Skip" onClick={skip} />
          {onSnooze && <TextLink label="Snooze" onClick={snooze} active={asking === 'snooze'} />}
          {onBin && <TextLink label="Bin" onClick={bin} active={asking === 'bin'} />}
          {links?.(current)}
        </div>
      )}

      {asking === 'bin' && binReasons && (
        <div className="mt-4 flex flex-col gap-2" role="group" aria-label="Why">
          <p className="label-caps text-ink-2">Why</p>
          <div className="flex flex-wrap items-center gap-x-6">
            {binReasons(current).map((r) => (
              <TextLink key={r} label={r} onClick={() => binWith(r)} />
            ))}
            <TextLink label="Other" onClick={() => setOther(other || ' ')} active={other !== ''} />
          </div>
          {other !== '' && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                binWith(other)
              }}
              className="flex max-w-sm flex-col gap-4"
            >
              <Field label="Reason" value={other.trim() === '' ? '' : other} onChange={setOther} autoFocus placeholder="In a few words" />
              <div>
                <PillButton label="Bin" type="submit" />
              </div>
            </form>
          )}
        </div>
      )}

      {asking === 'snooze' && snoozeChoices && (
        <div className="mt-4 flex flex-col gap-2" role="group" aria-label="Until">
          <p className="label-caps text-ink-2">Until</p>
          <div className="flex flex-wrap items-center gap-x-6">
            {snoozeChoices.map((c) => (
              <TextLink key={c.value} label={c.label} onClick={() => snoozeUntil(c.value)} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-16">
        <TickMeter filled={cleared} total={total} />
      </div>
    </section>
  )
}
