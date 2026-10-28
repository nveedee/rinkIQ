import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formSignal, teamSignal, valueSignal, efficiencySignal,
  computeAdviceScore, verdictFromScore, computeRecentForm, buildPlayerAdvice, WEIGHTS,
} from './topscorerAdvice.js'

test('formSignal: hot streak positive, cold negative, null ohne Daten', () => {
  assert.ok(formSignal(2, 1) > 0)
  assert.ok(formSignal(0, 1) < 0)
  assert.equal(formSignal(null, 1), null)
  assert.ok(formSignal(100, 1) <= 1) // geklemmt
})

test('teamSignal: 3 Pkt stark (+1), 0 schwach (-1), 1.5 neutral', () => {
  assert.equal(teamSignal(3), 1)
  assert.equal(teamSignal(0), -1)
  assert.equal(teamSignal(1.5), 0)
  assert.equal(teamSignal(null), null)
})

test('valueSignal: steigend positiv, fallend negativ, ±10% saturiert', () => {
  assert.ok(valueSignal(0.05) > 0 && valueSignal(0.05) < 1)
  assert.equal(valueSignal(0.1), 1)
  assert.equal(valueSignal(-0.2), -1)
  assert.equal(valueSignal(null), null)
})

test('efficiencySignal: über Median günstig (+), unter Median teuer (-)', () => {
  assert.ok(efficiencySignal(2000, 1000) > 0)
  assert.ok(efficiencySignal(500, 1000) < 0)
  assert.equal(efficiencySignal(1000, 0), null)
  assert.equal(efficiencySignal(null, 1000), null)
})

test('computeAdviceScore verteilt Gewicht fehlender Signale um', () => {
  // nur Form vorhanden -> Score == Form-Signal
  assert.ok(Math.abs(computeAdviceScore({ form: 0.8, team: null, value: null, efficiency: null }) - 0.8) < 1e-9)
  // alle gleich -> Score == dieser Wert
  assert.ok(Math.abs(computeAdviceScore({ form: 0.5, team: 0.5, value: 0.5, efficiency: 0.5 }) - 0.5) < 1e-9)
  // kein Signal -> null
  assert.equal(computeAdviceScore({ form: null, team: null, value: null, efficiency: null }), null)
})

test('verdictFromScore an den Schwellen', () => {
  assert.equal(verdictFromScore(0.5), 'buy')
  assert.equal(verdictFromScore(-0.5), 'sell')
  assert.equal(verdictFromScore(0), 'hold')
  assert.equal(verdictFromScore(null), 'unknown')
})

test('Gewichte summieren zu 1', () => {
  assert.ok(Math.abs(Object.values(WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-9)
})

test('computeRecentForm: jüngste n Spiele vs Saison', () => {
  const games = [
    { status: 'final', date: '2026-01-01', homeGoals: 1, awayGoals: 0, playerStats: [{ playerId: 'x', points: 0 }] },
    { status: 'final', date: '2026-01-05', homeGoals: 1, awayGoals: 0, playerStats: [{ playerId: 'x', points: 2 }] },
    { status: 'final', date: '2026-01-10', homeGoals: 1, awayGoals: 0, playerStats: [{ playerId: 'x', points: 2 }] },
  ]
  const f = computeRecentForm('x', games, 2)
  assert.equal(f.gpTotal, 3)
  assert.equal(f.gpRecent, 2)
  assert.equal(f.recentPpg, 2) // letzte zwei: 2 und 2
  assert.ok(Math.abs(f.seasonPpg - 4 / 3) < 1e-9)
  assert.equal(computeRecentForm('missing', games), null)
})

test('buildPlayerAdvice: in Form + Team stark + günstig -> Kaufen', () => {
  const games = [
    { status: 'final', date: '2026-01-10', homeGoals: 1, awayGoals: 0, playerStats: [{ playerId: 'x', points: 3 }] },
    { status: 'final', date: '2026-01-12', homeGoals: 1, awayGoals: 0, playerStats: [{ playerId: 'x', points: 3 }] },
  ]
  const a = buildPlayerAdvice({ id: 'x' }, { games, teamAvgPts: 3, valueDeltaPct: 0.08, ppm: 3000, medianPpm: 1000 })
  assert.equal(a.verdict, 'buy')
  assert.ok(a.score > 0)
})
