// ---------------------------------------------------------------------------
// Pre-Game Prediction Snapshots: friert die aktuelle Modellprognose für ein
// zukünftiges Spiel EINMALIG ein, damit sie nach Spielbeginn nicht mehr
// rückwirkend verändert werden kann (z.B. durch spätere ELO-Updates).
//
// Verwendet AUSSCHLIESSLICH die bereits vorhandenen, unveränderten
// produktiven Prognosefunktionen:
//   - computeElo() / ELO_CONFIG           (src/elo.js)
//   - computePowerRankings()              (src/powerRankings.js)
//   - computeFixtures() / simulateGameResult() / SeededRandom (src/playoffSim.js)
// Keine neue Prognoseformel, kein neues Feature, keine H2H-/Form-Anpassung.
// elo.js/powerRankings.js/playoffSim.js werden von dieser Datei nur
// IMPORTIERT, nicht verändert.
//
// Läuft als eigenständiges ESM-Modul (package.json: "type":"module"), damit
// es direkt aus `src/*.js` importieren kann. server/scripts/sync-sihf.cjs
// (CommonJS) bindet es per dynamischem import() ein - siehe dort.
//
// Speicherort: `db.predictions[]`, eine eigene Collection in derselben
// server/data/db.json (wie teams/players/games), aber strikt getrennt von
// `db.games` - kein Spielfeld wird durch Predictions ergänzt oder verändert.
// ---------------------------------------------------------------------------

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { computeElo, ELO_CONFIG } from '../../src/elo.js'
import { computePowerRankings } from '../../src/powerRankings.js'
import { computeFixtures, simulateGameResult, SeededRandom } from '../../src/playoffSim.js'
import { computeMarketValuePrior, DEFAULT_PRIOR_SPREAD } from '../../src/marketValuePrior.js'
import { applyRestAdjustment, computeRestAdjustment, DEFAULT_BACK_TO_BACK_PENALTY } from '../../src/restDays.js'
import { isFinalGame } from '../../src/stats.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PRESEASON_PATH = path.join(__dirname, '..', '..', 'public', 'preseason-elo.json')

// Bezeichnet exakt die Kombination der oben verwendeten, unveränderten
// Bausteine - dient nur der Nachvollziehbarkeit im gespeicherten Snapshot,
// beeinflusst die Berechnung selbst nicht. Zwei Suffixe hängen vom
// tatsächlich verwendeten ELO-Start-Prior UND von der Ruhetage/Back-to-back-
// Anpassung DIESES konkreten Snapshots ab (beide in den Einstellungen
// unabhängig um-/abschaltbar, siehe src/marketValuePrior.js, src/restDays.js) -
// so bleiben Snapshots verschiedener Modell-Varianten in ModelPerformance.jsx
// unterscheidbar, statt sich unter derselben Versions-Zeichenkette zu vermischen.
const BASE_MODEL_VERSION = 'preseason-elo-25pct+sog-mc10k-v1'
function buildModelVersion(priorSource, restDaysApplied) {
  const priorSuffix = priorSource === 'marketValue' ? '+mvprior' : ''
  const restSuffix = restDaysApplied ? '+b2b' : ''
  return BASE_MODEL_VERSION + priorSuffix + restSuffix
}

const SIMULATION_RUNS = 10000

// Jeder Snapshot bekommt einen eigenen, zufälligen Seed (Node `crypto`,
// analog zur zufälligen Seed-Erzeugung beim manuellen "Simulation
// aktualisieren" auf der Season-Projections-Seite) - kein gemeinsamer
// hardcodierter Seed mehr für alle Snapshots. Reproduzierbarkeit bleibt
// erhalten, da der erzeugte Seed IM Snapshot gespeichert wird.
function generateSeed() {
  return crypto.randomInt(1, 2 ** 31 - 1)
}

function readPreseasonSeasonEnd() {
  try {
    return JSON.parse(fs.readFileSync(PRESEASON_PATH, 'utf-8'))
  } catch {
    return null // kein Export vorhanden -> Fallback auf regulären eloStart (unverändertes Verhalten)
  }
}

// Identische Formel wie src/preseasonElo.js::computePreseasonRatings. Dort
// als React-Hook-Modul (import 'react') nicht ohne Weiteres aus einem
// eigenständigen Node-Skript importierbar - bewusst dupliziert, exakt wie an
// anderer Stelle im Projekt bereits üblich (z.B. computeShotsAllowedPerGame
// in src/headToHead.js), um preseasonElo.js nicht anfassen zu müssen.
function computePreseasonRatings(seasonEndRatings, eloStart) {
  if (!seasonEndRatings) return null
  const regression = ELO_CONFIG.seasonEndRegression
  const out = {}
  for (const [teamId, rating] of Object.entries(seasonEndRatings)) {
    out[teamId] = eloStart + (rating - eloStart) * (1 - regression)
  }
  return out
}

function round(v, decimals) {
  if (v == null || !Number.isFinite(v)) return null
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

// Simuliert EIN Fixture 10'000x (identische Poisson-/OT-SO-Logik wie die
// produktive Monte-Carlo-Simulation, hier nur pro einzelnem Spiel statt für
// eine ganze Saison aggregiert - reine Aggregation derselben, unveränderten
// simulateGameResult()-Bausteine).
function simulateFixture(fixture, seed, runs = SIMULATION_RUNS) {
  const rng = new SeededRandom(seed)
  let homeWins = 0, ot = 0, so = 0, sumHome = 0, sumAway = 0
  for (let i = 0; i < runs; i++) {
    const r = simulateGameResult(rng, fixture)
    sumHome += r.homeGoals
    sumAway += r.awayGoals
    if (r.homeGoals > r.awayGoals) homeWins++
    if (r.decision === 'OT') ot++
    else if (r.decision === 'SO') so++
  }
  return {
    pHomeWin: homeWins / runs,
    pAwayWin: (runs - homeWins) / runs,
    pOT: ot / runs,
    pSO: so / runs,
    avgHomeGoals: sumHome / runs,
    avgAwayGoals: sumAway / runs,
  }
}

// Gemeinsame ELO-Start-Prior-Auswahl (Marktwert-Prior, sonst historisches
// Archiv, sonst flach) - EXAKT dieselbe Priorität wie DataContext.jsx
// (derived.eloPriorSource). Beide Snapshot-Funktionen unten nutzen diesen
// Helfer, damit ein Snapshot garantiert mit demselben Prior entsteht, den die
// Live-App/ELO-Seite verwendet (genau das ging zuvor auseinander).
function resolvePrior(teams, players, settings, eloStart) {
  const useMarketValue = settings.marketValuePriorEnabled !== false
  const marketPrior = useMarketValue
    ? computeMarketValuePrior(teams, players, eloStart, settings.priorSpread ?? DEFAULT_PRIOR_SPREAD)
    : null
  const historicalRatings = computePreseasonRatings(readPreseasonSeasonEnd(), eloStart)
  const initialRatings = marketPrior || historicalRatings
  const priorSource = marketPrior ? 'marketValue' : (historicalRatings ? 'historicalArchive' : 'flat')
  return { initialRatings, priorSource }
}

// Baut EINEN Snapshot aus einem bereits berechneten Fixture + ELO-Stand.
// Enthält die Monte-Carlo-Simulation und die Ruhetage-Anpassung, damit beide
// Aufrufer (Live-Refresh + walk-forward-Reparatur) ein identisch geformtes
// Snapshot-Objekt und dieselbe modelVersion erzeugen. `games` dient NUR der
// Ruhetage-Berechnung (reine Pre-Game-Info, kein Ergebnis-Leak). `prev`
// (optional) überträgt createdAt/seed-Kontinuität.
function makeSnapshot({ g, fixture, eloRatings, powerByTeam, games, eloStart, seed, now, priorSource, restDaysEnabled, backToBackPenalty, prev, reconstructed = false }) {
  const mc = simulateFixture(fixture, seed)
  const restAdjustment = restDaysEnabled ? computeRestAdjustment(g, games, backToBackPenalty) : 0
  const pHomeWin = restAdjustment !== 0 ? applyRestAdjustment(mc.pHomeWin, g, games, backToBackPenalty) : mc.pHomeWin
  const snap = {
    gameId: g.id,
    createdAt: prev?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    seed,
    date: g.date,
    time: g.time || null,
    homeTeamId: g.homeTeamId,
    awayTeamId: g.awayTeamId,
    homeWinProbability: round(pHomeWin, 4),
    awayWinProbability: round(1 - pHomeWin, 4),
    expectedHomeGoals: round(mc.avgHomeGoals, 2),
    expectedAwayGoals: round(mc.avgAwayGoals, 2),
    otProbability: round(mc.pOT, 4),
    soProbability: round(mc.pSO, 4),
    eloHome: Math.round(eloRatings[g.homeTeamId] ?? eloStart),
    eloAway: Math.round(eloRatings[g.awayTeamId] ?? eloStart),
    // Phase 1 Player-Rating-Integration (siehe src/playerRatingAdjustment.js) -
    // separat von eloHome/eloAway geführt (Variante B), bei Default-Gewicht 0
    // immer 0 und ohne Effekt auf pHomeWin/expectedGoals.
    playerRatingAdjHome: round(fixture.playerRatingAdjHome, 2),
    playerRatingAdjAway: round(fixture.playerRatingAdjAway, 2),
    powerHome: powerByTeam[g.homeTeamId]?.powerScore ?? null,
    powerAway: powerByTeam[g.awayTeamId]?.powerScore ?? null,
    modelVersion: buildModelVersion(priorSource, restAdjustment !== 0),
  }
  // Provenienz-Markierung: dieser Snapshot wurde nachträglich walk-forward
  // rekonstruiert (siehe rebuildFinalGameSnapshots) und ist nicht der
  // ursprünglich zum Zeitpunkt der Erzeugung eingefrorene.
  if (reconstructed) snap.reconstructed = true
  return snap
}

// Pflegt die Pre-Game-Snapshots für alle noch nicht gestarteten
// ("status: scheduled") Spiele in `db.games`. Fehlende Snapshots werden neu
// erstellt, bereits vorhandene werden mit dem AKTUELLEN Modellstand (ELO/
// Power/Simulation) AUFGEFRISCHT - so bleibt die Pre-Game-Prognose bis zum
// Anpfiff aktuell, statt beim Saisonstart (als die ganze Saison schon
// 'scheduled' war) am damaligen Start-ELO festzuhängen. Mutiert `db` in place
// (Aufrufer entscheidet, ob per writeDb() persistiert wird - z.B. nicht im
// --dry-run).
//
// Einfrieren beim Anpfiff: sobald ein Spiel nicht mehr 'scheduled' ist (ge-
// startet/final), taucht es hier nicht mehr auf und sein zuletzt vor dem Spiel
// geschriebener Snapshot bleibt unverändert eingefroren. Der Aufrufer muss den
// Games-Update-Schritt VOR diesem Aufruf ausführen, damit frisch final
// gewordene Spiele bereits korrekt ausgeschlossen sind (leak-frei: die
// Auswertung in src/predictionMetrics.js betrachtet ohnehin nur final-Spiele).
export function ensurePredictionSnapshots(db, { now = new Date(), log } = {}) {
  if (!Array.isArray(db.predictions)) db.predictions = []
  const byGameId = new Map(db.predictions.map((p) => [p.gameId, p]))

  const teams = db.teams || []
  const players = db.players || []
  const games = db.games || []
  const settings = db.settings || {}
  const eloStart = settings.eloStart ?? ELO_CONFIG.eloStart

  const scheduled = games.filter((g) => g.status === 'scheduled')
  if (scheduled.length === 0) return { created: 0, updated: 0, total: db.predictions.length }

  // ELO-Start-Prior: Marktwert-Prior (src/marketValuePrior.js), wenn aktiviert
  // und Daten vorhanden, sonst der bestehende historische Pre-Season-ELO -
  // identische Priorität wie in DataContext.jsx (derived.eloPriorSource).
  const { initialRatings, priorSource } = resolvePrior(teams, players, settings, eloStart)

  // Ruhetage/Back-to-back (src/restDays.js) - nur für die Einzelspiel-
  // Prognose, wirkt sich NICHT auf eloRatings/die Simulation selbst aus.
  const restDaysEnabled = settings.restDaysEnabled !== false
  const backToBackPenalty = settings.backToBackPenalty ?? DEFAULT_BACK_TO_BACK_PENALTY

  // Einmal für den gesamten Batch berechnet (identischer Stand "jetzt" für
  // alle in diesem Lauf neu erzeugten Snapshots) - exakt dieselben,
  // unveränderten Funktionen wie in MatchupDetail.jsx/PlayoffOdds.jsx.
  const { fixtures, eloRatings } = computeFixtures(teams, games, settings, players, initialRatings)
  const power = computePowerRankings(teams, games, eloRatings, players)
  const powerByTeam = Object.fromEntries(power.map((p) => [p.team.id, p]))
  const fixtureByPair = new Map(fixtures.map((f) => [`${f.home}:${f.away}`, f]))

  let created = 0, updated = 0
  for (const g of scheduled) {
    const fixture = fixtureByPair.get(`${g.homeTeamId}:${g.awayTeamId}`)
    if (!fixture) continue // sollte nicht vorkommen (jedes 'scheduled'-Spiel hat ein Fixture), defensiv übersprungen

    // Vorhandenen Seed wiederverwenden - solange sich das ELO nicht geändert
    // hat, bleiben die MC-Zahlen beim Auffrischen damit exakt stabil.
    const prev = byGameId.get(g.id)
    const seed = prev?.seed ?? generateSeed()
    const snapshot = makeSnapshot({
      g, fixture, eloRatings, powerByTeam, games, eloStart, seed, now,
      priorSource, restDaysEnabled, backToBackPenalty, prev,
    })
    if (prev) {
      Object.assign(prev, snapshot) // bestehenden Snapshot in place auffrischen
      updated++
    } else {
      db.predictions.push(snapshot)
      byGameId.set(g.id, snapshot)
      created++
    }
  }

  if (log && (created > 0 || updated > 0)) log(`  → Prediction-Snapshots: ${created} neu, ${updated} aktualisiert`)
  return { created, updated, total: db.predictions.length }
}

// ---------------------------------------------------------------------------
// Einmalige Reparatur der final-Spiel-Snapshots (walk-forward).
//
// Hintergrund: durch den früheren create-only-Bug wurden beim ERSTEN Sync
// ALLE Spiele der Saison auf einen Schlag mit dem damaligen Modellstand
// (0 gespielte Spiele + historischer Prior) eingefroren und danach nie
// aktualisiert. Für die bereits gespielten Spiele hiess das: ihre Pre-Game-
// Prognose basierte auf dem Saisonstart-ELO statt auf dem ELO UNMITTELBAR VOR
// dem Spiel - die Model-Performance-Auswertung (src/predictionMetrics.js) hat
// damit effektiv ein falsch konfiguriertes Modell bewertet (Ø ~50 ELO und bis
// zu ~140 ELO daneben, Favoritenprognosen dadurch stark verzerrt).
//
// Diese Funktion rekonstruiert für JEDES bereits beendete Spiel die echte
// Pre-Game-Prognose: ELO/SOG/Power ausschliesslich aus den Spielen DAVOR
// (chronologisch, strikt leak-frei bzgl. Ergebnissen), simuliert mit genau
// derselben, unveränderten Produktivlogik (computeFixtures/simulateFixture)
// und demselben Prior wie die Live-App (resolvePrior). Vorhandene Seeds werden
// wiederverwendet -> deterministisch/idempotent.
//
// HINWEIS zum Prior: der Marktwert-Prior wird aus den AKTUELLEN Marktwerten
// gebildet (historische Marktwerte je Stichtag liegen nicht vor) - exakt wie
// im Live-Modell/DataContext. Die ELO-Fortschreibung selbst ist strikt
// walk-forward; nur der Saison-Start-Prior trägt diese kleine, unvermeidbare
// Anachronie, die um Grössenordnungen kleiner ist als die behobene Verzerrung.
export function rebuildFinalGameSnapshots(db, { now = new Date(), log } = {}) {
  if (!Array.isArray(db.predictions)) db.predictions = []
  const byGameId = new Map(db.predictions.map((p) => [p.gameId, p]))

  const teams = db.teams || []
  const players = db.players || []
  const games = db.games || []
  const settings = db.settings || {}
  const eloStart = settings.eloStart ?? ELO_CONFIG.eloStart
  const restDaysEnabled = settings.restDaysEnabled !== false
  const backToBackPenalty = settings.backToBackPenalty ?? DEFAULT_BACK_TO_BACK_PENALTY
  const { initialRatings, priorSource } = resolvePrior(teams, players, settings, eloStart)

  const key = (g) => g.date + (g.time || '')
  const finalGames = games.filter(isFinalGame).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))

  let rebuilt = 0, skipped = 0
  for (let i = 0; i < finalGames.length; i++) {
    const g = finalGames[i]
    // Nur die Spiele DAVOR als 'final', das Zielspiel selbst als 'scheduled' -
    // so erzeugt computeFixtures() ein Fixture dafür, und ELO/SOG/Power
    // stammen ausschliesslich aus der Vergangenheit (kein Ergebnis-Leak).
    const priorFinals = finalGames.slice(0, i)
    const subset = [...priorFinals, { ...g, status: 'scheduled' }]
    const { fixtures, eloRatings } = computeFixtures(teams, subset, settings, players, initialRatings)
    const fixture = fixtures.find((f) => f.gameId === g.id)
    if (!fixture) { skipped++; continue }
    const power = computePowerRankings(teams, priorFinals, eloRatings, players)
    const powerByTeam = Object.fromEntries(power.map((p) => [p.team.id, p]))

    const prev = byGameId.get(g.id)
    const seed = prev?.seed ?? generateSeed()
    const snapshot = makeSnapshot({
      g, fixture, eloRatings, powerByTeam, games, eloStart, seed, now,
      priorSource, restDaysEnabled, backToBackPenalty, prev, reconstructed: true,
    })
    if (prev) {
      Object.assign(prev, snapshot)
    } else {
      db.predictions.push(snapshot)
      byGameId.set(g.id, snapshot)
    }
    rebuilt++
  }

  if (log) log(`  → ${rebuilt} final-Spiel-Snapshot${rebuilt === 1 ? '' : 's'} walk-forward rekonstruiert${skipped ? ` (${skipped} ohne Fixture übersprungen)` : ''}`)
  return { rebuilt, skipped, total: db.predictions.length }
}
