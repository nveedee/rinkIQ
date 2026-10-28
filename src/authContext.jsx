import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from './api.js'

// ---------------------------------------------------------------------------
// Auth-Status fürs Frontend. Die EIGENTLICHE Autorisierung passiert
// serverseitig (server/auth.js); dieser Context spiegelt nur den vom Server
// gemeldeten Session-Status, um die passende Edition (Public/Admin) zu zeigen.
// `isAdmin` ist daher nie vertrauenswürdig als Sicherheitsgrenze - geschützte
// Daten/Aktionen bleiben auch dann serverseitig gesperrt, wenn jemand diesen
// Wert im Browser manipuliert.
// ---------------------------------------------------------------------------
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState({ ready: false, authenticated: false, username: null, configured: true })

  const refreshSession = useCallback(async () => {
    try {
      const s = await api.getSession()
      setState({ ready: true, authenticated: !!s.authenticated, username: s.username || null, configured: !!s.configured })
      return s
    } catch {
      setState({ ready: true, authenticated: false, username: null, configured: true })
      return null
    }
  }, [])

  useEffect(() => { refreshSession() }, [refreshSession])

  const login = useCallback(async (username, password) => {
    const res = await api.login(username, password) // wirft bei falschen Daten
    await refreshSession()
    return res
  }, [refreshSession])

  const logout = useCallback(async () => {
    try { await api.logout() } finally { await refreshSession() }
  }, [refreshSession])

  const value = {
    authReady: state.ready,
    isAdmin: state.authenticated,
    username: state.username,
    authConfigured: state.configured,
    login,
    logout,
    refreshSession,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider genutzt werden')
  return ctx
}
