import type { Tone } from '../theme/tokens'

// Which state colour a thing takes (14 November 2026): what needs doing is
// action, what is waiting is pending, what is settled is clear. The dot and
// the word still carry the state in greyscale.

export function toneFor(input: { done?: boolean; dot?: 'solid' | 'hollow'; word?: string }): Tone {
  if (input.done) return 'clear'
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
export const orbClass: Record<Tone | 'mist', string> = { action: 'orb-action', pending: 'orb-pending', clear: 'orb-clear', mist: 'orb-mist' }
export const gradClass: Record<Tone | 'mist', string> = { action: 'grad-action', pending: 'grad-pending', clear: 'grad-clear', mist: 'grad-mist' }
export const toneBg: Record<Tone, string> = { action: 'bg-tone-action', pending: 'bg-tone-pending', clear: 'bg-tone-clear' }
