// ---------------------------------------------------------------------------
// Topscorers Kauf-/Verkauf-Heuristik. BEWUSST eine transparente, nachvoll-
// ziehbare Heuristik - KEIN backgetestetes Prognosemodell (dafür reicht die
// Marktwert-Historie derzeit nicht, siehe marketValueHistory.js / Analyse).
// Jede Empfehlung setzt sich aus vier offen gelegten Teilsignalen zusammen,
// jedes in [-1, +1] (positiv = spricht für Kaufen/Halten, negativ = für
// Verkaufen):
//   1. Persönliche Form  - jüngste Punkte/Spiel vs. Saisonschnitt
//   2. Team-Form         - Punkteschnitt des Teams in den letzten Spielen
//   3. Marktwert-Trend   - jüngste %-Veränderung des Marktwerts (Momentum)
//   4. Preis-Effizienz   - Punkte pro Mio CHF vs. Liga-Median (günstig?)
// Fehlt ein Signal (z.B. keine Spiele / keine Historie), wird sein Gewicht
// auf die vorhandenen Signale umverteilt - nichts wird mit 0 erfunden.
// ---------------------------------------------------------------------------

import { isFinalGame } from './stats.js'

const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v))

// Teilsignale (jeweils null, wenn die Datengrundlage fehlt) ------------------

// recentPpg/seasonPpg: Punkte (G+A) pro Spiel. Der Dämpfer (+0.5) verhindert,
// dass ein winziger Saisonschnitt zu absurden Ratios führt.
export function formSignal(recentPpg, seasonPpg) {
  if (recentPpg == null || seasonPpg == null) return null
  return clamp((recentPpg - seasonPpg) / (seasonPpg + 0.5))
}

// avgPts: Punkteschnitt (0-3) des Teams über die letzten Spiele. 1.5 = neutral.
export function teamSignal(avgPts) {
  if (avgPts == null) return null
  return clamp((avgPts - 1.5) / 1.5)
}

// deltaPct: jüngste Marktwert-Veränderung als Bruch (0.05 = +5%). ±10%
// sättigt das Signal. Steigend = Momentum/Nachfrage -> Kauf-Bias.
export function valueSignal(deltaPct) {
  if (deltaPct == null) return null
  return clamp(deltaPct / 0.1)
}

// ppm/medianPpm: Punkte pro Mio CHF. Deutlich über Liga-Median = günstig.
export function efficiencySignal(ppm, medianPpm) {
  if (ppm == null || !medianPpm) return null
  return clamp((ppm - medianPpm) / medianPpm)
}

// Gewichte - Form und Marktwert-Trend dominieren, Effizienz feilt nur nach.
export const WEIGHTS = { form: 0.4, team: 0.2, value: 0.25, efficiency: 0.15 }

// Gewichteter Gesamtscore über alle VORHANDENEN Signale (fehlende werden aus
// der Normierung ausgenommen, nicht als 0 gewertet).
export function computeAdviceScore(signals) {
  const map = { form: signals.form, team: signals.team, value: signals.value, efficiency: signals.efficiency }
  let sum = 0, wSum = 0
  for (const k of Object.keys(WEIGHTS)) {
    if (map[k] == null) continue
    sum += WEIGHTS[k] * map[k]
    wSum += WEIGHTS[k]
  }
  if (wSum === 0) return null
  return sum / wSum
}

export const BUY_THRESHOLD = 0.3
export const SELL_THRESHOLD = -0.3

export function verdictFromScore(score) {
  if (score == null) return 'unknown'
  if (score >= BUY_THRESHOLD) return 'buy'
  if (score <= SELL_THRESHOLD) return 'sell'
  return 'hold'
}

export const VERDICT_LABEL = { buy: 'Kaufen', hold: 'Halten', sell: 'Verkaufen', unknown: 'Zu wenig Daten' }

// Jüngste Form eines Spielers aus den dated Boxscore-Stats (game.playerStats).
// recentPpg = Ø Punkte/Spiel der letzten n Einsätze, seasonPpg = Ø über alle.
export function computeRecentForm(playerId, games, n = 5) {
  const appearances = []
  for (const g of games) {
    if (!isFinalGame(g) || !Array.isArray(g.playerStats)) continue
    const ps = g.playerStats.find((s) => s.playerId === playerId)
    if (!ps) continue
    const pts = ps.points != null ? ps.points : (ps.goals || 0) + (ps.assists || 0)
    appearances.push({ date: g.date, pts })
  }
  if (appearances.length === 0) return null
  appearances.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0))
  const recent = appearances.slice(0, n)
  const mean = (arr) => arr.reduce((s, x) => s + x.pts, 0) / arr.length
  return {
    recentPpg: mean(recent),
    seasonPpg: mean(appearances),
    gpTotal: appearances.length,
    gpRecent: recent.length,
  }
}

// Vollständige Empfehlung für einen Spieler. ctx liefert die bereits
// berechneten Kontextwerte (Team-Form, Marktwert-Änderung, Liga-Median-P/Mio),
// damit diese Funktion pro Spieler günstig bleibt.
export function buildPlayerAdvice(player, ctx) {
  const { games, teamAvgPts = null, valueDeltaPct = null, ppm = null, medianPpm = null, formN = 5 } = ctx
  const form = computeRecentForm(player.id, games, formN)
  const signals = {
    form: form ? formSignal(form.recentPpg, form.seasonPpg) : null,
    team: teamSignal(teamAvgPts),
    value: valueSignal(valueDeltaPct),
    efficiency: efficiencySignal(ppm, medianPpm),
  }
  const score = computeAdviceScore(signals)
  return { verdict: verdictFromScore(score), score, signals, form }
}

// Menschliche Kurzbegründung - nennt die stärksten Treiber (|signal| gross).
export function adviceReasons(signals, { form } = {}) {
  const parts = []
  const push = (cond, up, down) => { if (cond != null) parts.push({ v: cond, text: cond >= 0 ? up : down }) }
  push(signals.form, 'starke Form', 'schwache Form')
  push(signals.team, 'Team in Form', 'Team schwach')
  push(signals.value, 'Marktwert steigt', 'Marktwert fällt')
  push(signals.efficiency, 'günstig für seine Punkte', 'teuer für seine Punkte')
  return parts
    .filter((p) => Math.abs(p.v) >= 0.15)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .map((p) => p.text)
}
