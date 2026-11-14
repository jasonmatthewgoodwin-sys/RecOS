import type { AppSettings } from './data'

// The owner's theme and typefaces (3.6, 3.7, 32.4). Paper is the default;
// Night swaps the greys. Applied to the document root, so nothing else in
// the app knows which is on.

export const sansChoices = ['Space Grotesk', 'Inter', 'IBM Plex Sans', 'system-ui'] as const
export const monoChoices = ['Space Mono', 'IBM Plex Mono', 'JetBrains Mono', 'ui-monospace'] as const

export function applyTheme(s: Pick<AppSettings, 'theme' | 'fontSans' | 'fontMono'>) {
  const root = document.documentElement
  if (s.theme === 'night') root.dataset.theme = 'night'
  else delete root.dataset.theme
  root.style.setProperty('--font-sans', `'${s.fontSans}', ui-sans-serif, system-ui, sans-serif`)
  root.style.setProperty('--font-mono', `'${s.fontMono}', ui-monospace, 'Cascadia Mono', monospace`)
}
