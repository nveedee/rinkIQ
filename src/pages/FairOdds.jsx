// ---------------------------------------------------------------------------
// Faire Quoten (/fair-odds) - Übersicht aller kommenden Spiele mit den FAIREN
// Modell-Quoten (= 1 / Wahrscheinlichkeit, OHNE Buchmacher-Marge) als
// Vergleichsgrundlage zu den Sporttip-Quoten. Zwei Märkte nebeneinander:
//   • Sieger (2-Weg, inkl. Verlängerung/Penalty) - direkt aus der Prognose
//     (pHomeWin/pAwayWin, Snapshot-gestützt via withPregamePredictions).
//   • Resultat nach 60 Min. (1-X-2) - der Sporttip-Hauptmarkt, aus den
//     erwarteten Toren abgeleitet (computeRegulationOutcomeProbabilities).
//
// KEINE neue Prognoseformel und keine gespeicherten Sporttip-Quoten - die
// Seite rechnet ausschliesslich die bereits bestehende Pre-Game-Prognose in
// faire Dezimalquoten um (dieselbe Single Source of Truth wie Dashboard/
// PlayoffOdds, siehe src/pregamePrediction.js). Der Nutzer vergleicht diese
// fairen Quoten selbst mit den Sporttip-Quoten: wo die Sporttip-Quote HÖHER
// liegt als die faire, besteht potenziell Value.
// ---------------------------------------------------------------------------

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../DataContext.jsx'
import { SortableTable, SectionHeader, Empty } from '../components/ui.jsx'
import { computeMatchForecasts, computeRegulationOutcomeProbabilities } from '../playoffSim.js'
import { withPregamePredictions } from '../pregamePrediction.js'

const PAGE_SIZE = 25

function fmtDate(d) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace(/\.$/, '')
}

// Faire Dezimalquote = 1 / Wahrscheinlichkeit. Tooltip zeigt die zugrunde
// liegende Wahrscheinlichkeit. "–" wenn keine (z.B. p == 0).
function Odds({ p }) {
  if (p == null || p <= 0) return <span className="muted">–</span>
  return <span title={`${(p * 100).toFixed(1)}% Modell-Wahrscheinlichkeit`}>{(1 / p).toFixed(2)}</span>
}

export default function FairOdds() {
  const { data, derived } = useData()

  // Prior (Marktwert -> historischer Pre-Season-ELO) kommt zentral aus
  // DataContext (derived.initialRatings) - damit die fairen Quoten exakt zur
  // Prognose auf allen anderen Seiten passen (eine Quelle, keine Duplizierung).
  const initialRatings = derived.initialRatings

  const rows = useMemo(() => {
    if (!data?.teams || !data?.games) return []
    const base = computeMatchForecasts(data.teams, data.games, data.settings, data.players || [], initialRatings)
    const withPred = withPregamePredictions(base, data.predictions)
    return withPred.map((f) => {
      // 1-X-2 (nach 60 Min.) aus den erwarteten Toren - der Sporttip-
      // Hauptmarkt. 2-Weg kommt direkt aus pHomeWin/pAwayWin (inkl. Verläng.).
      const reg = computeRegulationOutcomeProbabilities(f.expHomeGoals, f.expAwayGoals)
      return {
        gameId: f.gameId,
        date: f.date,
        home: f.homeTeam,
        away: f.awayTeam,
        p2Home: f.pHomeWin,
        p2Away: f.pAwayWin,
        p1: reg.pHomeReg,
        pX: reg.pTie,
        p2: reg.pAwayReg,
      }
    })
  }, [data, initialRatings])

  const columns = [
    { key: 'date', label: 'Datum', left: true, value: (r) => r.date, render: (r) => fmtDate(r.date) },
    {
      key: 'spiel', label: 'Spiel', left: true, noSort: true,
      render: (r) => (
        <Link to={`/matchup/${r.gameId}`}>{r.home?.short || '?'} – {r.away?.short || '?'}</Link>
      ),
    },
    { key: 'p2Home', label: 'Sieger 1', num: true, title: 'Heimsieg inkl. Verlängerung/Penalty (2-Weg)', value: (r) => r.p2Home, render: (r) => <Odds p={r.p2Home} /> },
    { key: 'p2Away', label: 'Sieger 2', num: true, title: 'Auswärtssieg inkl. Verlängerung/Penalty (2-Weg)', value: (r) => r.p2Away, render: (r) => <Odds p={r.p2Away} /> },
    { key: 'p1', label: '60′ 1', num: true, title: 'Heimsieg nach 60 Minuten (Sporttip-Hauptmarkt 1-X-2)', value: (r) => r.p1, render: (r) => <Odds p={r.p1} /> },
    { key: 'pX', label: '60′ X', num: true, title: 'Unentschieden nach 60 Minuten', value: (r) => r.pX, render: (r) => <Odds p={r.pX} /> },
    { key: 'p2', label: '60′ 2', num: true, title: 'Auswärtssieg nach 60 Minuten', value: (r) => r.p2, render: (r) => <Odds p={r.p2} /> },
  ]

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Faire Quoten</h1>
          <div className="sub">Modell-Quoten ohne Marge als Vergleich zu Sporttip · {rows.length} kommende Spiele</div>
        </div>
      </div>

      <div className="card card-pad mb">
        <div className="muted" style={{ lineHeight: 1.5 }}>
          <strong>Faire Quote = 1 / Modell-Wahrscheinlichkeit</strong> – also ohne Buchmacher-Marge.
          Sporttip-Quoten enthalten eine Marge und liegen deshalb im Schnitt tiefer.
          <strong> Faustregel:</strong> liegt die Sporttip-Quote <em>höher</em> als die faire Quote hier,
          ist die Wette aus Modell-Sicht potenziell Value; liegt sie tiefer, ist der Rand gegen dich.
          <br />
          <strong>Sieger (2-Weg)</strong> zählt Verlängerung/Penalty mit (kein Unentschieden).
          <strong> 60′ (1-X-2)</strong> ist der Sporttip-Hauptmarkt „Resultat nach 60 Minuten“ inkl. Unentschieden.
          Niedrigere Quote = grösserer Favorit.
        </div>
      </div>

      <SectionHeader
        title="Alle kommenden Spiele"
        caption="Standardmässig nach Datum sortiert - Spalten per Klick umsortieren (z.B. tiefste „Sieger 1“-Quote = klarste Heimfavoriten)."
      />

      {rows.length === 0 ? (
        <Empty title="Keine kommenden Spiele" hint="Sobald der Spielplan offene Partien enthält, erscheinen hier die fairen Quoten." />
      ) : (
        <div className="card mb">
          <SortableTable
            columns={columns}
            rows={rows}
            initialSort="date"
            initialDir="asc"
            rowKey={(r) => r.gameId}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}
    </>
  )
}
