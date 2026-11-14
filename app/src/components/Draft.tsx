import { useId } from 'react'
import { TextLink } from './TextLink'

type Props = {
  text: string
  /** What the agent wrote. Editing keeps it; Reset restores it (INBX-3). */
  original?: string
  onChange: (text: string) => void
  label?: string
}

// A draft in a plain outlined box, editable on click (section 27.2). When the
// text differs from the original a quiet Reset link appears.
export function Draft({ text, original, onChange, label = 'Draft' }: Props) {
  const id = useId()
  const edited = original !== undefined && text !== original
  const rows = Math.max(3, text.split('\n').length + 1)
  return (
    <div data-draft-box data-edited={edited || undefined} className="flex flex-col gap-2">
      <div className="flex min-h-10 items-center justify-between">
        <label htmlFor={id} className="label-caps text-ink-2">
          {label}
        </label>
        {edited && <TextLink label="Reset" onClick={() => onChange(original)} />}
      </div>
      <textarea
        id={id}
        data-draft
        value={text}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-card border border-ink bg-transparent px-4 py-3 text-body text-ink"
      />
    </div>
  )
}
