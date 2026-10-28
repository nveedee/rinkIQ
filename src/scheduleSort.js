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

// Absteigend: zuletzt ausgetragenes/spätestes Spiel zuerst (für "Vergangen").
export function compareKickoffDesc(a, b) {
  return -compareKickoffAsc(a, b)
}

// "Alle": zuerst alle abgeschlossenen Spiele absteigend (zuletzt ausgetragenes
// zuerst), danach alle kommenden Spiele aufsteigend (nächstes Spiel zuerst).
// Abgeschlossen/kommend wird über das übergebene Prädikat `isFinal` bestimmt
// (bewusst NICHT nur über das Datum - ein Spiel am selben Tag kann bereits
// abgeschlossen oder noch offen sein). Mutiert `games` nicht.
export function sortGamesPastThenUpcoming(games, isFinal) {
  const past = games.filter((g) => isFinal(g)).sort(compareKickoffDesc)
  const upcoming = games.filter((g) => !isFinal(g)).sort(compareKickoffAsc)
  return [...past, ...upcoming]
}
