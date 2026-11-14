import { orbClass } from '../lib/tone'
import type { Tone } from '../theme/tokens'

const states: { tone: Tone; word: string }[] = [
  { tone: 'new', word: 'New' },
  { tone: 'action', word: 'Needs you' },
  { tone: 'pending', word: 'Waiting' },
  { tone: 'clear', word: 'Done' },
]

// The colour key, one quiet line: what each state colour means (14 November 2026).
export function StateKey() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1" aria-label="Colour key">
      {states.map((s) => (
        <li key={s.tone} className="flex items-center gap-2 font-mono text-label text-ink-3">
          <span aria-hidden className={`block size-3 rounded-pill ${orbClass[s.tone]}`} />
          {s.word}
        </li>
      ))}
    </ul>
  )
}
