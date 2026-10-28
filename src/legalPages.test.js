import test from 'node:test'
import assert from 'node:assert/strict'
import { LEGAL_PAGES } from './legalPages.js'

// Diese Invarianten sichern die öffentliche Erreichbarkeit der Rechtstexte ab:
// Footer (Navigation) und Router lesen dieselbe Liste (src/legalPages.js), und
// der Build stellt sicher, dass die zugehörigen Routen/Komponenten existieren.
test('alle vier Pflicht-Rechtstexte sind vorhanden', () => {
  const paths = LEGAL_PAGES.map((p) => p.path)
  for (const required of ['/impressum', '/datenschutz', '/nutzungsbedingungen', '/quellen-methodik']) {
    assert.ok(paths.includes(required), `fehlt: ${required}`)
  }
})

test('Pfade sind öffentlich (kein /admin-Präfix), absolut und eindeutig', () => {
  const paths = LEGAL_PAGES.map((p) => p.path)
  assert.equal(new Set(paths).size, paths.length, 'doppelte Pfade')
  for (const p of paths) {
    assert.ok(p.startsWith('/'), `nicht absolut: ${p}`)
    assert.ok(!p.startsWith('/admin'), `darf nicht hinter Admin-Guard liegen: ${p}`)
  }
})

test('jeder Eintrag hat ein nicht-leeres Label', () => {
  for (const p of LEGAL_PAGES) {
    assert.ok(typeof p.label === 'string' && p.label.trim().length > 0, `Label fehlt für ${p.path}`)
  }
})
