// Isolated, chronological calibration experiment. It never edits model code.
// The output is deliberately fixed and exclusive-create-only; an existing
// result causes an abort rather than an overwrite.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { loadHistoricalGames, seasonList } from './loadHistorical.js'
import { buildPredictors } from './predictors.js'
import { pairedBootstrapDifference, reconstructStrictDateProbabilities, runWalkForwardCalibration } from './calibrationExperiment.js'

const here = path.dirname(fileURLToPath(import.meta.url))
export const OUTPUT_PATH = path.join(here, 'calibration-experiment-wf-2026-10-10.json')

export function verifyOutputSafety() {
  if (fs.existsSync(OUTPUT_PATH)) {
    throw new Error(`Experiment-Output existiert bereits; Abbruch ohne Überschreiben: ${OUTPUT_PATH}`)
  }
  if (!fs.existsSync(path.dirname(OUTPUT_PATH))) {
    throw new Error(`Output-Verzeichnis fehlt; es wird nicht automatisch angelegt: ${path.dirname(OUTPUT_PATH)}`)
  }
  return OUTPUT_PATH
}

function main() {
  if (process.argv.includes('--check')) {
    console.log(`Sicherheitsprüfung bestanden. Neuer Output-Pfad ist frei: ${verifyOutputSafety()}`)
    return
  }
  const outputPath = verifyOutputSafety()
  const { games, skippedNoDecision } = loadHistoricalGames()
  const seasons = seasonList(games)
  const predictor = buildPredictors().find((item) => item.id === 'production_reference')
  if (!predictor) throw new Error('Walk-Forward production_reference fehlt; Abbruch ohne Output.')

  const probabilityMap = reconstructStrictDateProbabilities(games, predictor)
  const experiment = runWalkForwardCalibration(games, probabilityMap)
  if (!experiment.perSeason.length) throw new Error('Keine chronologischen Testzeiträume verfügbar; kein Output geschrieben.')

  // Explicitly guard the required identity control against accidental drift.
  const baselineRows = experiment.variantRows.get('baseline')
  const identityRows = experiment.variantRows.get('identity')
  if (baselineRows.length !== identityRows.length || baselineRows.some((row, i) => row.prediction.homeWinProbability !== identityRows[i].prediction.homeWinProbability)) {
    throw new Error('Identitätskontrolle weicht von der Baseline ab; kein Output geschrieben.')
  }

  const comparisons = ['identity', 'intercept', 'regularized_slope'].map((variant) => ({
    baseline: 'baseline',
    variant,
    logLoss: pairedBootstrapDifference(baselineRows, experiment.variantRows.get(variant), 'logLoss'),
    brier: pairedBootstrapDifference(baselineRows, experiment.variantRows.get(variant), 'brier'),
    accuracyDelta: experiment.variants[variant].accuracy - experiment.variants.baseline.accuracy,
  }))
  const output = {
    generatedAt: new Date().toISOString(),
    experiment: 'chronological expanding-window calibration, locked test blocks by season',
    forecastSource: 'production_reference reconstructed from historical archive (not stored historical snapshots)',
    forecastCaveat: 'Market-value prior is unavailable historically; closed-form Poisson/Skellam is used instead of live Monte Carlo sampling.',
    data: {
      source: 'server/data/historical/*.json',
      seasons,
      totalGamesWithDecisions: games.length,
      skippedNoDecision,
      evaluatedSeasons: experiment.evaluatedSeasons,
      firstSeasonExcludedAsWarmup: seasons[0],
      testGames: experiment.variants.baseline?.n || 0,
      calibrationTrainingGamesBeforeLastBlock: experiment.trainingCount,
      calibrationWarmup: 'First archived season is training only; for each later season, fit on all earlier seasons and score that season without updating within it.',
      modelVersionHandling: 'One reconstructed production_reference recipe for all archived games. Current 2026/27 stored snapshots are not pooled into this archive experiment.',
    },
    calibration: {
      variants: {
        baseline: 'Raw reconstructed production_reference probabilities; no calibration.',
        identity: 'Identity mapping p -> p; runtime checked to equal baseline predictions exactly.',
        intercept: 'sigmoid(logit(p) + b), ridge penalty 0.05 on b, fit on prior seasons only.',
        regularized_slope: 'sigmoid(a * logit(p)), ridge penalty 0.1 toward a=1, fit on prior seasons only; a constrained to [0.25, 3].',
      },
      parameterUpdate: 'Expanding history, updated only at season boundaries; no within-test-season labels are used.',
    },
    uncertainty: 'Paired percentile bootstrap, 1000 resamples of season-date blocks, fixed seed 20261010. Intervals are exploratory; block count and historical regime changes limit precision.',
    overall: experiment.variants,
    comparisons,
    perSeason: experiment.perSeason,
  }

  // 'wx' provides a final race-safe guarantee that no existing output is replaced.
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), { flag: 'wx' })
  console.log(`Experiment abgeschlossen; neues Ergebnis geschrieben: ${outputPath}`)
  console.log(JSON.stringify({ testGames: output.data.testGames, evaluatedSeasons: output.data.evaluatedSeasons, overall: output.overall, comparisons: output.comparisons }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
