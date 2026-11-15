// Pure helpers for the send engine's screens (12.5, 15.6, 20.4, 32.4):
// the variables a template may use, a preview with sample values, and the
// Outlook compose link for a draft. No data access here.

import type { SendLogRow, Template } from './data'

/** 20.4: the only variables a template may use. */
export const SEND_VARIABLES = [
  'first_name',
  'company',
  'role',
  'client',
  'call_day',
  'next_step',
  'interview_time',
  'my_first_name',
  'week_date',
  'kpi_lines',
  'output_line',
  'followup_line',
  'learned_block',
  'plan_block',
] as const

/** Invented values for the preview in Settings, Templates. */
export const sampleValues: Record<string, string> = {
  first_name: 'Ada',
  company: 'Northwind Sample Co',
  role: 'Head of Product Marketing',
  client: 'Contoso Demo Inc',
  call_day: 'Tuesday',
  next_step: 'I will send the brief on Monday.',
  interview_time: '10:00 on Thursday, New York time',
  my_first_name: 'Jason',
  week_date: '16 November',
  kpi_lines: 'Posts chased 22/20 HIT\nCoaching calls 5/5 HIT',
  output_line: 'One placement agreed, two shortlists out.',
  followup_line: '14 of 15 follow-ups on time.',
  learned_block: 'The Boston clients move faster when the brief names the first 90 days.',
  plan_block: 'Two client calls, one event, the Northwind close.',
}

/** The {{variables}} a text uses, in order of first appearance. */
export function variablesIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

/** Variables the engine does not know (TPL-2). */
export function unknownVariables(text: string): string[] {
  return variablesIn(text).filter((v) => !(SEND_VARIABLES as readonly string[]).includes(v))
}

export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, k: string) => values[k] ?? whole)
}

/** One word for where a template stands (32.4): Approved, Needs approval or Superseded. */
export function templateWord(t: Template): 'Approved' | 'Needs approval' | 'Superseded' {
  if (!t.active) return 'Superseded'
  return t.approved ? 'Approved' : 'Needs approval'
}

/** TPL-3: a connection note is 300 characters at most. */
export function tooLong(t: Pick<Template, 'type' | 'body'>): boolean {
  return t.type === 'linkedin_connect' && t.body.length > 300
}

/** The Outlook on the web compose link. Nothing is sent by opening it. */
export function composeLink(to: string | null, subject: string | null, body: string | null): string {
  const q = new URLSearchParams()
  if (to) q.set('to', to)
  if (subject) q.set('subject', subject)
  if (body) q.set('body', body)
  return `https://outlook.office.com/mail/deeplink/compose?${q.toString()}`
}

export const outcomeWord: Record<SendLogRow['outcome'], string> = {
  queued: 'Queued',
  sent: 'Sent',
  failed: 'Failed',
  held: 'Held',
  skipped: 'Left as a draft',
  cancelled: 'Cancelled',
}

/** One line of the send log, in plain words. */
export function logLine(row: SendLogRow, typeLabel: string): string {
  const when = row.loggedAt.slice(5, 10).split('-').reverse().join('/') + ' ' + row.loggedAt.slice(11, 16)
  const auto = row.detail === 'Auto' ? ' (Auto)' : row.detail === 'manual' ? ' (by hand)' : ''
  return `${when}  ${typeLabel} to ${row.toName}: ${outcomeWord[row.outcome]}${auto}`
}
