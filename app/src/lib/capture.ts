import type { Tone } from '../theme/tokens'
import type { IconName } from '../components/Icon'

// Quick capture (25.7): five choices, each two or three fields. Pure
// definitions; the data layer does the writes.

export type CaptureKind = 'referral' | 'follow_up' | 'idea' | 'job_lead' | 'number'

export type CaptureField = { key: string; label: string; kind?: 'text' | 'date' | 'choice' | 'lines'; choices?: { value: string; label: string }[]; placeholder?: string; required?: boolean }

export const captureKinds: { kind: CaptureKind; label: string; icon: IconName; tone: Tone; fields: CaptureField[] }[] = [
  {
    kind: 'referral',
    label: 'Referral',
    icon: 'people',
    tone: 'new',
    fields: [
      { key: 'referredName', label: 'Who', required: true, placeholder: 'Their name' },
      { key: 'referredCompany', label: 'Company' },
      { key: 'referredBy', label: 'Named by', required: true, placeholder: 'Who told you' },
    ],
  },
  {
    kind: 'follow_up',
    label: 'Follow-up',
    icon: 'clock',
    tone: 'action',
    fields: [
      { key: 'personName', label: 'Who', required: true },
      { key: 'reason', label: 'What you owe them', required: true },
      { key: 'dueOn', label: 'By', kind: 'date', required: true },
    ],
  },
  {
    kind: 'idea',
    label: 'Idea',
    icon: 'sparkle',
    tone: 'pending',
    fields: [
      { key: 'title', label: 'The idea', required: true },
      { key: 'why', label: 'Why it matters', kind: 'lines' },
    ],
  },
  {
    kind: 'job_lead',
    label: 'Job lead',
    icon: 'briefcase',
    tone: 'new',
    fields: [
      { key: 'company', label: 'Company', required: true },
      { key: 'role', label: 'Role', required: true },
      { key: 'sourceUrl', label: 'Link', placeholder: 'Where you saw it' },
    ],
  },
  {
    kind: 'number',
    label: 'Number',
    icon: 'numbers',
    tone: 'clear',
    fields: [
      {
        key: 'kpi',
        label: 'Which',
        kind: 'choice',
        required: true,
        choices: [
          { value: 'posts_chased', label: 'Job posts chased' },
          { value: 'coaching_calls', label: 'Coaching calls' },
          { value: 'linkedin_posts', label: 'LinkedIn posts' },
          { value: 'new_a_star', label: 'New A-star candidates' },
          { value: 'client_meetings', label: 'Client meetings' },
        ],
      },
      { key: 'amount', label: 'How many', required: true, placeholder: '1, or -1 to take one off' },
      { key: 'reason', label: 'Why', required: true },
    ],
  },
]

/** The field that is missing or wrong, in plain words, or null when all is well. */
export function captureProblem(kind: CaptureKind, values: Record<string, string>): { key: string; message: string } | null {
  const def = captureKinds.find((k) => k.kind === kind)!
  for (const f of def.fields) {
    if (f.required && !(values[f.key] ?? '').trim()) return { key: f.key, message: `${f.label} is needed.` }
  }
  if (kind === 'number') {
    const n = Number(values.amount)
    if (!Number.isInteger(n) || n === 0) return { key: 'amount', message: 'A whole number, not zero.' }
  }
  if (kind === 'follow_up' && !/^\d{4}-\d{2}-\d{2}$/.test(values.dueOn ?? '')) return { key: 'dueOn', message: 'A date is needed.' }
  return null
}

/** Search (25.7): what a result points at. */
export type SearchHit = { kind: 'person' | 'job_lead' | 'referral' | 'follow_up'; id: string; title: string; detail: string | null; route: string }

export const searchGroupWord: Record<SearchHit['kind'], string> = { person: 'People', job_lead: 'Job leads', referral: 'Referrals', follow_up: 'Follow-ups' }
