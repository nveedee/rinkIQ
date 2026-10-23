// ---------------------------------------------------------------------------
// Tests für die Retry-/Backoff-Logik der NL-API-Fetches (server/sync.js::
// fetchJson + parseRetryAfterMs). Mockt global.fetch - KEIN echter
// Netzwerkzugriff, kein Sync, keine Datenänderung.
//
// Abgedeckt: Erfolg beim 1. Versuch, Erfolg nach Retry, endgültiges Scheitern,
// nicht wiederholbare 4xx, HTTP 429 + Retry-After, Timeout und Netzwerkfehler.
//
// Aufruf: node --test server/syncFetch.test.js
// ---------------------------------------------------------------------------
import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchJson, parseRetryAfterMs, FETCH_MAX_ATTEMPTS } from './sync.js'

// Mini-Response im fetch-Stil.
function makeRes({ ok = true, status = 200, body = {}, retryAfter = null }) {
  return {
    ok,
    status,
    headers: { get: (name) => (String(name).toLowerCase() === 'retry-after' ? retryAfter : null) },
    json: async () => body,
  }
}

// Ersetzt global.fetch durch eine Sequenz von Verhaltensweisen (Response-Objekt
// ODER eine Funktion, die wirft/aborted). Zählt die Aufrufe.
function installFetch(behaviors) {
  const orig = global.fetch
  let calls = 0
  global.fetch = (url, opts) => {
    const b = behaviors[Math.min(calls, behaviors.length - 1)]
    calls++
    if (typeof b === 'function') return b(url, opts)
    return Promise.resolve(b)
  }
  return {
    get calls() { return calls },
    restore() { global.fetch = orig },
  }
}

// Schnelle Retries im Test (baseDelayMs klein), eigener kurzer Timeout.
const OPTS = { baseDelayMs: 1, timeoutMs: 50 }

test('Erfolg beim ersten Versuch', async () => {
  const f = installFetch([makeRes({ body: { ok: 1 } })])
  try {
    const data = await fetchJson('http://x/games', OPTS)
    assert.deepEqual(data, { ok: 1 })
    assert.equal(f.calls, 1)
  } finally { f.restore() }
})

test('Erfolg nach einem Retry (500 -> 200)', async () => {
  const f = installFetch([makeRes({ ok: false, status: 500 }), makeRes({ body: { ok: 2 } })])
  try {
    const data = await fetchJson('http://x/games', OPTS)
    assert.deepEqual(data, { ok: 2 })
    assert.equal(f.calls, 2)
  } finally { f.restore() }
})

test('Endgültiges Scheitern bei dauerhaftem 503 (max. Versuche ausgeschöpft)', async () => {
  const f = installFetch([makeRes({ ok: false, status: 503 })])
  try {
    await assert.rejects(fetchJson('http://x/games', OPTS), /HTTP 503/)
    assert.equal(f.calls, FETCH_MAX_ATTEMPTS)
  } finally { f.restore() }
})

test('Nicht wiederholbare 4xx (404) brechen sofort ab', async () => {
  const f = installFetch([makeRes({ ok: false, status: 404 })])
  try {
    await assert.rejects(fetchJson('http://x/games', OPTS), /HTTP 404/)
    assert.equal(f.calls, 1) // genau EIN Versuch, kein Retry
  } finally { f.restore() }
})

test('400 wird ebenfalls nicht wiederholt', async () => {
  const f = installFetch([makeRes({ ok: false, status: 400 })])
  try {
    await assert.rejects(fetchJson('http://x/games', OPTS), /HTTP 400/)
    assert.equal(f.calls, 1)
  } finally { f.restore() }
})

test('HTTP 429 wird wiederholt und respektiert Retry-After, dann Erfolg', async () => {
  const f = installFetch([makeRes({ ok: false, status: 429, retryAfter: '0' }), makeRes({ body: { ok: 3 } })])
  try {
    const data = await fetchJson('http://x/games', OPTS)
    assert.deepEqual(data, { ok: 3 })
    assert.equal(f.calls, 2)
  } finally { f.restore() }
})

test('Netzwerkfehler wird wiederholt, dann Erfolg', async () => {
  const boom = () => Promise.reject(new TypeError('fetch failed'))
  const f = installFetch([boom, makeRes({ body: { ok: 4 } })])
  try {
    const data = await fetchJson('http://x/games', OPTS)
    assert.deepEqual(data, { ok: 4 })
    assert.equal(f.calls, 2)
  } finally { f.restore() }
})

test('Timeout (AbortController) wird als transient behandelt und nach Versuchen weitergereicht', async () => {
  // fetch, das nie auflöst, aber auf das Abort-Signal reagiert (wie echtes fetch).
  const hang = (url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener('abort', () => {
      const e = new Error('aborted'); e.name = 'AbortError'; reject(e)
    })
  })
  const f = installFetch([hang])
  try {
    await assert.rejects(fetchJson('http://x/games', { baseDelayMs: 1, timeoutMs: 20, attempts: 2 }), /Timeout nach 20ms/)
    assert.equal(f.calls, 2)
  } finally { f.restore() }
})

test('Parse-Fehler bei 2xx wird NICHT wiederholt (kein transienter Abruffehler)', async () => {
  const badJson = makeRes({ body: {} })
  badJson.json = async () => { throw new SyntaxError('Unexpected token') }
  const f = installFetch([badJson])
  try {
    await assert.rejects(fetchJson('http://x/games', OPTS), /Unexpected token/)
    assert.equal(f.calls, 1)
  } finally { f.restore() }
})

test('parseRetryAfterMs: Sekunden, Deckelung, HTTP-Datum, fehlend', () => {
  assert.equal(parseRetryAfterMs(makeRes({ retryAfter: '2' })), 2000)
  assert.equal(parseRetryAfterMs(makeRes({ retryAfter: '0' })), 0)
  assert.equal(parseRetryAfterMs(makeRes({ retryAfter: '99999' })), 20000) // gedeckelt
  assert.equal(parseRetryAfterMs(makeRes({ retryAfter: null })), null)
  const now = 1_000_000_000_000
  const dateHeader = new Date(now + 3000).toUTCString()
  const ms = parseRetryAfterMs(makeRes({ retryAfter: dateHeader }), now)
  assert.ok(ms >= 0 && ms <= 4000, `HTTP-Datum ergab ${ms}`)
})
