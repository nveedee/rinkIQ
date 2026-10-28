import { Component } from 'react'

// ---------------------------------------------------------------------------
// Fängt Render-Fehler einzelner Seiten ab, damit ein Fehler NICHT die gesamte
// (öffentliche) App als weisse Seite abstürzen lässt. Zeigt eine verständliche
// Meldung ohne interne Details/Stacktrace nach aussen.
// ---------------------------------------------------------------------------
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // Nur ins Browser-Log (Entwicklung/Diagnose), nicht in die UI.
    console.error('[UI-Fehler]', error, info)
  }

  componentDidUpdate(prevProps) {
    // Bei Navigationswechsel (neuer key) Fehlerzustand zurücksetzen.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card card-pad" style={{ borderColor: '#ef444455' }}>
          <strong className="bad">Diese Ansicht konnte nicht geladen werden.</strong>
          <div className="muted mt">
            Bitte die Seite neu laden. Besteht das Problem weiterhin, ist die Ansicht
            momentan nicht verfügbar.
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
