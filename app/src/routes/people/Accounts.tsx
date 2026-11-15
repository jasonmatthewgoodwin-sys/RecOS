import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Field } from '../../components/Field'
import { HeroStat } from '../../components/HeroStat'
import { Note } from '../../components/Note'
import { PageHeader } from '../../components/PageHeader'
import { PillButton } from '../../components/PillButton'
import { Dots, EmptyLine } from '../../components/Quiet'
import { RowList, type ListItem } from '../../components/RowList'
import { TextLink } from '../../components/TextLink'
import { data, type Account, type AccountKind } from '../../lib/data'
import { twoDigits } from '../../lib/format'
import { invalidate, setQueryData, useQuery } from '../../lib/query'
import { sections } from '../../lib/sections'

// Accounts (29.3, and Jason's notes of 14 November 2026): the group's
// clients and the owner's own accounts, thin references only. Open doors
// are clients where another function hires and no colleague is in yet.
// Introduce a colleague raises a wider business lead for that company.
// The CRM stays the record; each row keeps its link.

export const ACCOUNTS_KEY = 'people.accounts'

export const kindWord: Record<AccountKind, string> = { group_client: "The group's clients", my_account: 'Your accounts' }

export function AccountsPage() {
  const tab = sections.find((s) => s.key === 'people')!
  const tabs = tab.pages.map((p) => ({ label: p.label, route: `${tab.path}/${p.slug}` }))
  return (
    <div className="flex flex-col gap-8">
      <AccountsBody title="People" tabs={tabs} kinds={['my_account', 'group_client']} />
    </div>
  )
}

type BodyProps = { title: string; tabs: { label: string; route: string }[]; kinds: AccountKind[]; header?: boolean }

export function AccountsBody({ title, tabs, kinds, header = true }: BodyProps) {
  const [params, setParams] = useSearchParams()
  const accounts = useQuery(ACCOUNTS_KEY, data.accounts)
  const [note, setNote] = useState<string | null>(null)
  const all = (accounts.data ?? []).filter((a) => kinds.includes(a.kind) && a.active)
  const cardId = params.get('card')?.startsWith('account:') ? params.get('card')!.slice(8) : null
  const adding = params.get('card') === 'account:new'
  const chosen = cardId && cardId !== 'new' ? all.find((a) => a.id === cardId) : undefined

  function setCard(v: string | null) {
    setParams((p) => {
      if (v === null) p.delete('card')
      else p.set('card', v)
      return p
    })
  }

  const openDoors = all.filter((a) => a.functions.length > 0 && !a.introducedTo).length

  const rows: ListItem[] = [...all]
    .sort((a, b) => Number(Boolean(b.functions.length && !b.introducedTo)) - Number(Boolean(a.functions.length && !a.introducedTo)) || a.company.localeCompare(b.company))
    .map((a) => ({
      id: a.id,
      section: kinds.length > 1 ? kindWord[a.kind] : undefined,
      dot: a.introducedTo ? ('solid' as const) : ('hollow' as const),
      title: a.company,
      detail: [a.contactName, a.contactTitle, a.colleague ? `with ${a.colleague}` : null].filter(Boolean).join(', '),
      meta: a.functions.map((f) => f.toUpperCase()).join(' '),
      word: a.introducedTo ? 'Introduced' : a.functions.length > 0 ? 'Open door' : undefined,
      tone: a.introducedTo ? ('clear' as const) : a.functions.length > 0 ? ('action' as const) : ('pending' as const),
      icon: 'briefcase' as const,
      onOpen: () => setCard(`account:${a.id}`),
    }))

  async function introduce(a: Account, colleague: string, split: string) {
    const before = accounts.data
    setQueryData<Account[]>(ACCOUNTS_KEY, (rows) => (rows ?? []).map((x) => (x.id === a.id ? { ...x, introducedTo: colleague } : x)))
    try {
      await data.updateAccount(a.id, { introducedTo: colleague })
      await data.addWiderLead({ company: a.company, role: null, function: a.functions[0] ?? 'other', country: 'UK', source: 'other', accountId: a.id, existingClient: a.kind === 'group_client', notes: split ? `Split: ${split}` : null, mentionedByName: a.colleague })
      invalidate('leads.wider')
      setCard(null)
    } catch {
      setQueryData<Account[]>(ACCOUNTS_KEY, () => before ?? [])
      setNote('That did not save. Try again.')
    }
  }

  async function add(values: { company: string; kind: AccountKind; colleague: string; contactName: string; contactTitle: string; functions: string; crmUrl: string }) {
    try {
      await data.addAccount({
        company: values.company.trim(),
        kind: values.kind,
        colleague: values.colleague.trim() || null,
        contactName: values.contactName.trim() || null,
        contactTitle: values.contactTitle.trim() || null,
        functions: values.functions.split(',').map((f) => f.trim().toLowerCase()).filter(Boolean),
        crmUrl: values.crmUrl.trim() || null,
      })
      invalidate(ACCOUNTS_KEY)
      setCard(null)
    } catch {
      setNote('That did not save. Try again.')
    }
  }

  return (
    <>
      {header && <PageHeader title={title} tabs={tabs} aside={<TextLink label="Add an account" icon="plus" onClick={() => setCard('account:new')} />} />}
      {header && (
        <div className="grid grid-cols-2 gap-x-8 gap-y-8">
          <HeroStat label="Open doors" value={accounts.data ? twoDigits(openDoors).text : undefined} tone={openDoors > 0 ? 'action' : undefined} icon="briefcase" />
        </div>
      )}
      {accounts.status === 'loading' ? <Dots /> : accounts.status === 'error' ? <EmptyLine text="Could not load. Try again." /> : <RowList rows={rows} emptyText="No accounts yet. Add the companies you work with, and the group's clients." limit={30} />}
      {!header && (
        <div>
          <TextLink label="Add an account" icon="plus" onClick={() => setCard('account:new')} />
        </div>
      )}
      {chosen && <AccountCard account={chosen} onIntroduce={(who, split) => void introduce(chosen, who, split)} onClose={() => setCard(null)} />}
      {adding && <AddAccountCard kinds={kinds} onAdd={(v) => void add(v)} onClose={() => setCard(null)} />}
      {note && <Note text={note} onClose={() => setNote(null)} />}
    </>
  )
}

function AccountCard({ account: a, onIntroduce, onClose }: { account: Account; onIntroduce: (who: string, split: string) => void; onClose: () => void }) {
  const [who, setWho] = useState('')
  const [split, setSplit] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <Card
      label={kindWord[a.kind]}
      title={a.company}
      tone={a.introducedTo ? 'clear' : a.functions.length > 0 ? 'action' : 'pending'}
      sections={[
        {
          body: (
            <div className="flex flex-col gap-2">
              {(a.contactName || a.contactTitle) && <p>{[a.contactName, a.contactTitle].filter(Boolean).join(', ')}</p>}
              {a.colleague && <p className="text-ink-2">Relationship held by {a.colleague}</p>}
              {a.functions.length > 0 && <p className="font-mono text-label text-ink-2">Hires in {a.functions.map((f) => f.toUpperCase()).join(' ')}</p>}
              {a.notes && <p className="text-ink-2">{a.notes}</p>}
              {a.crmUrl && <TextLink label="Open in CRM" href={a.crmUrl} icon="open" />}
            </div>
          ),
        },
        a.introducedTo
          ? { label: 'Introduced', body: <p>{a.introducedTo} is in.</p> }
          : {
              label: 'Introduce a colleague',
              body: (
                <form
                  className="flex flex-col gap-4"
                  aria-label="Introduce a colleague"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault()
                    if (!who.trim()) {
                      setProblem('Say who takes it')
                      return
                    }
                    onIntroduce(who.trim(), split.trim())
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Colleague" value={who} onChange={setWho} placeholder="A first name" error={problem ?? undefined} />
                    <Field label="Split" value={split} onChange={setSplit} placeholder="As agreed, in a few words" />
                  </div>
                  <div>
                    <PillButton label="Introduce" type="submit" kind="primary" icon="people" />
                  </div>
                </form>
              ),
            },
      ]}
      onClose={onClose}
    />
  )
}

function AddAccountCard({ kinds, onAdd, onClose }: { kinds: AccountKind[]; onAdd: (v: { company: string; kind: AccountKind; colleague: string; contactName: string; contactTitle: string; functions: string; crmUrl: string }) => void; onClose: () => void }) {
  const [v, setV] = useState({ company: '', kind: kinds[0], colleague: '', contactName: '', contactTitle: '', functions: '', crmUrl: '' })
  const [problem, setProblem] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (value: string) => setV((s) => ({ ...s, [k]: value }))
  return (
    <Card
      label="Account"
      title="Add an account"
      tone="new"
      sections={[
        {
          body: (
            <form
              className="flex flex-col gap-4"
              aria-label="Add an account"
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                if (!v.company.trim()) {
                  setProblem('The company is needed')
                  return
                }
                onAdd(v)
              }}
            >
              <Field label="Company" value={v.company} onChange={set('company')} autoFocus error={problem ?? undefined} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Which list" kind="choice" value={v.kind} onChange={(x) => setV((s) => ({ ...s, kind: x as AccountKind }))} choices={kinds.map((k) => ({ value: k, label: kindWord[k] }))} />
                <Field label="Colleague who holds it" value={v.colleague} onChange={set('colleague')} placeholder="Optional" />
                <Field label="Main contact" value={v.contactName} onChange={set('contactName')} placeholder="A name" />
                <Field label="Their title" value={v.contactTitle} onChange={set('contactTitle')} />
                <Field label="Functions that hire" value={v.functions} onChange={set('functions')} placeholder="sales, cs" />
                <Field label="CRM link" value={v.crmUrl} onChange={set('crmUrl')} placeholder="https://" />
              </div>
              <div>
                <PillButton label="Add" type="submit" kind="primary" />
              </div>
            </form>
          ),
        },
      ]}
      onClose={onClose}
    />
  )
}
