import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Deck } from '../../components/Deck'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { Dots, EmptyLine } from '../../components/Quiet'
import { TextLink } from '../../components/TextLink'
import { data, type AStarSuggestion } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { cityName } from '../../lib/leads'
import { usePeopleTabs } from '../../lib/peopleTabs'

// People, A-star (31.1): suggestions from the weekly feed, one at a time,
// with two controls only: Good and Not good. Good makes the person and
// puts them in the A-star half of the league at League One.

const KEY = 'people.aStar'

export function AStar() {
  const navigate = useNavigate()
  const suggestions = useQuery(KEY, data.aStarSuggestions)
  const [deck, setDeck] = useState<AStarSuggestion[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const { tabs } = usePeopleTabs()

  useEffect(() => {
    if (deck === null && suggestions.status === 'ready' && suggestions.data) setDeck(suggestions.data)
  }, [deck, suggestions.status, suggestions.data])

  async function verdict(s: AStarSuggestion, v: 'good' | 'not_good') {
    const before = suggestions.data
    setQueryData<AStarSuggestion[]>(KEY, (rows) => (rows ?? []).filter((x) => x.id !== s.id))
    try {
      await data.aStarVerdict(s.id, v)
      invalidate('people.members')
      invalidate('home')
    } catch {
      setQueryData<AStarSuggestion[]>(KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  const waiting = suggestions.data?.length ?? 0

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="People" tabs={tabs} />
      <div className="grid grid-cols-2 gap-x-8 gap-y-8">
        <HeroStat label="To review" value={suggestions.data ? twoDigits(waiting).text : undefined} tone={waiting > 0 ? 'new' : undefined} icon="sparkle" />
      </div>
      {deck === null ? (
        suggestions.status === 'error' ? <EmptyLine text="Could not load. Try again." /> : <Dots />
      ) : deck.length === 0 ? (
        <div className="flex flex-col gap-4">
          <EmptyLine text="No suggestions waiting. The feed arrives weekly." />
          <div>
            <TextLink label="See the Top candidates list" icon="people" onClick={() => navigate('/people/top-candidates')} />
          </div>
        </div>
      ) : (
        <Deck
          items={deck}
          renderItem={(s) => (
            <div className="flex flex-col gap-3">
              <p className="label-caps text-ink-2">Week of {s.week}</p>
              <h2 className="text-title text-ink">{s.name}</h2>
              <p className="text-body text-ink-2">{[s.title, s.company, s.city ? cityName(s.city) : null].filter(Boolean).join(', ')}</p>
              {s.why && <p className="max-w-prose text-body text-ink">{s.why}</p>}
            </div>
          )}
          primaryAction={{ label: () => 'Good', onClick: (s) => void verdict(s, 'good') }}
          extraActions={() => [{ label: 'Not good', onClick: (s) => void verdict(s, 'not_good') }]}
          links={(s) => s.linkedinUrl && <TextLink label="Open profile" href={s.linkedinUrl} icon="open" />}
          tone={() => 'new'}
          emptyText="All reviewed"
        />
      )}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </div>
  )
}
