import { Link } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Gemeinsames Layout für die Rechts-/Infotexte: lesbare Spaltenbreite,
// einheitliche Typografie, dezente Hinweis-Boxen. Nutzt bestehende Design-
// System-Klassen (card/muted/bad) - kein neues Designsystem.
// ---------------------------------------------------------------------------
export default function LegalLayout({ title, intro, updated, children }) {
  return (
    <section style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="row gap-sm" style={{ marginBottom: 4 }}>
        <Link className="muted" to="/">Start</Link><span className="muted">/</span>
      </div>
      <h1 style={{ marginBottom: 6 }}>{title}</h1>
      {intro && <p className="muted" style={{ marginTop: 0 }}>{intro}</p>}
      <div className="legal-prose" style={{ lineHeight: 1.6 }}>
        {children}
      </div>
      {updated && <p className="muted" style={{ fontSize: 12, marginTop: 28 }}>Stand dieser Seite: {updated}</p>}
    </section>
  )
}
