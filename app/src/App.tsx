import { useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Dots } from './components/Quiet'
import { FileTabs, Paper, Sheet } from './components/Shell'
import { AuthProvider, useAuth, type Session } from './lib/auth'
import { data } from './lib/data'
import { useTabKeys } from './lib/keyboard'
import { useQuery } from './lib/query'
import { applyTheme } from './lib/theme'
import { landing, sectionFor, sections, settings, visibleSections, type Section } from './lib/sections'
import { Gallery } from './routes/gallery/Gallery'
import { Home } from './routes/home/Home'
import { Inbox } from './routes/inbox/Inbox'
import { Quarter } from './routes/numbers/Quarter'
import { Review } from './routes/numbers/Review'
import { ThisWeek } from './routes/numbers/ThisWeek'
import { FollowUps } from './routes/leads/FollowUps'
import { Jobs } from './routes/leads/Jobs'
import { Referrals } from './routes/leads/Referrals'
import { Wider } from './routes/leads/Wider'
import { Coaching } from './routes/people/Coaching'
import { PeopleList } from './routes/people/PeopleList'
import { Signals } from './routes/people/Signals'
import { SectionPage } from './routes/SectionPage'
import { Agents } from './routes/settings/Agents'
import { Data } from './routes/settings/Data'
import { Profile } from './routes/settings/Profile'
import { SendRules } from './routes/settings/SendRules'
import { Targets } from './routes/settings/Targets'
import { Templates } from './routes/settings/Templates'
import { SignIn } from './routes/SignIn'

// The index pages built so far. Anything else shows the SectionPage placeholder.
function builtPages(session: Session): Record<string, ReactNode> {
  return {
    'leads/jobs': <Jobs />,
    'leads/follow-ups': <FollowUps />,
    'leads/referrals': <Referrals />,
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
  }
}

function sectionRoutes(section: Section, built: Record<string, ReactNode>) {
  if (section.pages.length === 0) {
    return <Route key={section.key} path={`${section.path}/*`} element={<SectionPage section={section} />} />
  }
  return (
    <Route key={section.key} path={section.path}>
      <Route index element={<Navigate to={landing(section)} replace />} />
      {section.pages
        .filter((p) => built[`${section.key}/${p.slug}`])
        .map((p) => (
          <Route key={p.slug} path={p.slug} element={built[`${section.key}/${p.slug}`]} />
        ))}
      <Route path="*" element={<SectionPage section={section} />} />
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

  const start = owner ? '/home' : '/numbers/this-week'
  const allowed = owner ? [...sections, settings] : tabs
  const built = builtPages(session)

  return (
    <>
      <FileTabs tabs={tabs} dots={dots} showSettings={owner} />
      <Sheet fadeKey={sectionFor(pathname)?.key}>
        <Routes>
          {owner && <Route path="/home" element={<Home firstName={session.firstName} />} />}
          {owner && <Route path="/settings/profile" element={<Profile />} />}
          {owner && <Route path="/inbox" element={<Inbox />} />}
          {allowed.filter((s) => s.key !== 'home').map((s) => sectionRoutes(s, built))}
          {import.meta.env.DEV && <Route path="/gallery" element={<Gallery />} />}
          <Route path="*" element={<Navigate to={start} replace />} />
        </Routes>
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
