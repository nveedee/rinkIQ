import { useData } from '../DataContext.jsx'
import Disclaimer from '../components/Disclaimer.jsx'

// ---------------------------------------------------------------------------
// Öffentliche Playoff-/Meister-Wahrscheinlichkeiten - liest AUSSCHLIESSLICH
// den serverseitig gespeicherten Season-Projection-Snapshot
// (db.projectionSnapshot, via /api/public/data). KEINE Live-Simulation im
// Browser. Klar mit Datenstand gekennzeichnet - keine erfundenen/als live
// ausgegebenen Wahrscheinlichkeiten. Die volle interaktive Projektion
// (What-if/Locks/Swing) bleibt dem Admin-Bereich vorbehalten.
// ---------------------------------------------------------------------------
function pct(p) {
  if (p == null || Number.isNaN(p)) return '–'
  const v = p * 100
  if (v > 0 && v < 0.1) return '<0.1 %'
  return v.toFixed(1) + ' %'
}

function fmtDateTime(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' })
  } catch { return null }
}

export default function PublicPlayoffOdds() {
  const { data, teamById } = useData()
  const snap = data?.projectionSnapshot

  if (!snap || !Array.isArray(snap.rows) || snap.rows.length === 0) {
    return (
      <section>
        <h1>Playoff-Wahrscheinlichkeiten</h1>
        <div className="card card-pad muted">
          Die Saison-Projektion wird gerade erstellt oder es sind aktuell keine
          offenen Spiele vorhanden. Bitte später erneut vorbeischauen.
        </div>
      </section>
    )
  }

  const rows = [...snap.rows].sort((a, b) => (b.pPlayoffs - a.pPlayoffs) || (b.avgPts - a.avgPts))
  const stand = fmtDateTime(snap.computedAt)

  return (
    <section>
      <h1>Playoff-Wahrscheinlichkeiten</h1>
      <div className="muted" style={{ marginBottom: 12 }}>
        Modell-Projektion aus {snap.runs?.toLocaleString('de-CH')} simulierten Saisonverläufen.
        {stand && <> Datenstand: <strong>{stand}</strong>.</>} Keine Live-Berechnung – gespeicherter Snapshot.
      </div>

      <Disclaimer />

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Team</th>
              <th>Meister</th>
              <th>Top 6</th>
              <th>Playoffs</th>
              <th>Play-in</th>
              <th>Play-out</th>
              <th>Ligaquali.</th>
              <th>Ø Pkt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const team = teamById?.(r.teamId)
              return (
                <tr key={r.teamId}>
                  <td style={{ textAlign: 'left', fontWeight: 600 }}>
                    {team?.color && (
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: team.color, marginRight: 8 }} />
                    )}
                    {team?.name || team?.short || r.teamId}
                  </td>
                  <td>{pct(r.pChampion)}</td>
                  <td>{pct(r.pTop6)}</td>
                  <td>{pct(r.pPlayoffs)}</td>
                  <td>{pct(r.pPlayIn)}</td>
                  <td>{pct(r.pPlayout1314)}</td>
                  <td>{pct(r.pLigaQualifikation)}</td>
                  <td>{r.avgPts != null ? r.avgPts.toFixed(1) : '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
