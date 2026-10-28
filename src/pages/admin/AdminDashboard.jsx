import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api.js'
import { useAuth } from '../../authContext.jsx'
import { FEATURES, STATUS_LABEL } from '../../featureConfig.js'

// ---------------------------------------------------------------------------
// Admin-Dashboard: Kennzahlen, Datenquellen-/Sync-Status und Feature-Matrix
// (welche Features sind öffentlich freigegeben, welche nur im Admin-Bereich).
// ---------------------------------------------------------------------------
function fmt(iso) {
  if (!iso) return '–'
  try { return new Date(iso).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return '–' }
}

const STATUS_COLOR = { stable: '#22c55e', experimental: '#f59e0b', disabled: '#ef4444' }

function Tile({ label, value }) {
  return (
    <div className="card card-pad" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
    </div>
  )
}

export default function AdminDashboard() {
  const { username } = useAuth()
  const [sys, setSys] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    api.getAdminSystem().then(setSys).catch((e) => setErr(e.message))
  }, [])

  const c = sys?.counts

  return (
    <section>
      <h1>Admin-Dashboard</h1>
      <div className="muted" style={{ marginBottom: 16 }}>Angemeldet als <strong>{username || 'admin'}</strong>.</div>

      {err && <div className="card card-pad bad" style={{ marginBottom: 16 }}>Systemstatus nicht verfügbar: {err}</div>}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', marginBottom: 20 }}>
        <Tile label="Teams" value={c ? c.teams : '…'} />
        <Tile label="Spieler" value={c ? c.players : '…'} />
        <Tile label="Spiele gesamt" value={c ? c.gamesTotal : '…'} />
        <Tile label="Gespielt" value={c ? c.gamesPlayed : '…'} />
        <Tile label="Offen" value={c ? c.gamesOpen : '…'} />
        <Tile label="Prognosen" value={c ? c.predictions : '…'} />
      </div>

      <div className="grid-2" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', marginBottom: 20 }}>
        <div className="card card-pad">
          <h2 style={{ marginTop: 0 }}>Datenquellen</h2>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">NL-API – letzte Aktualisierung</span><strong>{fmt(sys?.sync?.nl?.lastSuccessAt)}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <span className="muted">SIHF – letzte Aktualisierung</span><strong>{fmt(sys?.sync?.sihf?.lastSuccessAt)}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <span className="muted">Projektion – berechnet am</span><strong>{fmt(sys?.projectionSnapshot?.computedAt)}</strong>
          </div>
          <div style={{ marginTop: 12 }}>
            <Link className="btn ghost sm" to="/admin/system">Details & Sync →</Link>
          </div>
        </div>

        <div className="card card-pad">
          <h2 style={{ marginTop: 0 }}>Schnellzugriff</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Link className="btn ghost sm" to="/playoff-odds">Season Projection</Link>
            <Link className="btn ghost sm" to="/postseason">Postseason Paths</Link>
            <Link className="btn ghost sm" to="/model-performance">Modell-Performance</Link>
            <Link className="btn ghost sm" to="/backtesting">Backtesting</Link>
            <Link className="btn ghost sm" to="/settings">Einstellungen</Link>
            <Link className="btn ghost sm" to="/admin/system">System & Sync</Link>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <h2 style={{ marginTop: 0 }}>Feature-Matrix</h2>
        <div className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
          Stabil = öffentlich freigegeben · Experimentell = nur Admin · Deaktiviert = nirgends.
        </div>
        <table className="table">
          <thead><tr><th style={{ textAlign: 'left' }}>Feature</th><th>Status</th></tr></thead>
          <tbody>
            {Object.entries(FEATURES).map(([key, f]) => (
              <tr key={key}>
                <td style={{ textAlign: 'left' }}>{f.label}</td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[f.status] }} />
                    {STATUS_LABEL[f.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
