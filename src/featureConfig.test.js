import test from 'node:test'
import assert from 'node:assert/strict'
import { FEATURES, isPublicFeature, featureStatus, STATUS_LABEL } from './featureConfig.js'

test('nur ausdrücklich stabile Features sind öffentlich', () => {
  assert.equal(isPublicFeature('standings'), true)
  assert.equal(isPublicFeature('playoffOdds'), true)
  assert.equal(isPublicFeature('settings'), false)
  assert.equal(isPublicFeature('backtesting'), false)
  assert.equal(isPublicFeature('seasonSimulation'), false)
})

test('unbekannte Features gelten als deaktiviert (sichere Vorgabe)', () => {
  assert.equal(featureStatus('gibt-es-nicht'), 'disabled')
  assert.equal(isPublicFeature('gibt-es-nicht'), false)
})

test('jedes Feature hat gültigen Status, Label und Pfad', () => {
  for (const [key, f] of Object.entries(FEATURES)) {
    assert.ok(['stable', 'experimental', 'disabled'].includes(f.status), `status ${key}`)
    assert.ok(STATUS_LABEL[f.status], `label-key ${key}`)
    assert.ok(typeof f.label === 'string' && f.label.length > 0, `label ${key}`)
    assert.ok(typeof f.path === 'string' && f.path.startsWith('/'), `path ${key}`)
  }
})
