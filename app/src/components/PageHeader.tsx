import { IndexTabs } from './IndexTab'

type Props = { title: string; tabs?: { label: string; route: string }[] }

export function PageHeader({ title, tabs = [] }: Props) {
  return (
    <header className="flex flex-col gap-8">
      <h1 className="text-title text-ink">{title}</h1>
      <IndexTabs tabs={tabs} />
    </header>
  )
}
