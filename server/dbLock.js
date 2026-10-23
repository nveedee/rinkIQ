// ---------------------------------------------------------------------------
// Zentrale Schreib-Serialisierung + atomischer JSON-Write für db.json.
//
// Hintergrund: db.json wird als EINE Datei komplett gelesen und geschrieben
// (Read-Modify-Write). Im laufenden Serverprozess (server/index.js) gibt es
// mehrere unabhängige Schreiber - NL-Sync (server/sync.js), NL-Game-Detail-Sync
// (server/nlGameDetailSync.js), SIHF-Sync + SIHF-Discover
// (server/scripts/sync-sihf.cjs) sowie die API-Mutationen (settings/teams/
// players/import/reset). Liefen zwei davon überlappend, konnte der zuletzt
// schreibende Lauf die Änderungen des anderen überschreiben (Lost Update),
// weil beide auf einem alten Snapshot aufsetzten.
//
// runExclusive() serialisiert deshalb den GESAMTEN Read-Modify-Write jeder
// db.json-verändernden Operation über eine einzige verkettete Promise-Queue.
// Atomisches Schreiben allein würde NICHT genügen (es verhindert nur halb
// geschriebene Dateien, nicht das Überschreiben eines veralteten Snapshots) -
// deshalb beides.
//
// WICHTIG - keine Reentranz: ein über runExclusive() laufender Callback darf
// runExclusive() NICHT erneut aufrufen (das würde auf sich selbst warten =
// Deadlock). Die Aufrufer in server/index.js umschliessen immer die gesamte
// Operation am Stück, niemals geschachtelt.
// ---------------------------------------------------------------------------

import fs from 'fs'

// Schwanz der Queue: jede neue Operation hängt sich hinten an und läuft erst,
// wenn alle vorherigen abgeschlossen sind.
let tail = Promise.resolve()

export function runExclusive(fn) {
  const result = tail.then(() => fn())
  // Die interne Verkettung darf nicht durch einen Fehler in fn abreissen -
  // deshalb hier abfangen (NUR für die Kette; der Aufrufer bekommt über
  // `result` weiterhin die echte Resolve/Reject-Semantik).
  tail = result.then(() => {}, () => {})
  return result
}

// Atomischer Write: erst in eine temporäre Datei im SELBEN Verzeichnis
// schreiben, dann per rename über die Zieldatei ersetzen. rename auf derselben
// Partition ist atomar; libuv nutzt dafür auch unter Windows
// MOVEFILE_REPLACE_EXISTING, d.h. das Ziel wird überschrieben. So kann ein
// Absturz/Spin-down mitten im Schreiben keine halb geschriebene/korrupte
// db.json hinterlassen - entweder die alte oder die vollständige neue Datei.
export function writeJsonAtomic(filePath, obj) {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2))
  try {
    fs.renameSync(tmp, filePath)
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch { /* Aufräumen best effort */ }
    throw e
  }
}
