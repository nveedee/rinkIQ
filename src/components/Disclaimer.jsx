import { Link } from 'react-router-dom'

// Sachlicher Hinweis zu modellbasierten Prognosen/Quoten. Rein informativ -
// greift NICHT in die Prognose-/Analyselogik ein. Auf Prognoseseiten einsetzbar.
export default function Disclaimer({ compact = false }) {
  return (
    <div className="muted" style={{ fontSize: compact ? 11.5 : 12.5, lineHeight: 1.5, margin: compact ? '8px 0' : '12px 0' }}>
      Hinweis: ELO-Ratings, Prognosen, Playoff-Wahrscheinlichkeiten und berechnete
      Quoten sind modellbasierte Schätzungen und <strong>garantieren keine
      Ergebnisse</strong>. Kein Wettangebot. RinkIQ ist unabhängig und kein
      offizielles Angebot der National League oder SIHF.{' '}
      {!compact && <Link to="/nutzungsbedingungen">Mehr</Link>}
    </div>
  )
}
