import test from 'node:test'
import assert from 'node:assert/strict'

import {
  fitIntercept,
  fitRegularizedSlope,
  pairedBootstrapDifference,
  reconstructStrictDateProbabilities,
  runWalkForwardCalibration,
} from './calibrationExperiment.js'

function game(id, season, date, homeGoals, awayGoals) {
  return { id, season, date, dt: `${date}T19:45:00+01:00`, homeGoals, awayGoals, decision: 'REG' }
}

test('identity is exactly the raw baseline on all shared chronological test games', () => {
  const games = [
    game('a', '2020/21', '2020-09-01', 2, 1), game('b', '2020/21', '2020-09-02', 1, 3),
    game('c', '2021/22', '2021-09-01', 3, 2), game('d', '2021/22', '2021-09-02', 1, 2),
    game('e', '2022/23', '2022-09-01', 2, 0), game('f', '2022/23', '2022-09-02', 1, 2),
  ]
  const probabilities = new Map(games.map((g, i) => [g.id, [0.62, 0.41, 0.55, 0.68, 0.47, 0.58][i]]))
  const result = runWalkForwardCalibration(games, probabilities)

  assert.deepEqual(result.evaluatedSeasons, ['2021/22', '2022/23'])
  assert.equal(result.variants.baseline.n, result.variants.identity.n)
  assert.deepEqual(
    result.variantRows.get('baseline').map((r) => r.prediction.homeWinProbability),
    result.variantRows.get('identity').map((r) => r.prediction.homeWinProbability),
  )
  assert.deepEqual(result.perSeason.map((x) => [x.trainingN, x.testN]), [[2, 2], [4, 2]])
})

test('calibration fits return finite identity-shrunk mappings from prior data', () => {
  const trainRows = Array.from({ length: 40 }, (_, i) => ({
    p: 0.35 + (i % 7) * 0.05,
    game: { homeGoals: i % 3 === 0 ? 3 : 1, awayGoals: i % 3 === 0 ? 1 : 2 },
  }))
  for (const fit of [fitIntercept(trainRows), fitRegularizedSlope(trainRows)]) {
    const calibrated = [0.2, 0.5, 0.8].map(fit)
    assert.ok(calibrated.every((p) => Number.isFinite(p) && p > 0 && p < 1))
  }
  assert.ok(Math.abs(fitRegularizedSlope([])(0.63) - 0.63) < 1e-12)
})

test('strict date reconstruction excludes all same-day results from each fixture input', () => {
  const games = [
    game('a', '2025/26', '2025-09-01', 9, 0),
    game('b', '2025/26', '2025-09-01', 0, 9),
    game('c', '2025/26', '2025-09-02', 2, 1),
  ]
  const seenIds = []
  const predictor = {
    run(universe) {
      const target = universe.at(-1)
      seenIds.push({ target: target.id, ids: universe.map((g) => g.id) })
      return new Map([[target.id, { pHome: 0.6 }]])
    },
  }
  const probabilities = reconstructStrictDateProbabilities(games, predictor)

  assert.deepEqual(seenIds, [
    { target: 'a', ids: ['a'] },
    { target: 'b', ids: ['b'] },
    { target: 'c', ids: ['a', 'b', 'c'] },
  ])
  assert.equal(probabilities.size, 3)
})

test('paired date-block bootstrap is deterministic and identical control has zero delta', () => {
  const rows = [
    { game: { season: 's', date: 'd1' }, homeWon: true, prediction: { homeWinProbability: 0.6 } },
    { game: { season: 's', date: 'd1' }, homeWon: false, prediction: { homeWinProbability: 0.6 } },
    { game: { season: 's', date: 'd2' }, homeWon: true, prediction: { homeWinProbability: 0.7 } },
  ]
  const a = pairedBootstrapDifference(rows, rows, 'logLoss', { resamples: 50, seed: 7 })
  const b = pairedBootstrapDifference(rows, rows, 'logLoss', { resamples: 50, seed: 7 })

  assert.deepEqual(a, b)
  assert.equal(a.observedDelta, 0)
  assert.deepEqual(a.ci95, [0, 0])
  assert.equal(a.bootstrapUnit, 'season-date block')
})
