import { NavLink } from 'react-router-dom'
import { LEGAL_PAGES } from '../legalPages.js'

// Globaler Footer: Rechts-/Infolinks (immer ohne Anmeldung erreichbar) plus ein
// kurzer, sachlicher Unabhängigkeits-/Prognosehinweis.
export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <nav className="site-footer-nav">
          {LEGAL_PAGES.map((p) => (
            <NavLink key={p.path} to={p.path} className={({ isActive }) => (isActive ? 'active' : '')}>
              {p.label}
            </NavLink>
          ))}
        </nav>
        <div className="muted site-footer-note">
          RinkIQ ist ein unabhängiges, inoffizielles Projekt – kein offizielles
          Angebot der National League oder SIHF. Prognosen und Quoten sind
          modellbasierte Schätzungen ohne Ergebnisgarantie.
        </div>
        <div className="muted" style={{ fontSize: 11 }}>© {year} RinkIQ</div>
      </div>
    </footer>
  )
}
