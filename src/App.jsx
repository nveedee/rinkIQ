import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useData } from './DataContext.jsx'
import { useAuth } from './authContext.jsx'
import { capturePageview } from './analytics.js'
import { ToastHost } from './components/ui.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

import Dashboard from './pages/Dashboard.jsx'
import PublicDashboard from './pages/PublicDashboard.jsx'
import Standings from './pages/Standings.jsx'
import EloRanking from './pages/EloRanking.jsx'
import PowerRankings from './pages/PowerRankings.jsx'
import PlayoffOdds from './pages/PlayoffOdds.jsx'
import PublicPlayoffOdds from './pages/PublicPlayoffOdds.jsx'
import Postseason from './pages/Postseason.jsx'
import Goalies from './pages/Goalies.jsx'
import HeadToHead from './pages/HeadToHead.jsx'
import Teams from './pages/Teams.jsx'
import TeamDetail from './pages/TeamDetail.jsx'
import PlayerDetail from './pages/PlayerDetail.jsx'
import Schedule from './pages/Schedule.jsx'
import PlayerRankings from './pages/PlayerRankings.jsx'
import Topscorers from './pages/Topscorers.jsx'
import FairOdds from './pages/FairOdds.jsx'
import Settings from './pages/Settings.jsx'
import ModelPerformance from './pages/ModelPerformance.jsx'
import Backtesting from './pages/Backtesting.jsx'
import FanAnalytics from './pages/FanAnalytics.jsx'
import MatchupDetail from './pages/MatchupDetail.jsx'
import Login from './pages/Login.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import SystemStatus from './pages/admin/SystemStatus.jsx'
import Impressum from './pages/legal/Impressum.jsx'
import Datenschutz from './pages/legal/Datenschutz.jsx'
import Nutzungsbedingungen from './pages/legal/Nutzungsbedingungen.jsx'
import QuellenMethodik from './pages/legal/QuellenMethodik.jsx'
import SyncStatus from './components/SyncStatus.jsx'
import Footer from './components/Footer.jsx'
// DEV-ONLY: Live-Replay-Testseite (siehe DevLiveReplay.jsx-Kopfkommentar) -
// lazy() statt statischem import, damit Vite die Komponente in einen EIGENEN
// Chunk auslagert, der im Produktions-Build nie angefordert wird.
const DevLiveReplay = import.meta.env.DEV ? lazy(() => import('./pages/DevLiveReplay.jsx')) : null

// ---------------------------------------------------------------------------
// Navigation. Die ADMIN-Navigation entspricht der bisherigen vollständigen
// Navigation (alle Analyse-/Verwaltungsseiten); die PUBLIC-Navigation zeigt
// nur die öffentlich freigegebenen (stabilen) Bereiche (siehe featureConfig.js).
// ---------------------------------------------------------------------------
const publicNav = [
  { to: '/', label: 'Start', end: true },
  { to: '/standings', label: 'Tabelle' },
  { to: '/schedule', label: 'Spielplan' },
  { to: '/playoff-odds', label: 'Playoff Odds' },
  { to: '/elo', label: 'ELO' },
  { to: '/power', label: 'Power Ranking' },
  { to: '/players', label: 'Spieler' },
  { to: '/topscorers', label: 'Topscorers' },
  { to: '/goalies', label: 'Torhüter' },
  { to: '/teams', label: 'Teams' },
  { to: '/head-to-head', label: 'H2H' },
]

const adminPrimaryNav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/standings', label: 'Tabelle' },
  { to: '/schedule', label: 'Spielplan' },
  { to: '/fan-analytics', label: 'Fan Analytics' },
  { to: '/elo', label: 'ELO' },
  { to: '/power', label: 'Power Ranking' },
  { to: '/playoff-odds', label: 'Playoff Odds' },
  { to: '/postseason', label: 'Postseason Paths' },
  { to: '/players', label: 'Spieler' },
  { to: '/topscorers', label: 'Topscorers' },
  { to: '/fair-odds', label: 'Faire Quoten' },
  { to: '/goalies', label: 'Torhüter' },
  { to: '/head-to-head', label: 'H2H' },
]

// Verwaltung/technische Bereiche (nur Admin): eigenes Dropdown.
const adminSecondaryNav = [
  { to: '/admin', label: 'Admin-Dashboard' },
  { to: '/admin/system', label: 'System & Sync' },
  { to: '/teams', label: 'Teams & Kader' },
  { to: '/model-performance', label: 'Modell' },
  { to: '/backtesting', label: 'Backtest' },
  { to: '/settings', label: 'Einstellungen' },
]

function NavMore() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const location = useLocation()
  const isActive = adminSecondaryNav.some((it) => location.pathname === it.to || location.pathname.startsWith(it.to + '/'))

  useEffect(() => { setOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="nav-more" ref={ref}>
      <button className={'nav-more-trigger' + (isActive ? ' active' : '')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Verwalten <span className="car">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="nav-more-menu">
          {adminSecondaryNav.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.to === '/admin'} className={({ isActive: linkActive }) => (linkActive ? 'active' : '')}>
              {it.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

// Misst die TATSÄCHLICHE Header-Höhe (inkl. iOS-Safe-Area) als CSS-Variable,
// damit sticky Sub-Tabs exakt darunter andocken.
function useHeaderHeight() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--header-actual-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return ref
}

// Login/Logout-Steuerung im Header.
function AuthControls() {
  const { isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  if (isAdmin) {
    return (
      <button
        className="btn ghost sm"
        style={{ flex: 'none', padding: '5px 10px' }}
        onClick={async () => { await logout(); navigate('/') }}
      >
        Abmelden
      </button>
    )
  }
  return (
    <NavLink to="/login" className="btn ghost sm" style={{ flex: 'none', padding: '5px 10px' }}>
      Admin-Login
    </NavLink>
  )
}

// Schützt Admin-Routen clientseitig (echte Absicherung erfolgt serverseitig).
function RequireAdmin({ children }) {
  const { isAdmin } = useAuth()
  const location = useLocation()
  if (!isAdmin) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}

function AppRoutes() {
  const { isAdmin } = useAuth()
  const location = useLocation()
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Routes>
        {/* Start: Admin sieht das volle Dashboard, Besucher die Public-Startseite */}
        <Route path="/" element={isAdmin ? <Dashboard /> : <PublicDashboard />} />

        {/* Öffentlich freigegebene, von beiden Editionen geteilte Seiten */}
        <Route path="/standings" element={<Standings />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/elo" element={<EloRanking />} />
        <Route path="/power" element={<PowerRankings />} />
        <Route path="/goalies" element={<Goalies />} />
        <Route path="/head-to-head" element={<HeadToHead />} />
        <Route path="/players" element={<PlayerRankings />} />
        <Route path="/topscorers" element={<Topscorers />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/:id" element={<TeamDetail />} />
        <Route path="/players/:id" element={<PlayerDetail />} />
        <Route path="/matchup/:gameId" element={<MatchupDetail />} />

        {/* Playoff Odds: Besucher sehen den gespeicherten Snapshot, der Admin
            die volle interaktive Season-Projection (What-if/Locks/Swing). */}
        <Route path="/playoff-odds" element={isAdmin ? <PlayoffOdds /> : <PublicPlayoffOdds />} />

        {/* /games ist in /schedule aufgegangen - Redirect für alte Links */}
        <Route path="/games" element={<Navigate to="/schedule" replace />} />

        {/* Rechts-/Infotexte: immer öffentlich, ohne Anmeldung erreichbar */}
        <Route path="/impressum" element={<Impressum />} />
        <Route path="/datenschutz" element={<Datenschutz />} />
        <Route path="/nutzungsbedingungen" element={<Nutzungsbedingungen />} />
        <Route path="/quellen-methodik" element={<QuellenMethodik />} />

        {/* Nur Admin (experimentell / teure Rechnung / Verwaltung) */}
        <Route path="/fair-odds" element={<RequireAdmin><FairOdds /></RequireAdmin>} />
        <Route path="/fan-analytics" element={<RequireAdmin><FanAnalytics /></RequireAdmin>} />
        <Route path="/postseason" element={<RequireAdmin><Postseason /></RequireAdmin>} />
        <Route path="/model-performance" element={<RequireAdmin><ModelPerformance /></RequireAdmin>} />
        <Route path="/backtesting" element={<RequireAdmin><Backtesting /></RequireAdmin>} />
        <Route path="/settings" element={<RequireAdmin><Settings /></RequireAdmin>} />
        <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="/admin/system" element={<RequireAdmin><SystemStatus /></RequireAdmin>} />

        {import.meta.env.DEV && (
          <Route path="/dev/live-replay" element={<Suspense fallback={<div className="muted">Lädt…</div>}><DevLiveReplay /></Suspense>} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}

function AppShell() {
  const { loading, error, data } = useData()
  const { isAdmin } = useAuth()
  const headerRef = useHeaderHeight()
  const nav = isAdmin ? adminPrimaryNav : publicNav

  return (
    <div className="app">
      <header className="topbar" ref={headerRef}>
        <div className="topbar-inner">
          <div className="brand">
            <img className="mark" src="/rinkiq-logo.png" alt="RinkIQ" />
            <div className="name-block">
              <span>RinkIQ{isAdmin ? ' · Admin' : ''}</span>
              <span className="season">{data?.settings?.seasonName || 'Saison 2026/27'}</span>
            </div>
          </div>
          <nav className="nav">
            {nav.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end}
                className={({ isActive }) => (isActive ? 'active' : '')}>
                {it.label}
              </NavLink>
            ))}
          </nav>
          {isAdmin && <NavMore />}
          {isAdmin && !loading && !error && <SyncStatus />}
          <AuthControls />
        </div>
      </header>

      <main className="main">
        {loading && <div className="muted">Lädt…</div>}
        {error && (
          <div className="card card-pad" style={{ borderColor: '#ef444455' }}>
            <strong className="bad">Daten konnten nicht geladen werden.</strong>
            <div className="muted mt">
              Bitte die Seite neu laden. Besteht das Problem weiterhin, sind die
              Daten momentan nicht verfügbar.
              <br />Details: {error}
            </div>
          </div>
        )}
        {!loading && !error && <AppRoutes />}
      </main>
      <Footer />
      <ToastHost />
    </div>
  )
}

// Ein Pageview pro (clientseitiger) Navigation - manuell, da capture_pageview
// in PostHog deaktiviert ist (vermeidet Doppel-Pageviews). No-Op ohne Analytics.
function usePageviews() {
  const location = useLocation()
  useEffect(() => {
    capturePageview()
  }, [location.pathname, location.search])
}

export default function App() {
  usePageviews()
  const { authReady } = useAuth()
  if (!authReady) {
    return <div className="app"><main className="main"><div className="muted">Lädt…</div></main></div>
  }
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<AppShell />} />
    </Routes>
  )
}
