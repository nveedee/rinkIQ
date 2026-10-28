// ---------------------------------------------------------------------------
// Server-seitiger Season-Projection-Snapshot für die PUBLIC Edition.
//
// Die 10k-Monte-Carlo-Projektion (src/playoffSim.js) ist zu teuer, um sie bei
// jedem öffentlichen Seitenaufruf neu zu rechnen. Stattdessen wird sie
// periodisch (nach jedem erfolgreichen Sync) EINMAL berechnet und als
// db.projectionSnapshot abgelegt; die Public-Playoff-Odds-Seite liest nur
// diesen gespeicherten Snapshot (klar als "Datenstand/berechnet am ..."
// gekennzeichnet, nie als Live-Rechnung).
//
// Die Eingaben (ELO-Start-Prior) werden exakt wie im Client (src/DataContext.jsx)
// gebildet: Marktwert-Prior wenn aktiviert + Daten vorhanden, sonst der
// historische Pre-Season-ELO (public/preseason-elo.json), sonst flach.
// Wiederverwendet werden die UNVERÄNDERTEN, produktiven Rechenmodule - keine
// zweite Simulations-Engine.
// ---------------------------------------------------------------------------
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { ELO_CONFIG } from '../src/elo.js'
import { computeMarketValuePrior, DEFAULT_PRIOR_SPREAD } from '../src/marketValuePrior.js'
import { simulateSeasonProjections } from '../src/playoffSim.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PRESEASON_PATH = path.join(__dirname, '..', 'public', 'preseason-elo.json')

// Identische Formel wie src/preseasonElo.js::computePreseasonRatings (dort an
// einen React-Hook gekoppelt - hier bewusst repliziert, um `react` nicht in
// den Server-Prozess zu ziehen).
function computePreseasonRatings(seasonEndRatings, eloStart) {
  if (!seasonEndRatings || Object.keys(seasonEndRatings).length === 0) return null
  const regression = ELO_CONFIG.seasonEndRegression
  const out = {}
  for (const [id, rating] of Object.entries(seasonEndRatings)) {
    out[id] = eloStart + (rating - eloStart) * (1 - regression)
  }
  return out
}

function buildInitialRatings(db) {
  const settings = db.settings || {}
  const eloStart = settings.eloStart ?? ELO_CONFIG.eloStart
  const useMarketValue = settings.marketValuePriorEnabled !== false
  const marketPrior = useMarketValue
    ? computeMarketValuePrior(db.teams || [], db.players || [], eloStart, settings.priorSpread ?? DEFAULT_PRIOR_SPREAD)
    : null
  if (marketPrior) return marketPrior
  let seasonEnd = null
  try { seasonEnd = JSON.parse(fs.readFileSync(PRESEASON_PATH, 'utf-8')) } catch { seasonEnd = null }
  return computePreseasonRatings(seasonEnd, eloStart)
}

// Berechnet den schlanken öffentlichen Snapshot. Gibt null zurück, wenn es
// nichts zu projizieren gibt (keine Teams oder keine offenen Spiele) - der
// Aufrufer behält dann einen evtl. vorhandenen alten Snapshot bei.
export function computeProjectionSnapshot(db, { runs = Number(process.env.PROJECTION_RUNS) || 10000, seed = 20262027 } = {}) {
  const teams = db.teams || []
  if (teams.length === 0) return null
  const initialRatings = buildInitialRatings(db)
  const sim = simulateSeasonProjections(teams, db.games || [], db.settings || {}, {
    runs,
    seed,
    players: db.players || [],
    initialRatings,
  })
  if (!sim) return null
  const rows = sim.rows.map((r) => ({
    teamId: r.team?.id,
    pChampion: r.pChampion,
    pTop6: r.pTop6,
    pPlayoffs: r.pPlayoffs,
    pPlayIn: r.pPlayIn,
    pPlayout1314: r.pPlayout1314,
    pLigaQualifikation: r.pLigaQualifikation,
    avgPts: r.avgPts,
    avgRank: r.avgRank,
  }))
  return {
    computedAt: new Date().toISOString(),
    runs: sim.runs,
    scheduledCount: sim.scheduledCount,
    bracketSimulated: sim.bracketSimulated,
    rows,
  }
}

// Bequemer Wrapper: Snapshot berechnen und (falls erfolgreich) in die DB
// schreiben. Die teure 10k-Simulation läuft bewusst OHNE Schreib-Lock (readDb
// liefert dank atomarer Writes stets einen konsistenten Zustand); nur das
// Einhängen des fertigen Ergebnisses läuft über mutateDb (server/dbLock.js).
export async function refreshProjectionSnapshot({ readDb, mutateDb, log = () => {} }) {
  const snapshot = computeProjectionSnapshot(readDb())
  if (!snapshot) {
    log('Projection-Snapshot übersprungen (keine offenen Spiele oder keine Teams)')
    return null
  }
  await mutateDb((db) => { db.projectionSnapshot = snapshot; return db })
  log(`Projection-Snapshot aktualisiert (${snapshot.runs} Läufe, ${snapshot.scheduledCount} offene Spiele)`)
  return snapshot
}
