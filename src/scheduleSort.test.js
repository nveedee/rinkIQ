import test from 'node:test'
import assert from 'node:assert/strict'
import { compareKickoffAsc, compareKickoffDesc, sortGamesPastThenUpcoming } from './scheduleSort.js'

const g = (id, date, time, status) => ({ id, date, time, status })
const isFinal = (x) => x.status === 'final'

test('absteigend: zuletzt ausgetragenes Spiel zuerst', () => {
  const games = [
    g('a', '2026-09-15', '19:45'),
    g('b', '2026-10-27', '19:45'),
    g('c', '2026-10-23', '19:45'),
    g('d', '2026-10-24', '20:00'),
  ]
  const ids = [...games].sort(compareKickoffDesc).map((x) => x.id)
  assert.deepEqual(ids, ['b', 'd', 'c', 'a']) // 27.10 > 24.10 > 23.10 > 15.09
})

test('absteigend: ältestes Spiel steht zuletzt', () => {
  const games = [g('neu', '2026-10-27', '19:45'), g('alt', '2026-09-15', '19:45')]
  const sorted = [...games].sort(compareKickoffDesc)
  assert.equal(sorted[0].id, 'neu')
  assert.equal(sorted[sorted.length - 1].id, 'alt')
})

test('aufsteigend: nächstes Spiel zuerst', () => {
  const games = [g('spaet', '2026-11-01', '19:45'), g('frueh', '2026-10-28', '19:45')]
  const ids = [...games].sort(compareKickoffAsc).map((x) => x.id)
  assert.deepEqual(ids, ['frueh', 'spaet'])
})

test('gleiches Datum: nach Anspielzeit sortiert', () => {
  const games = [
    g('spaet', '2026-10-27', '20:00'),
    g('frueh', '2026-10-27', '17:00'),
    g('mitte', '2026-10-27', '19:45'),
  ]
  assert.deepEqual([...games].sort(compareKickoffAsc).map((x) => x.id), ['frueh', 'mitte', 'spaet'])
  assert.deepEqual([...games].sort(compareKickoffDesc).map((x) => x.id), ['spaet', 'mitte', 'frueh'])
})

test('stabil bei identischem Datum+Zeit (Reihenfolge bleibt erhalten)', () => {
  const games = [g('x1', '2026-10-27', '19:45'), g('x2', '2026-10-27', '19:45'), g('x3', '2026-10-27', '19:45')]
  assert.deepEqual([...games].sort(compareKickoffAsc).map((x) => x.id), ['x1', 'x2', 'x3'])
  assert.deepEqual([...games].sort(compareKickoffDesc).map((x) => x.id), ['x1', 'x2', 'x3'])
})

test('fehlende Anspielzeit wird als früh behandelt (kein Absturz)', () => {
  const games = [g('mitZeit', '2026-10-27', '19:45'), g('ohneZeit', '2026-10-27', undefined)]
  assert.deepEqual([...games].sort(compareKickoffAsc).map((x) => x.id), ['ohneZeit', 'mitZeit'])
})

test('Alle: zuerst vergangene (absteigend), danach kommende (aufsteigend)', () => {
  // Bewusst gemischte Eingabereihenfolge; Beispiel aus dem Auftrag.
  const games = [
    g('u-nov', '2026-11-05', '19:45', 'scheduled'),
    g('p-23', '2026-10-23', '19:45', 'final'),
    g('u-30', '2026-10-30', '19:45', 'scheduled'),
    g('p-27', '2026-10-27', '19:45', 'final'),
    g('u-mar', '2027-03-01', '19:45', 'scheduled'),
    g('p-24', '2026-10-24', '20:00', 'final'),
    g('u-29', '2026-10-29', '20:00', 'scheduled'),
  ]
  const ids = sortGamesPastThenUpcoming(games, isFinal).map((x) => x.id)
  assert.deepEqual(ids, [
    'p-27', 'p-24', 'p-23',            // vergangen, absteigend (neuestes zuerst)
    'u-29', 'u-30', 'u-nov', 'u-mar',  // kommend, aufsteigend (nächstes zuerst)
  ])
})

test('Alle: Grenze vergangen/kommend über Status, nicht über Datum (gleicher Tag)', () => {
  // Zwei Spiele am selben Tag: eines final, eines offen - final zählt zu
  // "vergangen" (oben), scheduled zu "kommend" (unten), unabhängig vom Datum.
  const games = [
    g('offen-heute', '2026-10-28', '20:00', 'scheduled'),
    g('final-heute', '2026-10-28', '17:00', 'final'),
  ]
  const ids = sortGamesPastThenUpcoming(games, isFinal).map((x) => x.id)
  assert.deepEqual(ids, ['final-heute', 'offen-heute'])
})

test('Alle: mutiert das Eingabe-Array nicht', () => {
  const games = [g('b', '2026-10-27', '19:45', 'final'), g('a', '2026-09-15', '19:45', 'final')]
  const snapshot = games.map((x) => x.id)
  sortGamesPastThenUpcoming(games, isFinal)
  assert.deepEqual(games.map((x) => x.id), snapshot)
})
