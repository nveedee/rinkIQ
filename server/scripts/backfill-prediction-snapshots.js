// ---------------------------------------------------------------------------
// Einmalige Reparatur der Pre-Game-Prediction-Snapshots für bereits gespielte
// Spiele. Baut jeden final-Spiel-Snapshot walk-forward neu auf (nur Spiele
// davor, aktueller Prior) - siehe rebuildFinalGameSnapshots() in
// server/scripts/predictions.js für die ausführliche Begründung.
//
// Nötig, weil durch den früheren create-only-Bug alle Snapshots beim
// Saisonstart auf einen Schlag mit 0 gespielten Spielen eingefroren wurden und
// die Model-Performance-Auswertung dadurch ein falsch konfiguriertes Modell
// bewertet hat.
//
// Aufruf:
//   node server/scripts/backfill-prediction-snapshots.js            # schreibt
//   node server/scripts/backfill-prediction-snapshots.js --dry-run  # nur Report
// ---------------------------------------------------------------------------

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { rebuildFinalGameSnapshots } from './predictions.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json')
const dryRun = process.argv.includes('--dry-run')

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
const res = rebuildFinalGameSnapshots(db, { log: (m) => console.log(m) })

if (dryRun) {
  console.log(`--dry-run: ${res.rebuilt} rekonstruiert, nichts geschrieben.`)
} else {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
  console.log(`db.json geschrieben (${res.rebuilt} final-Spiel-Snapshots rekonstruiert).`)
}
