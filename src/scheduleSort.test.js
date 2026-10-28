import test from 'node:test'
import assert from 'node:assert/strict'
import { compareKickoffAsc, compareKickoffDesc } from './scheduleSort.js'

const g = (id, date, time) => ({ id, date, time })

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
