import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Capture } from './components/Capture'
import { PhoneGate } from './components/PhoneGate'
import { Report } from './components/Report'
import { Search } from './components/Search'
import { Dots } from './components/Quiet'
import { FileTabs, Paper, Sheet } from './components/Shell'
import { AuthProvider, useAuth, type Session } from './lib/auth'
import { data } from './lib/data'
import { isTyping, useTabKeys } from './lib/keyboard'
import { useQuery } from './lib/query'
import { applyTheme } from './lib/theme'
import { landing, sectionFor, sections, settings, visibleSections, type Section } from './lib/sections'
import { Gallery } from './routes/gallery/Gallery'
import { Calendar } from './routes/content/Calendar'
import { Drafts } from './routes/content/Drafts'
import { Events } from './routes/content/Events'
import { Home } from './routes/home/Home'
import { Inbox } from './routes/inbox/Inbox'
import { Quarter } from './routes/numbers/Quarter'
import { Review } from './routes/numbers/Review'
import { ThisWeek } from './routes/numbers/ThisWeek'
import { FollowUps } from './routes/leads/FollowUps'
import { Jobs } from './routes/leads/Jobs'
import { UkToUs } from './routes/leads/UkToUs'
import { AccountsPage } from './routes/people/Accounts'
import { Referrals } from './routes/leads/Referrals'
import { Wider } from './routes/leads/Wider'
import { Coaching } from './routes/people/Coaching'
import { PeopleList, PeopleListByKey } from './routes/people/PeopleList'
import { Signals } from './routes/people/Signals'
import { SectionPage } from './routes/SectionPage'
import { Agents } from './routes/settings/Agents'
import { Data } from './routes/settings/Data'
import { Problems } from './routes/settings/Problems'
import { Profile } from './routes/settings/Profile'
import { SendRules } from './routes/settings/SendRules'
import { Targets } from './routes/settings/Targets'
import { Templates } from './routes/settings/Templates'
import { SignIn } from './routes/SignIn'

// The index pages built so far. Anything else shows the SectionPage placeholder.
function builtPages(session: Session): Record<string, ReactNode> {
  return {
    'content/calendar': <Calendar />,
    'content/drafts': <Drafts />,
    'content/events': <Events />,
    'leads/jobs': <Jobs />,
    'leads/follow-ups': <FollowUps />,
    'leads/referrals': <Referrals />,
    'leads/uk-us': <UkToUs />,
    'people/accounts': <AccountsPage />,
    'leads/wider': <Wider />,
    'people/coaching': <Coaching />,
    'people/senior-network': <PeopleList listKey="senior_network" />,
    'people/top-candidates': <PeopleList listKey="top_candidates" />,
    'people/signals': <Signals />,
    'numbers/this-week': <ThisWeek role={session.role} />,
    'numbers/quarter': <Quarter />,
    'numbers/review': <Review role={session.role} />,
    'settings/agents': <Agents />,
    'settings/send-rules': <SendRules />,
    'settings/targets': <Targets />,
    'settings/templates': <Templates />,
    'settings/data': <Data />,
    'settings/problems': <Problems me={session.firstName} />,
  }
}

function firstBuilt(section: Section, built: Record<string, ReactNode>): string | undefined {
  const page = section.pages.find((p) => built[`${section.key}/${p.slug}`])
  return page ? `${section.path}/${page.slug}` : undefined
}

function sectionRoutes(section: Section, built: Record<string, ReactNode>) {
  if (section.key === 'events') {
    return <Route key={section.key} path={`${section.path}/*`} element={<Navigate to="/content/events" replace />} />
  }
  if (section.pages.length === 0) {
    return <Route key={section.key} path={`${section.path}/*`} element={<PhoneGate title={section.label}><SectionPage section={section} /></PhoneGate>} />
  }
  return (
    <Route key={section.key} path={section.path}>
      <Route index element={<Navigate to={firstBuilt(section, built) ?? landing(section)} replace />} />
      {section.pages
        .filter((p) => built[`${section.key}/${p.slug}`])
        .map((p) => (
          <Route key={p.slug} path={p.slug} element={<PhoneGate title={section.label}>{built[`${section.key}/${p.slug}`]}</PhoneGate>} />
        ))}
      {section.key === 'people' && <Route path=":listKey" element={<PhoneGate title={section.label}><PeopleListByKey /></PhoneGate>} />}
      <Route path="*" element={<PhoneGate title={section.label}><SectionPage section={section} /></PhoneGate>} />
    </Route>
  )
}

export function SignedIn({ session }: { session: Session }) {
  const { pathname } = useLocation()
  const tabs = visibleSections(session.role)
  const owner = session.role === 'owner'
  useTabKeys(tabs)

  // Dots for Inbox and Leads share the Home counts (HOME-5). Fetched once on
  // load and again after any action that could change them.
  const needsYou = useQuery('home.needsYou', data.needsYou)
  const followUps = useQuery('home.followUps', data.followUpsDue)
  const dots: Record<string, boolean> = owner ? { inbox: (needsYou.data ?? 0) > 0, leads: (followUps.data?.due ?? 0) > 0 } : {}

  // The owner's theme and typefaces (32.4), read once and applied to the root.
  const prefs = useQuery('settings.app', data.appSettings)
  useEffect(() => {
    if (owner && prefs.data) applyTheme(prefs.data)
  }, [owner, prefs.data])

  // Search and quick capture (25.7): windows in the centre, by key or by the icons on the tab row.
  const [window_, setWindow] = useState<'search' | 'capture' | 'report' | null>(null)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || window_ !== null) return
      if (e.key === '/') {
        e.preventDefault()
        setWindow('search')
      }
      if (e.key === 'c' && owner) setWindow('capture')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [owner, window_])

  const start = owner ? '/home' : '/numbers/this-week'
  const allowed = owner ? [...sections, settings] : tabs
  const built = builtPages(session)

  return (
    <>
      <FileTabs tabs={tabs} dots={dots} showSettings={owner} onSearch={() => setWindow('search')} onCapture={owner ? () => setWindow('capture') : undefined} onReport={owner ? () => setWindow('report') : undefined} />
      <Sheet fadeKey={sectionFor(pathname)?.key}>
        <Routes>
          {owner && <Route path="/home" element={<Home firstName={session.firstName} />} />}
          {owner && <Route path="/settings/profile" element={<PhoneGate title="Settings"><Profile /></PhoneGate>} />}
          {owner && <Route path="/inbox" element={<Inbox />} />}
          {owner && <Route path="/leads/follow-ups" element={<FollowUps />} />}
          {allowed.filter((s) => s.key !== 'home').map((s) => sectionRoutes(s, built))}
          {import.meta.env.DEV && <Route path="/gallery" element={<Gallery />} />}
          <Route path="*" element={<Navigate to={start} replace />} />
        </Routes>
        {window_ === 'search' && <Search onClose={() => setWindow(null)} />}
        {window_ === 'capture' && <Capture onClose={() => setWindow(null)} />}
        {window_ === 'report' && <Report reporter={session.firstName} onClose={() => setWindow(null)} />}
      </Sheet>
    </>
  )
}

function Gate() {
  const { state } = useAuth()
  if (state.status === 'loading') {
    return (
      <Sheet>
        <Dots />
      </Sheet>
    )
  }
  if (state.status === 'signed-out') {
    return (
      <Sheet>
        <SignIn problem={state.problem} />
      </Sheet>
    )
  }
  return <SignedIn session={state.session} />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Paper>
          <Gate />
        </Paper>
      </AuthProvider>
    </BrowserRouter>
  )
}
