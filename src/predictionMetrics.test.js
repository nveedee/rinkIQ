import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  CALIBRATION_LOW_SAMPLE_THRESHOLD,
  computeCalibrationBins10,
  computeDrift,
  computeModelVersionBreakdown,
} from './predictionMetrics.js'

function row(p, homeWon, modelVersion = 'v1') {
  return {
    homeWon,
    correct: (p >= 0.5) === homeWon,
    favoriteIsHome: p >= 0.5,
    favoriteProbability: Math.max(p, 1 - p),
    game: { decision: 'REG', date: '2026-09-01', time: '19:45' },
    prediction: { homeWinProbability: p, awayWinProbability: 1 - p, modelVersion },
  }
}

test('Calibration bins mark n=12 as a small sample', () => {
  const bins = computeCalibrationBins10(Array.from({ length: 12 }, () => row(0.45, true)))
  const bin = bins.find((item) => item.label === '40–50%')

  assert.equal(CALIBRATION_LOW_SAMPLE_THRESHOLD, 20)
  assert.equal(bin.count, 12)
  assert.equal(bin.lowSample, true)
})

test('drift reports ECE and signed aggregate bias as distinct metrics', () => {
  const rows = [row(0.4, true), row(0.6, false), row(0.7, true), row(0.8, true)]
  const drift = computeDrift(rows, 2)

  assert.equal(drift.first.n, 2)
  assert.equal(drift.first.aggregateBias, 0)
  assert.equal(drift.first.ece, 0.6)
  assert.equal(drift.last.n, 2)
  assert.equal(drift.last.aggregateBias, -0.25)
  assert.equal(drift.last.ece, 0.25)
  assert.equal('calibrationError' in drift.first, false)
})

test('model-version breakdown preserves separate sample counts and scores', () => {
  const rows = [row(0.7, true, 'v1'), row(0.6, false, 'v1'), row(0.4, true, 'v2')]
  const breakdown = computeModelVersionBreakdown(rows)

  assert.deepEqual(breakdown.map(({ modelVersion, n }) => [modelVersion, n]), [['v1', 2], ['v2', 1]])
  assert.equal(breakdown[0].accuracy, 0.5)
  assert.equal(breakdown[0].brier, 0.225)
  assert.equal(breakdown[0].logLoss, (-Math.log(0.7) - Math.log(0.4)) / 2)
  assert.equal(Number.isFinite(breakdown[0].ece), true)
})

test('performance UI uses distinct labels for ECE, aggregate bias, and snapshot versions', () => {
  const page = fs.readFileSync(new URL('./pages/ModelPerformance.jsx', import.meta.url), 'utf8')

  assert.match(page, /<th className="num">ECE<\/th><th className="num">Aggregierter Bias<\/th>/)
  assert.match(page, /Performance nach Snapshot-Version/)
  assert.match(page, /Bins mit weniger als 20 Spielen/)
})
