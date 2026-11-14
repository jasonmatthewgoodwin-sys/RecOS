// Numbers are two digits with a leading zero so the row keeps its shape.
// A value over 99 shows 99 and a small plus (section 26.3).
export function twoDigits(n: number): { text: string; plus: boolean } {
  const safe = Math.max(0, Math.floor(n))
  if (safe > 99) return { text: '99', plus: true }
  return { text: String(safe).padStart(2, '0'), plus: false }
}

/** 3 follow-ups, 1 follow-up. */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
