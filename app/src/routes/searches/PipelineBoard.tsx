import { useState } from 'react'
import { Row } from '../../components/Row'
import { TextLink } from '../../components/TextLink'
import { daysSince } from '../../lib/bd'
import type { CandidateStage, SearchCandidate } from '../../lib/data'
import { boardStages, candidateNeedsDesk, feedbackWord, stageWord } from '../../lib/searches'

type Props = {
  candidates: SearchCandidate[]
  today: string
  onOpen: (id: string) => void
  /** Drag a card to a column, or pick one from its Move to menu. */
  onMove: (c: SearchCandidate, stage: CandidateStage) => void
}

// The pipeline as a board, like Spott (Jason, 18 November 2026): ten columns
// left to right, Application to Placed. Rejected and Withdrew sit behind a
// link under the board. The board scrolls sideways inside its own pane and
// each column scrolls down inside itself, so the page stays put. A card
// shows the name, title and company, the days in its stage and a small
// solid dot with the word when feedback is late. Drag it to a column, or
// use its Move to menu from the keyboard; clicking the name opens the
// candidate. Nothing moves on its own.
export function PipelineBoard({ candidates, today, onOpen, onMove }: Props) {
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<CandidateStage | null>(null)
  const [showOut, setShowOut] = useState(false)
  const out = candidates.filter((c) => c.stage === 'rejected' || c.stage === 'withdrew')

  function drop(stage: CandidateStage) {
    const c = candidates.find((x) => x.id === drag)
    setDrag(null)
    setOver(null)
    if (c && c.stage !== stage) onMove(c, stage)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-1 overflow-x-auto overscroll-x-contain pb-2" data-board-pane>
        <ol className="flex min-w-max gap-3 px-1" aria-label="Pipeline board">
          {boardStages.map((stage) => {
            const here = candidates.filter((c) => c.stage === stage).sort((a, b) => a.stageChangedOn.localeCompare(b.stageChangedOn))
            return (
              <li
                key={stage}
                aria-label={stageWord[stage]}
                data-column={stage}
                data-over={over === stage || undefined}
                onDragOver={(e) => {
                  if (!drag) return
                  e.preventDefault()
                  if (over !== stage) setOver(stage)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  drop(stage)
                }}
                className={`flex w-52 shrink-0 flex-col gap-2 rounded-sheet border p-1 ${over === stage ? 'border-dashed border-ink' : 'border-transparent'}`}
              >
                <h4 className="label-caps flex items-baseline justify-between px-1 text-ink-2">
                  {stageWord[stage]}
                  <span className="font-mono tabular-nums text-ink-3">{String(here.length).padStart(2, '0')}</span>
                </h4>
                <ul className="flex max-h-[calc(100vh-26rem)] min-h-24 flex-col gap-2 overflow-y-auto">
                  {here.map((c) => (
                    <BoardCard key={c.id} c={c} today={today} dragging={drag === c.id} onOpen={() => onOpen(c.id)} onMove={(st) => onMove(c, st)} onDragStart={() => setDrag(c.id)} onDragEnd={() => { setDrag(null); setOver(null) }} />
                  ))}
                </ul>
              </li>
            )
          })}
        </ol>
      </div>
      {out.length > 0 && (
        <div className="flex flex-col gap-1">
          <div>
            <TextLink label={showOut ? 'Hide rejected and withdrew' : `Rejected and withdrew, ${out.length}`} onClick={() => setShowOut((v) => !v)} />
          </div>
          {showOut && (
            <ul className="flex max-h-64 max-w-3xl flex-col overflow-y-auto" aria-label="Rejected and withdrew">
              {out.map((c) => (
                <Row key={c.id} dot="hollow" done title={c.name} detail={[c.title, c.company].filter(Boolean).join(', ')} meta={`${daysSince(c.stageChangedOn, today)}d`} word={stageWord[c.stage]} onOpen={() => onOpen(c.id)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function BoardCard({ c, today, dragging, onOpen, onMove, onDragStart, onDragEnd }: { c: SearchCandidate; today: string; dragging: boolean; onOpen: () => void; onMove: (stage: CandidateStage) => void; onDragStart: () => void; onDragEnd: () => void }) {
  const late = candidateNeedsDesk(c, today) && c.stage !== 'offer'
  const fb = feedbackWord(c, today)
  const days = daysSince(c.stageChangedOn, today)
  return (
    <li
      draggable
      data-candidate-card={c.id}
      onDragStart={(e) => {
        e.dataTransfer?.setData('text/plain', c.id)
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={`relative flex cursor-grab flex-col gap-1 rounded-sheet border border-rule bg-sheet p-3 active:cursor-grabbing ${dragging ? 'opacity-40' : ''}`}
    >
      <button type="button" onClick={onOpen} className="flex flex-col items-start text-left">
        <span className="text-body text-ink">{c.name}</span>
        {(c.title || c.company) && <span className="text-label text-ink-2">{[c.title, c.company].filter(Boolean).join(', ')}</span>}
      </button>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-label text-ink-3" title="Days in this stage">
          {days}d
        </span>
        {late && fb && (
          <span className="inline-flex items-center gap-1 font-mono text-label text-ink" data-overdue>
            <span aria-hidden className="block size-2 rounded-pill bg-ink" />
            {fb}
          </span>
        )}
      </div>
      <label className="sr-only" htmlFor={`move-${c.id}`}>
        Move {c.name} to
      </label>
      <select
        id={`move-${c.id}`}
        value=""
        onChange={(e) => e.target.value && onMove(e.target.value as CandidateStage)}
        className="w-full cursor-pointer border-b border-transparent bg-transparent font-mono text-label text-ink-3 outline-none hover:text-ink focus:border-ink focus:text-ink"
      >
        <option value="">Move to</option>
        {boardStages
          .filter((st) => st !== c.stage)
          .map((st) => (
            <option key={st} value={st}>
              {stageWord[st]}
            </option>
          ))}
      </select>
    </li>
  )
}
