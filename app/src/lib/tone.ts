import type { Tone } from '../theme/tokens'

// Which state colour a thing takes (14 November 2026): what needs doing is
// action, what is waiting is pending, what is settled is clear. The dot and
// the word still carry the state in greyscale.

export function toneFor(input: { done?: boolean; dot?: 'solid' | 'hollow'; word?: string; fresh?: boolean }): Tone {
  if (input.done) return 'clear'
  if (input.fresh) return 'new'
  const w = (input.word ?? '').toLowerCase()
  if (w === 'late' || w === 'cold' || w === 'failed' || w === 'needs approval') return 'action'
  if (w === 'snoozed' || w === 'waiting' || w === 'paused' || w === 'auto') return 'pending'
  return input.dot === 'solid' ? 'action' : 'pending'
}

/** A count's tone: something to do, or nothing. */
export function toneForCount(n: number | undefined, urgent = false): Tone {
  if (n === undefined || n === 0) return 'clear'
  return urgent ? 'action' : 'pending'
}

/** Literal class names, so the build sees them. */
export const orbClass: Record<Tone | 'mist', string> = { new: 'orb-new', action: 'orb-action', pending: 'orb-pending', clear: 'orb-clear', mist: 'orb-mist' }
export const gradClass: Record<Tone | 'mist', string> = { new: 'grad-new', action: 'grad-action', pending: 'grad-pending', clear: 'grad-clear', mist: 'grad-mist' }
export const toneBg: Record<Tone, string> = { new: 'bg-tone-new', action: 'bg-tone-action', pending: 'bg-tone-pending', clear: 'bg-tone-clear' }

/** The word for a state, for a key or a label. */
export const toneWord: Record<Tone, string> = { new: 'New', action: 'Needs you', pending: 'Waiting', clear: 'Done' }
