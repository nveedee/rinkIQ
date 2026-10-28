import { useEffect, useState, useCallback } from 'react'
import { api } from '../../api.js'
import { useData } from '../../DataContext.jsx'
import { toast } from '../../components/ui.jsx'

// ---------------------------------------------------------------------------
// Systemstatus & Datenverwaltung (Admin): detaillierter Sync-Status beider
// Datenquellen inkl. Fehler, Laufzeitinfos, Projektions-Snapshot und manuelle
// Sync-Auslöser. Rein administrativ - serverseitig geschützt (requireAuth).
// ---------------------------------------------------------------------------
function fmt(iso) {
  if (!iso) return '–'
  try { return new Date(iso).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return '–' }
}

export default function SystemStatus() {
  const { refresh } = useData()
  const [sys, setSys] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null) // 'nl' | 'sihf' | null

  const load = useCallback(() => {
    api.getAdminSystem().then((s) => { setSys(s); setErr(null) }).catch((e) => setErr(e.message))
  }, [])

  useEffect(() => { load() }, [load])

  const runNl = async () => {
    setBusy('nl')
    try {
      const res = await api.runNlSync()
      toast(`NL-Sync abgeschlossen${res?.updated != null ? `: ${res.updated} Änderungen` : ''}`)
      await refresh(); load()
    } catch (e) { toast(e.message || 'NL-Sync fehlgeschlagen', true) } finally { setBusy(null) }
  }
  const runSihf = async () => {
    setBusy('sihf')
    try {
      const res = await api.runSync()
      toast(`SIHF-Sync abgeschlossen${res?.updated != null ? `: ${res.updated} Spiele` : ''}`)
      await refresh(); load()
    } catch (e) { toast(e.message || 'SIHF-Sync fehlgeschlagen', true) } finally { setBusy(null) }
  }

  const rt = sys?.runtime

  return (
    <section>
      <h1>Systemstatus & Datenverwaltung</h1>
      {err && <div className="card card-pad bad" style={{ marginBottom: 16 }}>Status nicht verfügbar: {err}</div>}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>National-League-API</h2>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Letzter Lauf</span><span>{fmt(sys?.sync?.nl?.lastRunAt)}</span></div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}><span className="muted">Letzter Erfolg</span><span>{fmt(sys?.sync?.nl?.lastSuccessAt)}</span></div>
        {sys?.sync?.nl?.lastError && <div className="bad" style={{ marginTop: 6 }}>Letzter Fehler: {sys.sync.nl.lastError}</div>}
        <button className="btn mt" onClick={runNl} disabled={busy} style={{ marginTop: 10 }}>{busy === 'nl' ? 'Synchronisiert…' : 'NL jetzt synchronisieren'}</button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>SIHF</h2>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Letzter Lauf</span><span>{fmt(sys?.sync?.sihf?.lastRunAt)}</span></div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}><span className="muted">Letzter Erfolg</span><span>{fmt(sys?.sync?.sihf?.lastSuccessAt)}</span></div>
        {sys?.sync?.sihf?.lastError && <div className="bad" style={{ marginTop: 6 }}>Letzter Fehler: {sys.sync.sihf.lastError}</div>}
        <button className="btn mt" onClick={runSihf} disabled={busy} style={{ marginTop: 10 }}>{busy === 'sihf' ? 'Synchronisiert…' : 'SIHF jetzt synchronisieren'}</button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Season-Projektion (Snapshot für Public Edition)</h2>
        {sys?.projectionSnapshot ? (
          <>
            <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Berechnet am</span><span>{fmt(sys.projectionSnapshot.computedAt)}</span></div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}><span className="muted">Simulationsläufe</span><span>{sys.projectionSnapshot.runs?.toLocaleString('de-CH')}</span></div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}><span className="muted">Offene Spiele</span><span>{sys.projectionSnapshot.scheduledCount}</span></div>
          </>
        ) : <div className="muted">Noch kein Snapshot berechnet (läuft nach dem nächsten Sync automatisch).</div>}
      </div>

      <div className="card card-pad">
        <h2 style={{ marginTop: 0 }}>Laufzeit</h2>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Umgebung</span><span>{rt?.nodeEnv || '–'}</span></div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}><span className="muted">Uptime</span><span>{rt ? `${Math.floor(rt.uptimeSec / 3600)}h ${Math.floor((rt.uptimeSec % 3600) / 60)}m` : '–'}</span></div>
      </div>
    </section>
  )
}
