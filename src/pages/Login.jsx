import { useState } from 'react'
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom'
import { useAuth } from '../authContext.jsx'
import { LEGAL_PAGES } from '../legalPages.js'

// ---------------------------------------------------------------------------
// Admin-Login. Serverseitig abgesichert (server/auth.js): Rate-Limit,
// scrypt-Passwortprüfung, HttpOnly-Session-Cookie. Bei Erfolg zurück zur
// ursprünglich angeforderten Admin-Seite (location.state.from) oder /admin.
// ---------------------------------------------------------------------------
export default function Login() {
  const { isAdmin, login, authConfigured } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const from = location.state?.from || '/admin'

  // Bereits angemeldet -> nicht erneut einloggen.
  if (isAdmin) return <Navigate to={from} replace />

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(username.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || 'Anmeldung fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <main className="main" style={{ maxWidth: 420, margin: '0 auto', paddingTop: 48 }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 24 }}>
          <img className="mark" src="/rinkiq-logo.png" alt="RinkIQ" />
          <div className="name-block">
            <span>RinkIQ</span>
            <span className="season">Admin-Anmeldung</span>
          </div>
        </div>

        <form className="card card-pad" onSubmit={submit}>
          <h2 style={{ marginTop: 0 }}>Anmelden</h2>
          {!authConfigured && (
            <div className="muted mt" style={{ marginBottom: 12 }}>
              Hinweis: Der Admin-Login ist serverseitig noch nicht eingerichtet
              (<code>ADMIN_PASSWORD_HASH</code> fehlt). Siehe FEATURES.md.
            </div>
          )}
          <label className="field" style={{ marginBottom: 12 }}>
            Benutzername
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              style={{ marginTop: 4 }}
            />
          </label>
          <label className="field" style={{ marginBottom: 12 }}>
            Passwort
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ marginTop: 4 }}
            />
          </label>
          {error && <div className="bad mt" role="alert" style={{ marginTop: 8 }}>{error}</div>}
          <button className="btn mt" type="submit" disabled={busy} style={{ marginTop: 16, width: '100%' }}>
            {busy ? 'Anmelden…' : 'Anmelden'}
          </button>
        </form>

        <div className="muted" style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/">← Zurück zur öffentlichen Ansicht</Link>
        </div>
        <div className="muted" style={{ textAlign: 'center', marginTop: 12, display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', fontSize: 12 }}>
          {LEGAL_PAGES.map((p) => <Link key={p.path} to={p.path}>{p.label}</Link>)}
        </div>
      </main>
    </div>
  )
}
