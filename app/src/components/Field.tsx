import { useId } from 'react'

export type Choice = { value: string; label: string }

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  kind?: 'text' | 'date' | 'choice' | 'password' | 'lines'
  /** For kind lines: how many lines show before it scrolls. */
  rows?: number
  /** Called when the owner leaves the field. For fields that save themselves. */
  onBlur?: () => void
  /** For kind choice. An empty value shows the placeholder. */
  choices?: Choice[]
  placeholder?: string
  /** What is needed, in plain words (33.3). Shown under the field in ink-2. */
  error?: string
  autoFocus?: boolean
  /** For a password field: the browser's hint, such as new-password. */
  autoComplete?: string
}

const box =
  'min-h-10 w-full border-b bg-transparent text-body text-ink outline-none placeholder:text-ink-3 focus:border-ink aria-invalid:border-ink'

// One label, one line to type on, one hairline under it. No box inside a
// box (section 3.8). An error is a sentence under the field, never a colour.
export function Field({ label, value, onChange, kind = 'text', choices = [], placeholder, error, autoFocus, autoComplete, rows = 3, onBlur }: Props) {
  const id = useId()
  const errorId = `${id}-error`
  const shared = {
    id,
    value,
    autoFocus,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    className: `${box} ${error ? 'border-ink' : 'border-rule'}`,
  }
  return (
    <div data-field className="flex flex-col gap-2">
      <label htmlFor={id} className="label-caps text-ink-2">
        {label}
      </label>
      {kind === 'lines' ? (
        <textarea {...shared} rows={rows} placeholder={placeholder} onBlur={onBlur} className={`${shared.className} resize-none py-2 leading-relaxed`} onChange={(e) => onChange(e.target.value)} />
      ) : kind === 'choice' ? (
        <select {...shared} onBlur={onBlur} onChange={(e) => onChange(e.target.value)}>
          {placeholder !== undefined && (
            <option value="" disabled={value !== ''}>
              {placeholder}
            </option>
          )}
          {choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...shared}
          type={kind}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onBlur={onBlur}
          className={`${shared.className} ${kind === 'date' ? 'font-mono' : ''}`}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error && (
        <p id={errorId} className="text-body text-ink-2">
          {error}
        </p>
      )}
    </div>
  )
}
