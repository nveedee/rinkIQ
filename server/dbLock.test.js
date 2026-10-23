// ---------------------------------------------------------------------------
// Tests für die Schreib-Serialisierung (server/dbLock.js).
//
// Kernnachweis: überlappende Read-Modify-Write-Vorgänge dürfen KEIN Update
// verlieren. Ohne die Queue würde der zuletzt schreibende Vorgang den anderen
// (auf einem veralteten Snapshot aufsetzenden) überschreiben.
//
// Läuft vollständig isoliert in einem Temp-Verzeichnis - keine Berührung der
// echten db.json, kein Netzwerk.
//
// Aufruf: node --test server/dbLock.test.js
// ---------------------------------------------------------------------------
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runExclusive, writeJsonAtomic } from './dbLock.js'

test('runExclusive serialisiert konkurrierende Read-Modify-Write - kein Lost Update', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-dblock-'))
  const file = path.join(dir, 'db.json')
  try {
    writeJsonAtomic(file, { counter: 0 })
    const N = 50
    // Jede Task liest den Zähler, wartet bewusst (erzwingt Interleaving, das
    // ohne Lock zu Lost Updates führen würde) und schreibt +1 zurück. MIT der
    // Queue müssen am Ende alle 50 Inkremente erhalten sein.
    const rmw = () => runExclusive(async () => {
      const db = JSON.parse(fs.readFileSync(file, 'utf-8'))
      const next = db.counter + 1
      await new Promise((r) => setTimeout(r, 1))
      db.counter = next
      writeJsonAtomic(file, db)
    })
    await Promise.all(Array.from({ length: N }, rmw))
    const final = JSON.parse(fs.readFileSync(file, 'utf-8'))
    assert.equal(final.counter, N, `erwartet ${N}, war ${final.counter} (Lost Update -> Serialisierung greift nicht)`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('runExclusive: Reihenfolge bleibt erhalten (FIFO)', async () => {
  const order = []
  const tasks = [0, 1, 2, 3, 4].map((i) =>
    runExclusive(async () => {
      await new Promise((r) => setTimeout(r, (5 - i))) // spätere Tasks wären ohne Lock schneller fertig
      order.push(i)
    })
  )
  await Promise.all(tasks)
  assert.deepEqual(order, [0, 1, 2, 3, 4])
})

test('runExclusive: ein Fehler in einer Task bricht die Queue nicht ab', async () => {
  const order = []
  const p1 = runExclusive(async () => { order.push('a'); throw new Error('boom') })
  const p2 = runExclusive(async () => { order.push('b'); return 'ok' })
  await assert.rejects(p1, /boom/)
  assert.equal(await p2, 'ok')
  assert.deepEqual(order, ['a', 'b'])
})

test('writeJsonAtomic schreibt vollständig und lässt keine tmp-Reste zurück', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-atomic-'))
  try {
    const file = path.join(dir, 'x.json')
    writeJsonAtomic(file, { a: 1, b: [1, 2, 3] })
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf-8')), { a: 1, b: [1, 2, 3] })
    // Überschreiben derselben Datei muss funktionieren (rename-replace).
    writeJsonAtomic(file, { a: 2 })
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf-8')), { a: 2 })
    const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp-'))
    assert.equal(leftovers.length, 0, 'temporäre Datei wurde nicht aufgeräumt')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
