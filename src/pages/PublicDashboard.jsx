import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../DataContext.jsx'
import { api } from '../api.js'

// ---------------------------------------------------------------------------
// Öffentliche Startseite (Public Edition). Bewusst schlank und robust: nutzt
// nur gesicherte Spieldaten (keine teuren Simulationen beim Laden) und
// kennzeichnet den Datenstand klar. Verlinkt in die freigegebenen Bereiche.
// ---------------------------------------------------------------------------
function fmtDate(iso) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' }) } catch { return '' }
}
function fmtStand(iso) {
  if (!iso) return null
  try { return new Date(iso).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return null }
}

export default function PublicDashboard() {
  const { data, teamById } = useData()
  const [stand, setStand] = useState(null)

  useEffect(() => {
    api.getPublicStatus().then((s) => setStand(s?.lastSuccessAt || null)).catch(() => {})
  }, [])

  const games = data?.games || []
  const name = (id) => { const t = teamById?.(id); return t?.short || t?.name || '?' }

  const results = games
    .filter((g) => g.status === 'final')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 6)

  const upcoming = games
    .filter((g) => g.status === 'scheduled')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 6)

  const standLabel = fmtStand(stand)

  return (
    <section>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ marginBottom: 4 }}>{data?.settings?.seasonName || 'National League 2026/27'}</h1>
        <div className="muted">
          Analysen, Tabelle, Spielplan und Prognosen zur Schweizer National League.
          {standLabel && <> · Letzte Aktualisierung: <strong>{standLabel}</strong></>}
        </div>
      </div>

      <div className="grid-2" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div className="card card-pad">
          <h2 style={{ marginTop: 0 }}>Letzte Resultate</h2>
          {results.length === 0 && <div className="muted">Noch keine gespielten Partien.</div>}
          {results.map((g) => (
            <Link key={g.id} to={`/matchup/${g.id}`} className="row-link" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border, #8882)' }}>
              <span className="muted" style={{ minWidth: 42 }}>{fmtDate(g.date)}</span>
              <span style={{ flex: 1 }}>{name(g.homeTeamId)} – {name(g.awayTeamId)}</span>
              <strong>{g.homeGoals}:{g.awayGoals}{g.decision && g.decision !== 'REG' ? ` (${g.decision})` : ''}</strong>
            </Link>
          ))}
        </div>

        <div className="card card-pad">
          <h2 style={{ marginTop: 0 }}>Nächste Spiele</h2>
          {upcoming.length === 0 && <div className="muted">Keine angesetzten Partien.</div>}
          {upcoming.map((g) => (
            <Link key={g.id} to={`/matchup/${g.id}`} className="row-link" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border, #8882)' }}>
              <span className="muted" style={{ minWidth: 42 }}>{fmtDate(g.date)}</span>
              <span style={{ flex: 1 }}>{name(g.homeTeamId)} – {name(g.awayTeamId)}</span>
              <span className="muted">{g.time || ''}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Entdecken</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link className="btn ghost sm" to="/standings">Tabelle</Link>
          <Link className="btn ghost sm" to="/schedule">Spielplan & Prognosen</Link>
          <Link className="btn ghost sm" to="/playoff-odds">Playoff-Wahrscheinlichkeiten</Link>
          <Link className="btn ghost sm" to="/elo">ELO</Link>
          <Link className="btn ghost sm" to="/power">Power Ranking</Link>
          <Link className="btn ghost sm" to="/players">Spieler</Link>
          <Link className="btn ghost sm" to="/topscorers">Topscorers</Link>
          <Link className="btn ghost sm" to="/goalies">Torhüter</Link>
          <Link className="btn ghost sm" to="/teams">Teams</Link>
        </div>
      </div>
    </section>
  )
}
