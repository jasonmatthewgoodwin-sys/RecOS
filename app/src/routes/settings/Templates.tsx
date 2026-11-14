import { PageHeader } from '../../components/PageHeader'
import { EmptyLine } from '../../components/Quiet'
import { settings } from '../../lib/sections'

// Settings, Templates (32.4). The templates table and the approval rules
// arrive with the send engine (P1-29), so this page says so until then.
export function Templates() {
  const tabs = settings.pages.map((p) => ({ label: p.label, route: `${settings.path}/${p.slug}` }))
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={settings.label} tabs={tabs} />
      <EmptyLine text="Templates arrive with the send engine. Until then every message is written by hand" />
    </div>
  )
}
