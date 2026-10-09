import {
  computeAccuracy,
  computeBrierScore,
  computeCalibrationBins10,
  computeECE,
  computeLogLoss,
} from '../../../src/predictionMetrics.js'
import { toMetricRow } from './stats.js'
import { groupBySeasonOrdered } from './predictors.js'

const EPS = 1e-10
const INTERCEPT_RIDGE = 0.05
const SLOPE_RIDGE = 0.1

function logit(p) {
  const clipped = Math.min(1 - EPS, Math.max(EPS, p))
  return Math.log(clipped / (1 - clipped))
}

function sigmoid(x) {
  if (x >= 0) return 1 / (1 + Math.exp(-x))
  const ex = Math.exp(x)
  return ex / (1 + ex)
}

function fitScalar(trainRows, feature, linearBase, initial, ridge, center, min, max) {
  if (!trainRows.length) return center
  let value = initial
  for (let iteration = 0; iteration < 100; iteration++) {
    let gradient = ridge * (value - center)
    let hessian = ridge
    for (const row of trainRows) {
      const x = feature(row)
      const p = sigmoid(linearBase(row) + value * x)
      gradient += (p - (row.game.homeGoals > row.game.awayGoals ? 1 : 0)) * x / trainRows.length
      hessian += p * (1 - p) * x * x / trainRows.length
    }
    if (!Number.isFinite(hessian) || hessian <= 0) return center
    const next = Math.max(min, Math.min(max, value - gradient / hessian))
    if (Math.abs(next - value) < 1e-10) return next
    value = next
  }
  return value
}

export function fitIntercept(trainRows) {
  // p' = sigmoid(logit(p) + b); ridge shrinks b toward the identity mapping.
  const offset = fitScalar(trainRows, () => 1, (row) => logit(row.p), 0, INTERCEPT_RIDGE, 0, -2, 2)
  return (p) => sigmoid(logit(p) + offset)
}

export function fitRegularizedSlope(trainRows) {
  // p' = sigmoid(a * logit(p)); ridge shrinks a toward 1 (no-op calibration).
  const slope = fitScalar(trainRows, (row) => logit(row.p), () => 0, 1, SLOPE_RIDGE, 1, 0.25, 3)
  return (p) => sigmoid(slope * logit(p))
}

export function applyIdentity(p) { return p }

export function reconstructStrictDateProbabilities(games, predictor) {
  const sorted = [...games].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : 0))
  const probabilities = new Map()
  let priorGames = []
  for (let start = 0; start < sorted.length;) {
    let end = start + 1
    while (end < sorted.length && sorted[end].date === sorted[start].date) end++
    const dayGames = sorted.slice(start, end)

    // Reconstruct each fixture separately with prior calendar dates only.
    // A same-day result therefore cannot leak into another fixture's ratings,
    // SOG baseline, or rest calculation, regardless of kickoff-time ties.
    for (const game of dayGames) {
      const universe = [...priorGames, game]
      const context = { gamesBySeason: groupBySeasonOrdered(universe) }
      const result = predictor.run(universe, context, {})
      const pHome = result.get(game.id)?.pHome
      if (Number.isFinite(pHome) && pHome > 0 && pHome < 1) probabilities.set(game.id, pHome)
    }

    priorGames = [...priorGames, ...dayGames]
    start = end
  }
  return probabilities
}

function calibratedRows(rows, calibrator) {
  return rows.map((row) => toMetricRow(row.game, calibrator(row.p)))
}

function fitCalibrationDiagnostics(rows) {
  // Diagnostic logistic recalibration on evaluation data only; never used to
  // generate candidate probabilities. Newton fit with weak ridge for stability.
  if (rows.length < 20) return { intercept: null, slope: null, lowSample: true }
  let a = 1, b = 0
  for (let iteration = 0; iteration < 60; iteration++) {
    let ga = 1e-8 * (a - 1), gb = 1e-8 * b
    let haa = 1e-8, hab = 0, hbb = 1e-8
    for (const row of rows) {
      const x = logit(row.prediction.homeWinProbability)
      const y = row.homeWon ? 1 : 0
      const p = sigmoid(a * x + b)
      const w = p * (1 - p)
      ga += (p - y) * x; gb += p - y
      haa += w * x * x; hab += w * x; hbb += w
    }
    const det = haa * hbb - hab * hab
    if (!Number.isFinite(det) || det < 1e-12) return { intercept: null, slope: null, lowSample: false }
    const da = (hbb * ga - hab * gb) / det
    const db = (haa * gb - hab * ga) / det
    a = Math.max(-10, Math.min(10, a - da))
    b = Math.max(-10, Math.min(10, b - db))
    if (Math.max(Math.abs(da), Math.abs(db)) < 1e-8) break
  }
  return { intercept: b, slope: a, lowSample: false }
}

export function scoreRows(rows) {
  if (!rows.length) return null
  const bins = computeCalibrationBins10(rows)
  const diagnostics = fitCalibrationDiagnostics(rows)
  return {
    n: rows.length,
    accuracy: computeAccuracy(rows),
    brier: computeBrierScore(rows),
    logLoss: computeLogLoss(rows),
    ece: computeECE(rows, bins),
    calibrationIntercept: diagnostics.intercept,
    calibrationSlope: diagnostics.slope,
    calibrationDiagnosticsLowSample: diagnostics.lowSample,
  }
}

export function runWalkForwardCalibration(games, probabilities) {
  const bySeason = new Map()
  for (const game of games) {
    const p = probabilities.get(game.id)
    if (!Number.isFinite(p) || p <= 0 || p >= 1) continue
    if (!bySeason.has(game.season)) bySeason.set(game.season, [])
    bySeason.get(game.season).push({ game, p })
  }
  const seasons = [...bySeason.keys()]
  const variantRows = new Map([
    ['baseline', []], ['identity', []], ['intercept', []], ['regularized_slope', []],
  ])
  const perSeason = []
  let trainingCount = 0

  for (let i = 0; i < seasons.length; i++) {
    const season = seasons[i]
    const testRows = bySeason.get(season)
    if (i === 0) {
      // No earlier season exists: omit this season from every comparison.
      continue
    }
    const trainRows = seasons.slice(0, i).flatMap((s) => bySeason.get(s))
    trainingCount = Math.max(trainingCount, trainRows.length)
    const intercept = fitIntercept(trainRows)
    const slope = fitRegularizedSlope(trainRows)
    const predictions = {
      baseline: (p) => p,
      identity: applyIdentity,
      intercept,
      regularized_slope: slope,
    }
    const metrics = {}
    for (const [id, calibrator] of Object.entries(predictions)) {
      const rows = calibratedRows(testRows, calibrator)
      variantRows.get(id).push(...rows)
      metrics[id] = scoreRows(rows)
    }
    perSeason.push({ season, trainingN: trainRows.length, testN: testRows.length, variants: metrics })
  }

  const variants = Object.fromEntries([...variantRows.entries()].map(([id, rows]) => [id, scoreRows(rows)]))
  return { variants, perSeason, evaluatedSeasons: perSeason.map((x) => x.season), trainingCount, variantRows }
}

export function pairedBootstrapDifference(rowsA, rowsB, metric, { resamples = 1000, seed = 20261010 } = {}) {
  if (rowsA.length !== rowsB.length || rowsA.length === 0) return { n: rowsA.length, ci95: null }
  const dateGroups = new Map()
  rowsA.forEach((a, i) => {
    const key = `${a.game.season}|${a.game.date}`
    if (!dateGroups.has(key)) dateGroups.set(key, [])
    dateGroups.get(key).push(i)
  })
  const groups = [...dateGroups.values()]
  let state = seed >>> 0
  const random = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const loss = (row, kind) => {
    const p = Math.max(EPS, Math.min(1 - EPS, row.prediction.homeWinProbability))
    const y = row.homeWon ? 1 : 0
    if (kind === 'logLoss') return -(y * Math.log(p) + (1 - y) * Math.log(1 - p))
    return (p - y) ** 2
  }
  const deltas = new Array(resamples)
  for (let r = 0; r < resamples; r++) {
    let sum = 0, n = 0
    for (let i = 0; i < groups.length; i++) {
      const block = groups[Math.floor(random() * groups.length)]
      for (const index of block) {
        sum += loss(rowsB[index], metric) - loss(rowsA[index], metric)
        n++
      }
    }
    deltas[r] = sum / n
  }
  deltas.sort((a, b) => a - b)
  return {
    n: rowsA.length,
    observedDelta: rowsB.reduce((s, row, i) => s + loss(row, metric) - loss(rowsA[i], metric), 0) / rowsA.length,
    ci95: [deltas[Math.floor(0.025 * resamples)], deltas[Math.min(resamples - 1, Math.ceil(0.975 * resamples) - 1)]],
    bootstrapUnit: 'season-date block',
    resamples,
  }
}
