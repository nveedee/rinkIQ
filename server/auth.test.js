import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hashPassword, verifyPassword, parseCookies,
  createSession, getSession, destroySession, verifyCredentials,
} from './auth.js'

test('hashPassword/verifyPassword roundtrip', () => {
  const h = hashPassword('s3cret-passwort')
  assert.ok(h.startsWith('scrypt$'))
  assert.equal(verifyPassword('s3cret-passwort', h), true)
  assert.equal(verifyPassword('falsch', h), false)
})

test('verifyPassword rejects malformed input', () => {
  assert.equal(verifyPassword('x', null), false)
  assert.equal(verifyPassword('x', 'kein-hash'), false)
  assert.equal(verifyPassword('x', 'md5$aa$bb'), false)
  assert.equal(verifyPassword('x', 'scrypt$zz$zz'), false)
})

test('parseCookies parses and decodes', () => {
  assert.deepEqual(parseCookies({ headers: { cookie: 'a=1; nlsid=abc%20d' } }), { a: '1', nlsid: 'abc d' })
  assert.deepEqual(parseCookies({ headers: {} }), {})
  assert.deepEqual(parseCookies({ headers: { cookie: '' } }), {})
})

test('session lifecycle', () => {
  const { token, csrf } = createSession('admin')
  assert.ok(token && csrf && token !== csrf)
  const s = getSession(token)
  assert.equal(s.username, 'admin')
  assert.equal(s.csrf, csrf)
  destroySession(token)
  assert.equal(getSession(token), null)
  assert.equal(getSession(undefined), null)
})

test('verifyCredentials uses env config', () => {
  const prevHash = process.env.ADMIN_PASSWORD_HASH
  const prevUser = process.env.ADMIN_USERNAME
  // Ohne konfiguriertes Passwort immer false.
  delete process.env.ADMIN_PASSWORD_HASH
  assert.equal(verifyCredentials('admin', 'whatever'), false)
  // Mit konfiguriertem Passwort.
  process.env.ADMIN_USERNAME = 'noel'
  process.env.ADMIN_PASSWORD_HASH = hashPassword('richtiges-pw')
  assert.equal(verifyCredentials('noel', 'richtiges-pw'), true)
  assert.equal(verifyCredentials('noel', 'falsch'), false)
  assert.equal(verifyCredentials('anderer', 'richtiges-pw'), false)
  // Aufräumen
  if (prevHash === undefined) delete process.env.ADMIN_PASSWORD_HASH; else process.env.ADMIN_PASSWORD_HASH = prevHash
  if (prevUser === undefined) delete process.env.ADMIN_USERNAME; else process.env.ADMIN_USERNAME = prevUser
})
