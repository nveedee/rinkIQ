import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveAnalyticsConfig, POSTHOG_DEFAULT_HOST } from './analyticsConfig.js'

test('ohne Key: Analytics deaktiviert, App laufffähig', () => {
  const c = resolveAnalyticsConfig({})
  assert.equal(c.enabled, false)
  assert.equal(c.key, '')
  assert.equal(c.host, POSTHOG_DEFAULT_HOST)
})

test('mit Key: Analytics aktiviert, Default-Host EU', () => {
  const c = resolveAnalyticsConfig({ VITE_POSTHOG_KEY: 'phc_abc' })
  assert.equal(c.enabled, true)
  assert.equal(c.key, 'phc_abc')
  assert.equal(c.host, POSTHOG_DEFAULT_HOST)
})

test('eigener Host wird übernommen', () => {
  const c = resolveAnalyticsConfig({ VITE_POSTHOG_KEY: 'phc_x', VITE_POSTHOG_HOST: 'https://us.i.posthog.com' })
  assert.equal(c.host, 'https://us.i.posthog.com')
})

test('leerer/whitespace Key zählt als nicht konfiguriert', () => {
  assert.equal(resolveAnalyticsConfig({ VITE_POSTHOG_KEY: '   ' }).enabled, false)
})
