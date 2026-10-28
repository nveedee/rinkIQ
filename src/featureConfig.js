// ---------------------------------------------------------------------------
// Zentrale Feature-Konfiguration (Single Source of Truth) für die Trennung
// Public Edition / Admin Edition.
//
//   'stable'       -> in der Public Edition freigegeben (öffentlich sichtbar)
//   'experimental' -> NUR im Admin-Bereich verfügbar (funktioniert, aber
//                     eingeschränkt/unfertig/teuer für öffentliche Nutzung)
//   'disabled'     -> nirgends angeboten (nachweislich fehlerhaft, bis Fix)
//
// Sichere Standardeinstellung: Was hier nicht ausdrücklich 'stable' ist, ist
// NICHT öffentlich. Neue Features sind damit per Default nicht öffentlich.
//
// WICHTIG: Diese Konfiguration steuert nur die PRÄSENTATION/Navigation. Die
// eigentliche Zugriffskontrolle (Daten, privilegierte Aktionen) erfolgt
// serverseitig (server/auth.js, geschützte /api-Endpunkte) - die UI-Freigabe
// ist nie die einzige Sicherheitsmassnahme.
// ---------------------------------------------------------------------------

export const FEATURES = {
  // --- STABLE: Public Edition ---------------------------------------------
  standings: { status: 'stable', label: 'Tabelle', path: '/standings' },
  schedule: { status: 'stable', label: 'Spielplan', path: '/schedule' },
  teams: { status: 'stable', label: 'Teams', path: '/teams' },
  players: { status: 'stable', label: 'Spieler', path: '/players' },
  topScorers: { status: 'stable', label: 'Topscorers', path: '/topscorers' },
  goalies: { status: 'stable', label: 'Torhüter', path: '/goalies' },
  elo: { status: 'stable', label: 'ELO', path: '/elo' },
  powerRanking: { status: 'stable', label: 'Power Ranking', path: '/power' },
  headToHead: { status: 'stable', label: 'H2H', path: '/head-to-head' },
  // Match-Prognosen: geschlossene-Form-Siegwahrscheinlichkeiten (günstig,
  // keine 10k-Simulation) - auf /schedule, klar als Modell-Prognose vor
  // Spielbeginn gekennzeichnet.
  matchPredictions: { status: 'stable', label: 'Prognosen', path: '/schedule' },
  // Playoff-/Meister-Wahrscheinlichkeiten: öffentlich NUR aus dem gespeicherten
  // Server-Snapshot (nicht live gerechnet), klar mit Datenstand versehen.
  playoffOdds: { status: 'stable', label: 'Playoff Odds', path: '/playoff-odds' },

  // --- EXPERIMENTAL: nur Admin --------------------------------------------
  fairOdds: { status: 'experimental', label: 'Faire Quoten', path: '/fair-odds' },
  fanAnalytics: { status: 'experimental', label: 'Fan Analytics', path: '/fan-analytics' },
  // Volle interaktive Season-Projection inkl. What-if/Locks/Swing/Targets:
  // teure 10k-Live-Simulation pro Interaktion -> nicht öffentlich.
  seasonSimulation: { status: 'experimental', label: 'Season Projection (interaktiv)', path: '/playoff-odds' },
  postseasonPaths: { status: 'experimental', label: 'Postseason Paths', path: '/postseason' },
  modelPerformance: { status: 'experimental', label: 'Modell-Performance', path: '/model-performance' },
  backtesting: { status: 'experimental', label: 'Backtesting', path: '/backtesting' },
  settings: { status: 'experimental', label: 'Einstellungen', path: '/settings' },
  dataManagement: { status: 'experimental', label: 'Datenverwaltung & Sync', path: '/admin/system' },
}

export function featureStatus(key) {
  return FEATURES[key]?.status || 'disabled'
}

// Öffentlich sichtbar = ausdrücklich 'stable'.
export function isPublicFeature(key) {
  return featureStatus(key) === 'stable'
}

export const STATUS_LABEL = {
  stable: 'Stabil',
  experimental: 'Experimentell',
  disabled: 'Deaktiviert',
}
