import { PageHeader } from '../components/PageHeader'
import { EmptyLine } from '../components/Quiet'
import type { Section } from '../lib/sections'

// The page frame for a section that is not built yet. It shows the title,
// the index tabs and one quiet line, so the shell can be walked end to end.
export function SectionPage({ section }: { section: Section }) {
  const tabs = section.pages.map((p) => ({ label: p.label, route: `${section.path}/${p.slug}` }))
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={section.label} tabs={tabs} />
      <EmptyLine text={`Not built yet. Arrives in ${section.arrives}.`} />
    </div>
  )
}
