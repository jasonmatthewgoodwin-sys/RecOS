import { useSearchParams } from 'react-router-dom'
import { isTone, toneOrder, useStatusCounts } from '../lib/status'
import { orbClass, toneWord } from '../lib/tone'

// The colour key and the status filter in one line, at the top right of the
// tabs (14 November 2026). A click narrows the page's gallery to one state;
// the choice lives in the query string, so the back button undoes it.
export function StatusFilter() {
  const counts = useStatusCounts()
  const [params, setParams] = useSearchParams()
  const status = isTone(params.get('status')) ? params.get('status') : null
  const present = toneOrder.filter((t) => (counts[t] ?? 0) > 0)
  if (present.length === 0) return null

  function choose(t: string | null) {
    setParams(
      (p) => {
        if (t === null || t === status) p.delete('status')
        else p.set('status', t)
        return p
      },
      { replace: true },
    )
  }

  return (
    <nav aria-label="Status" className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <button
        type="button"
        aria-label="Status: all"
        aria-current={status === null || undefined}
        onClick={() => choose(null)}
        className={`min-h-8 font-mono text-label ${status === null ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`}
      >
        All {counts.all ?? 0}
      </button>
      {present.map((t) => (
        <button
          key={t}
          type="button"
          aria-label={`Status: ${toneWord[t]}`}
          aria-current={status === t || undefined}
          onClick={() => choose(t)}
          className={`flex min-h-8 items-center gap-2 font-mono text-label ${status === t ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`}
        >
          <span aria-hidden className={`block size-3 rounded-pill ${orbClass[t]}`} />
          {toneWord[t]} {counts[t]}
        </button>
      ))}
    </nav>
  )
}
