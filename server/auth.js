// ---------------------------------------------------------------------------
// Admin-Authentifizierung - bewusst OHNE zusätzliche npm-Abhängigkeiten, nur
// mit Node-Built-ins (crypto). Für ein Single-Admin-Tool ausreichend und
// sicher:
//   - Passwort-Hash: scrypt (salted, langsam) - NIE Klartext, NIE im Repo.
//     Der Hash steht ausschliesslich serverseitig in der Env-Var
//     ADMIN_PASSWORD_HASH (z.B. Render-Dashboard). Erzeugung per
//     `node server/scripts/set-admin-password.js`.
//   - Session: zufälliges, opakes Token (randomBytes) in einem HttpOnly-,
//     SameSite=Lax-Cookie; Sessions liegen im Prozessspeicher (ein Admin,
//     ein Prozess). Neustart -> erneuter Login (akzeptiert).
//   - CSRF: Double-Submit-Token. Pro Session ein zufälliges CSRF-Token in
//     einem (lesbaren) Cookie; mutierende Requests müssen es im Header
//     X-CSRF-Token mitschicken. Zusammen mit SameSite=Lax doppelt abgesichert.
//   - Brute-Force: einfacher In-Memory-Rate-Limiter pro IP für den Login.
// ---------------------------------------------------------------------------
import crypto from 'crypto'

const SESSION_COOKIE = 'nlsid'
const CSRF_COOKIE = 'nlcsrf'
const SESSION_TTL_MS = (Number(process.env.ADMIN_SESSION_TTL_HOURS) || 12) * 60 * 60 * 1000
const KEYLEN = 64

// --- Passwort-Hashing (scrypt) --------------------------------------------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const derived = crypto.scryptSync(String(password), salt, KEYLEN)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  // Gültigen, nicht-leeren Hex verlangen: Buffer.from(..,'hex') bricht bei
  // ungültigen Zeichen still ab und liefert sonst u.U. einen leeren Buffer,
  // der mit einem ebenfalls leeren Buffer fälschlich "gleich" wäre.
  if (!/^[0-9a-f]+$/i.test(parts[1]) || !/^[0-9a-f]+$/i.test(parts[2])) return false
  let salt, expected
  try {
    salt = Buffer.from(parts[1], 'hex')
    expected = Buffer.from(parts[2], 'hex')
  } catch { return false }
  if (salt.length === 0 || expected.length === 0) return false
  let actual
  try { actual = crypto.scryptSync(String(password), salt, expected.length) } catch { return false }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

// --- Admin-Konfiguration (nur aus Env, nie hartkodiert) -------------------
export function getAdminConfig() {
  return {
    username: process.env.ADMIN_USERNAME || 'admin',
    passwordHash: process.env.ADMIN_PASSWORD_HASH || null,
  }
}
export function isAuthConfigured() {
  return Boolean(getAdminConfig().passwordHash)
}

// Konstantzeit-Vergleich zweier Strings (für den Benutzernamen).
function safeEqualStr(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

export function verifyCredentials(username, password) {
  const cfg = getAdminConfig()
  if (!cfg.passwordHash) return false
  // Beide Prüfungen immer ausführen (kein Short-Circuit beim Usernamen), damit
  // die Antwortzeit nicht verrät, ob der Benutzername stimmte.
  const userOk = safeEqualStr(username || '', cfg.username)
  const passOk = verifyPassword(password || '', cfg.passwordHash)
  return userOk && passOk
}

// --- Session-Store (In-Memory) --------------------------------------------
const sessions = new Map() // token -> { username, csrf, createdAt, expiresAt }

export function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex')
  const csrf = crypto.randomBytes(32).toString('hex')
  const now = Date.now()
  sessions.set(token, { username, csrf, createdAt: now, expiresAt: now + SESSION_TTL_MS })
  return { token, csrf }
}
export function getSession(token) {
  if (!token) return null
  const s = sessions.get(token)
  if (!s) return null
  if (Date.now() > s.expiresAt) { sessions.delete(token); return null }
  return s
}
export function destroySession(token) { if (token) sessions.delete(token) }

// --- Cookies (ohne cookie-parser) -----------------------------------------
export function parseCookies(req) {
  const header = req.headers?.cookie
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const k = part.slice(0, idx).trim()
    if (!k) continue
    out[k] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

function cookieTail(maxAgeSec) {
  const secure = process.env.NODE_ENV === 'production'
  return `Path=/; SameSite=Lax; ${secure ? 'Secure; ' : ''}Max-Age=${maxAgeSec}`
}

export function setSessionCookies(res, token, csrf) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000)
  res.append('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; ${cookieTail(maxAge)}`)
  res.append('Set-Cookie', `${CSRF_COOKIE}=${csrf}; ${cookieTail(maxAge)}`)
}
export function clearSessionCookies(res) {
  res.append('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; ${cookieTail(0)}`)
  res.append('Set-Cookie', `${CSRF_COOKIE}=; ${cookieTail(0)}`)
}

// --- Login-Rate-Limiter (In-Memory, pro IP) -------------------------------
const MAX_ATTEMPTS = Number(process.env.ADMIN_LOGIN_MAX_ATTEMPTS) || 8
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const attempts = new Map() // ip -> { count, resetAt }

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown'
}
export function loginAllowed(req) {
  const ip = clientIp(req)
  const now = Date.now()
  let e = attempts.get(ip)
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + ATTEMPT_WINDOW_MS }; attempts.set(ip, e) }
  e.count += 1
  return e.count <= MAX_ATTEMPTS
}
export function resetLoginAttempts(req) { attempts.delete(clientIp(req)) }

// --- Express-Middlewares --------------------------------------------------
export function attachAuth(req, _res, next) {
  const cookies = parseCookies(req)
  req.cookies = cookies
  req.session = getSession(cookies[SESSION_COOKIE])
  next()
}

export function requireAuth(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'Nicht angemeldet' })
  next()
}

// Nur für mutierende Methoden relevant; GET/HEAD/OPTIONS passieren.
export function requireCsrf(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  const header = req.get('X-CSRF-Token')
  if (!req.session || !header || !safeEqualStr(header, req.session.csrf)) {
    return res.status(403).json({ error: 'Ungültiges oder fehlendes CSRF-Token' })
  }
  next()
}

// Komfort: requireAuth + requireCsrf für schreibende Admin-Endpunkte.
export const requireAdminWrite = [requireAuth, requireCsrf]

export { SESSION_COOKIE, CSRF_COOKIE }
