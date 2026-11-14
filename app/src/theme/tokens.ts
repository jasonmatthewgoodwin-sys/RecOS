// Section 25.9 of the low-level design. The CSS in theme.css mirrors these
// values; tokens.test.ts fails if the two drift apart.
export const theme = {
  colour: {
    paper: '#EFEDE8',
    sheet: '#F6F4F0',
    ink: '#1C1C1A',
    ink2: '#5E5D59',
    ink3: '#9A9893',
    rule: '#C9C6BF',
    note: '#262624',
  },
  radius: { pill: 999, card: 20, sheet: 24, tab: 12 },
  space: [0, 4, 8, 16, 24, 32, 48, 64, 96],
  font: {
    sans: 'var(--font-sans)',
    mono: 'var(--font-mono)',
    hero: 64,
    title: 30,
    body: 16,
    label: 12,
  },
  line: { hair: 1, focus: 2 },
  motion: { tab: 150, card: 200 },
} as const

// Night swaps paper and sheet for charcoal and ink for off-white (section 3.6).
// The greys are the same ramp reversed. No other token changes.
export const night = {
  paper: '#1C1C1A',
  sheet: '#262624',
  ink: '#F6F4F0',
  ink2: '#C9C6BF',
  ink3: '#9A9893',
  rule: '#5E5D59',
  note: '#EFEDE8',
} as const

export type ThemeName = 'paper' | 'night'

const KEY = 'recos.theme'

export function getTheme(): ThemeName {
  try {
    return localStorage.getItem(KEY) === 'night' ? 'night' : 'paper'
  } catch {
    return 'paper'
  }
}

export function setTheme(name: ThemeName) {
  document.documentElement.dataset.theme = name
  try {
    localStorage.setItem(KEY, name)
  } catch {
    // Private windows may refuse storage. The theme still applies for this visit.
  }
}
