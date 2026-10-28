// Dünner Wrapper um fetch. Im Dev-Modus proxyt Vite /api -> localhost:3001.
const base = '/api'

// CSRF-Token (Double-Submit) aus dem lesbaren Cookie nlcsrf. Wird bei
// mutierenden Requests im Header X-CSRF-Token mitgeschickt (server/auth.js).
function readCsrf() {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|;\s*)nlcsrf=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

async function req(method, url, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCsrf()
    if (csrf) headers['X-CSRF-Token'] = csrf
  }
  const res = await fetch(base + url, {
    method,
    headers,
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const j = await res.json()
      if (j.error) msg = j.error
    } catch (_) {}
    const err = new Error(msg)
    err.status = res.status
    throw err
  }
  return res.json()
}

export const api = {
  // Admin: vollständige DB (geschützt). Public: kuratierte Projektion.
  getData: () => req('GET', '/data'),
  getPublicData: () => req('GET', '/public/data'),
  getPublicStatus: () => req('GET', '/public/status'),

  // Authentifizierung
  getSession: () => req('GET', '/auth/session'),
  login: (username, password) => req('POST', '/auth/login', { username, password }),
  logout: () => req('POST', '/auth/logout'),

  // Admin-Systemstatus
  getAdminSystem: () => req('GET', '/admin/system'),

  updateSettings: (patch) => req('PUT', '/settings', patch),

  createTeam: (t) => req('POST', '/teams', t),
  updateTeam: (id, t) => req('PUT', `/teams/${id}`, t),
  deleteTeam: (id) => req('DELETE', `/teams/${id}`),

  createPlayer: (p) => req('POST', '/players', p),
  updatePlayer: (id, p) => req('PUT', `/players/${id}`, p),
  deletePlayer: (id) => req('DELETE', `/players/${id}`),

  importData: (data) => req('POST', '/import', data),
  reset: (opts) => req('POST', '/reset', opts || {}),

  getSyncStatus: () => req('GET', '/sync-status'),
  runSync: () => req('POST', '/sync'),

  getNlSyncStatus: () => req('GET', '/sync-nl-status'),
  runNlSync: () => req('POST', '/sync-nl'),
}
