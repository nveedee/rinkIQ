// ---------------------------------------------------------------------------
// Sortierung der Spiele für den Spielplan (/schedule). Zentral, damit die
// Reihenfolge nicht an mehreren Stellen redundant definiert wird.
//
// Verglichen wird anhand der ROHEN Datums-/Zeitwerte der Datenstruktur
// (game.date = "YYYY-MM-DD", game.time = "HH:MM"), NICHT anhand formatierter
// Anzeige-Strings. In diesem Format ist der lexikografische Vergleich
// identisch zur chronologischen Reihenfolge. Fehlt time, wird es als "" (früh)
// behandelt. Array.prototype.sort ist in modernen Engines stabil, daher bleibt
// bei identischem Datum+Zeit die ursprüngliche Reihenfolge erhalten.
// ---------------------------------------------------------------------------

// Aufsteigend: ältestes/nächstes Spiel zuerst (für "Kommend").
export function compareKickoffAsc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  return (a.time || '').localeCompare(b.time || '')
}

// Absteigend: zuletzt ausgetragenes/spätestes Spiel zuerst (für "Vergangen"/"Alle").
export function compareKickoffDesc(a, b) {
  return -compareKickoffAsc(a, b)
}
