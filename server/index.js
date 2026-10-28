import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sihfSync from './scripts/sync-sihf.cjs'
import { runNlSync, readNlSyncStatus, DEFAULT_NL_SYNC_INTERVAL_MIN } from './sync.js'
import { runNlGameDetailSync } from './nlGameDetailSync.js'
import { pollLiveGames, ensureFreshLiveState, getAllLiveStates, LIVE_POLL_INTERVAL_MS } from './liveSync.js'
import { runExclusive, writeJsonAtomic } from './dbLock.js'
import {
  attachAuth, requireAuth, requireAdminWrite,
  verifyCredentials, createSession, destroySession, setSessionCookies, clearSessionCookies,
  isAuthConfigured, loginAllowed, resetLoginAttempts, getAdminConfig, SESSION_COOKIE,
} from './auth.js'
import { refreshProjectionSnapshot } from './projectionSnapshot.js'

const { runSync: runSihfSync, runDiscover: runSihfDiscover, readSyncStatus } = sihfSync

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
// Persistentes Laufzeit-Verzeichnis für die SCHREIBBAREN Dateien (db.json +
// Sync-Status). Auf Render per Umgebungsvariable PERSIST_DIR auf den
// gemounteten Disk-Pfad (/opt/render/project/src/server/data/persistent)
// gesetzt, damit diese Dateien Redeploys/Spin-downs überleben. Lokal/ohne
// PERSIST_DIR bleibt es exakt das bisherige Verzeichnis server/data
// (unverändertes Verhalten). seed.json und fixtures/ bleiben BEWUSST unter
// DATA_DIR (Repo-Pfad) - der Mount liegt nur auf dem Unterordner `persistent`
// und verdeckt sie deshalb NICHT (siehe render.yaml).
const PERSIST_DIR = process.env.PERSIST_DIR || DATA_DIR
const DB_PATH = path.join(PERSIST_DIR, 'db.json')
const SEED_PATH = path.join(DATA_DIR, 'seed.json')
const DIST_DIR = path.join(__dirname, '..', 'dist')
const PORT = process.env.PORT || 3001

// ---------------------------------------------------------------------------
// DB-Helfer: db.json lesen/schreiben. Existiert die Datei nicht, wird sie aus
// seed.json (14 NL-Teams) erzeugt.
// ---------------------------------------------------------------------------
function ensureDb() {
  if (!fs.existsSync(PERSIST_DIR)) fs.mkdirSync(PERSIST_DIR, { recursive: true })
  if (!fs.existsSync(DB_PATH)) {
    // Erstinitialisierung (leeres/frisches persistentes Verzeichnis): IMMER
    // aus seed.json (Repo-Pfad, nie im Mount). Ein leeres persistentes
    // Verzeichnis darf NICHT unbemerkt zu einer leeren DB führen - fehlt
    // seed.json, wird das laut geloggt (deutet auf eine Fehlkonfiguration hin,
    // z.B. Disk versehentlich über server/data statt .../persistent gemountet).
    if (fs.existsSync(SEED_PATH)) {
      fs.writeFileSync(DB_PATH, fs.readFileSync(SEED_PATH, 'utf-8'))
      console.log(`  DB initialisiert aus seed.json (${SEED_PATH})`)
    } else {
      console.warn(`  ⚠ seed.json NICHT gefunden (${SEED_PATH}) - DB wird LEER initialisiert. Prüfe, ob der persistente Disk-Mount versehentlich über server/data statt server/data/persistent liegt.`)
      fs.writeFileSync(DB_PATH, JSON.stringify(emptyDb(), null, 2))
    }
  }
}

function emptyDb() {
  return {
    settings: {
      seasonName: 'National League 2026/27',
      eloStart: 1500,
      eloK: 16,
      eloHomeAdvantage: 65,
      // Prognose-Erweiterungen (src/marketValuePrior.js, src/restDays.js) -
      // beide unabhängig abschaltbar, siehe Settings-Seite.
      marketValuePriorEnabled: true,
      priorSpread: 120,
      restDaysEnabled: true,
      backToBackPenalty: 0.04,
    },
    teams: [],
    players: [],
    games: [],
    predictions: [],
  }
}

function readDb() {
  ensureDb()
  const raw = fs.readFileSync(DB_PATH, 'utf-8')
  try {
    return JSON.parse(raw)
  } catch (e) {
    // Eine beschädigte, aber NICHT leere db.json darf NICHT stillschweigend als
    // leere DB behandelt werden: der nächste writeDb() würde sonst die (evtl.
    // noch reparierbaren) Daten endgültig überschreiben. Stattdessen den
    // Rohinhalt beiseite sichern und hart abbrechen, damit ein Mensch eingreifen
    // (Backup importieren) kann. Ein echter 0-Byte-Zustand (keine Daten zu
    // verlieren) wird wie "fehlend" behandelt und frisch initialisiert.
    if (raw && raw.trim()) {
      const aside = `${DB_PATH}.corrupt-${Date.now()}`
      try { fs.writeFileSync(aside, raw) } catch { /* best effort */ }
      console.error(`db.json ist beschädigt und konnte nicht geparst werden (${e.message}). Rohkopie gesichert: ${aside}. Es wird NICHT über die beschädigte Datei geschrieben - bitte ein Backup per POST /api/import wiederherstellen.`)
      throw new Error('db.json beschädigt - Schreibschutz aktiv (siehe Server-Log)')
    }
    console.error('db.json war leer - initialisiere neu (emptyDb).')
    return emptyDb()
  }
}

function writeDb(db) {
  ensureDb()
  writeJsonAtomic(DB_PATH, db)
}

// Serialisierter Read-Modify-Write: liest die DB, wendet `mutator(db)` an und
// schreibt zurück - alles innerhalb EINER runExclusive-Transaktion, damit sich
// konkurrierende Schreiber (Syncs + API-Mutationen) nie überlappen. Gibt den
// Rückgabewert des Mutators zurück (oder die DB, falls undefined).
function mutateDb(mutator) {
  return runExclusive(() => {
    const db = readDb()
    const result = mutator(db)
    writeDb(db)
    return result === undefined ? db : result
  })
}

// Simple, kollisionsarme ID.
function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

// Season-Projection-Snapshot (server/projectionSnapshot.js) neu berechnen -
// fire-and-forget, einfacher Re-Entrancy-Guard. Wird nach erfolgreichen Syncs,
// beim Start und periodisch angestossen (siehe unten).
let snapshotRunning = false
async function refreshSnapshotSafe() {
  if (snapshotRunning) return
  snapshotRunning = true
  try {
    await refreshProjectionSnapshot({ readDb, mutateDb, log: (...a) => console.log('[PROJECTION]', ...a) })
  } catch (e) {
    console.error('[PROJECTION] Fehler:', e.message)
  } finally {
    snapshotRunning = false
  }
}

// Kuratierte, öffentliche Projektion der DB (Public Edition). Einzige Stelle,
// an der der Server entscheidet, was unangemeldete Besucher sehen. db.json
// enthält keine Geheimnisse; bewusst WEGGELASSEN wird nur der persönliche
// Topscorer-Kader (settings.topscorerRoster). db.predictions (eingefrorene
// Pre-Game-Snapshots - nur Wahrscheinlichkeiten/ELO) sind bewusst DABEI, damit
// die öffentlichen Match-Prognosen exakt dieselben Pre-Game-Werte wie der
// Admin zeigen (src/pregamePrediction.js, single source of truth). Statt der
// teuren Live-Season-Projektion nur der gespeicherte Snapshot.
function toPublicDb(db) {
  const s = db.settings || {}
  return {
    settings: {
      seasonName: s.seasonName,
      eloStart: s.eloStart,
      eloK: s.eloK,
      eloHomeAdvantage: s.eloHomeAdvantage,
      marketValuePriorEnabled: s.marketValuePriorEnabled,
      priorSpread: s.priorSpread,
      restDaysEnabled: s.restDaysEnabled,
      backToBackPenalty: s.backToBackPenalty,
      public: true,
    },
    teams: db.teams || [],
    players: db.players || [],
    games: db.games || [],
    predictions: db.predictions || [],
    projectionSnapshot: db.projectionSnapshot || null,
  }
}

const app = express()
// Hinter dem Render-Proxy (bzw. jedem Reverse-Proxy): echte Client-IP für den
// Login-Rate-Limiter und korrekte Secure-Cookies.
app.set('trust proxy', 1)
app.use(express.json({ limit: '5mb' }))
// Session/CSRF aus Cookies lesen und an req hängen (für alle Routen verfügbar).
app.use(attachAuth)

// ---------------------------------------------------------------------------
// Authentifizierung (server/auth.js) - Admin-Login/Logout/Session-Status.
// ---------------------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  if (!loginAllowed(req)) {
    return res.status(429).json({ error: 'Zu viele Login-Versuche. Bitte später erneut versuchen.' })
  }
  if (!isAuthConfigured()) {
    return res.status(503).json({ error: 'Admin-Login ist serverseitig nicht konfiguriert (ADMIN_PASSWORD_HASH fehlt).' })
  }
  const { username, password } = req.body || {}
  if (!verifyCredentials(username, password)) {
    return res.status(401).json({ error: 'Benutzername oder Passwort falsch.' })
  }
  const cfg = getAdminConfig()
  const { token, csrf } = createSession(cfg.username)
  setSessionCookies(res, token, csrf)
  resetLoginAttempts(req)
  res.json({ username: cfg.username })
})

app.post('/api/auth/logout', (req, res) => {
  destroySession(req.cookies?.[SESSION_COOKIE])
  clearSessionCookies(res)
  res.json({ ok: true })
})

app.get('/api/auth/session', (req, res) => {
  res.json({
    authenticated: Boolean(req.session),
    username: req.session?.username || null,
    configured: isAuthConfigured(),
  })
})

// ---------------------------------------------------------------------------
// Öffentliche (unauthentifizierte) Lese-Endpunkte für die Public Edition.
// ---------------------------------------------------------------------------
app.get('/api/public/data', (_req, res) => {
  res.json(toPublicDb(readDb()))
})

// Minimaler öffentlicher Datenstand: nur der Zeitpunkt der letzten
// ERFOLGREICHEN Aktualisierung (keine internen Fehler-/Timing-Details).
app.get('/api/public/status', (_req, res) => {
  const nl = readNlSyncStatus() || {}
  const sihf = readSyncStatus() || {}
  const times = [nl.lastSuccessAt, sihf.lastSuccessAt].filter(Boolean).sort()
  res.json({ lastSuccessAt: times.length ? times[times.length - 1] : null })
})

// ---------------------------------------------------------------------------
// Gesamte Daten
// ---------------------------------------------------------------------------
// Vollständige DB - NUR für den Admin (Public Edition nutzt /api/public/data).
app.get('/api/data', requireAuth, (_req, res) => {
  res.json(readDb())
})

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
app.put('/api/settings', ...requireAdminWrite, async (req, res) => {
  try {
    const settings = await mutateDb((db) => {
      db.settings = { ...db.settings, ...req.body }
      return db.settings
    })
    res.json(settings)
  } catch (e) {
    res.status(500).json({ error: 'Einstellungen konnten nicht gespeichert werden', message: e.message })
  }
})

// ---------------------------------------------------------------------------
// Generischer CRUD-Helfer für Collections (teams, players, games)
// ---------------------------------------------------------------------------
function crud(collection, idPrefix) {
  app.post(`/api/${collection}`, ...requireAdminWrite, async (req, res) => {
    try {
      const item = await mutateDb((db) => {
        const it = { id: makeId(idPrefix), ...req.body }
        db[collection].push(it)
        return it
      })
      res.status(201).json(item)
    } catch (e) {
      res.status(500).json({ error: 'Speichern fehlgeschlagen', message: e.message })
    }
  })

  app.put(`/api/${collection}/:id`, ...requireAdminWrite, async (req, res) => {
    try {
      const result = await mutateDb((db) => {
        const idx = db[collection].findIndex((x) => x.id === req.params.id)
        if (idx === -1) return { __notFound: true }
        db[collection][idx] = { ...db[collection][idx], ...req.body, id: req.params.id }
        return db[collection][idx]
      })
      if (result && result.__notFound) return res.status(404).json({ error: 'Nicht gefunden' })
      res.json(result)
    } catch (e) {
      res.status(500).json({ error: 'Speichern fehlgeschlagen', message: e.message })
    }
  })

  app.delete(`/api/${collection}/:id`, ...requireAdminWrite, async (req, res) => {
    try {
      const removed = await mutateDb((db) => {
        const before = db[collection].length
        db[collection] = db[collection].filter((x) => x.id !== req.params.id)
        // Aufräumen abhängiger Daten
        if (collection === 'teams') {
          db.players = db.players.filter((p) => p.teamId !== req.params.id)
          db.games = db.games.filter(
            (g) => g.homeTeamId !== req.params.id && g.awayTeamId !== req.params.id
          )
        }
        if (collection === 'players') {
          db.games = db.games.map((g) => ({
            ...g,
            playerStats: (g.playerStats || []).filter((s) => s.playerId !== req.params.id),
          }))
        }
        return before - db[collection].length
      })
      res.json({ removed })
    } catch (e) {
      res.status(500).json({ error: 'Löschen fehlgeschlagen', message: e.message })
    }
  })
}

crud('teams', 'team')
crud('players', 'player')
// KEIN crud('games', 'game') mehr: Spiele kommen ausschliesslich über den
// Sync (SIHF/NL, s.u.) - manuelle Erfassung/Bearbeitung/Löschung von Spielen
// wurde entfernt (src/pages/GameEntry.jsx), da sie den Sync nur duplizierte.

// ---------------------------------------------------------------------------
// SIHF-Sync (server/scripts/sync-sihf.cjs) - hält den Spielplan mit den
// offiziellen SIHF-Resultaten synchron. Der Sync-Code selbst lebt komplett
// im eigenständigen Skript; hier nur ein dünner Trigger + Status-Endpunkt.
// ---------------------------------------------------------------------------
let syncRunning = false

app.get('/api/sync-status', requireAuth, (_req, res) => {
  res.json(readSyncStatus() || { lastRunAt: null, lastSuccessAt: null })
})

app.post('/api/sync', ...requireAdminWrite, async (_req, res) => {
  if (syncRunning) return res.status(409).json({ error: 'Sync läuft bereits' })
  syncRunning = true
  const logs = []
  try {
    // Über die zentrale Schreib-Queue, damit der Sync nie mit einem parallelen
    // NL-Sync/Discover/API-Write kollidiert (siehe server/dbLock.js).
    const summary = await runExclusive(() => runSihfSync({ write: true, log: (...a) => logs.push(a.join(' ')) }))
    refreshSnapshotSafe() // fire-and-forget: Projektion nach dem Sync auffrischen
    res.json({ ...summary, logs })
  } catch (e) {
    res.status(502).json({ error: 'SIHF-Synchronisation momentan nicht verfügbar.', message: e.message, logs })
  } finally {
    syncRunning = false
  }
})

// ---------------------------------------------------------------------------
// National-League-API-Sync (server/sync.js) - eigenständig von obigem
// SIHF-Sync: spiegelt Spiele, Tabelle und Spieler-Rohdaten der öffentlichen
// nationalleague.ch-API. Bewusst unter einem anderen Pfad (/api/sync-nl),
// damit der bestehende /api/sync-Button (SIHF-Live-Boxscores) unverändert
// funktioniert.
// ---------------------------------------------------------------------------
let nlSyncRunning = false
// SIHF-Discover-Lauf-Guard + Fehlerzähler (Log-Drosselung) - siehe
// runDiscoverSafe() im app.listen()-Callback.
let discoverRunning = false
let discoverFailStreak = 0

app.get('/api/sync-nl-status', requireAuth, (_req, res) => {
  res.json(readNlSyncStatus() || { lastRunAt: null, lastSuccessAt: null })
})

app.post('/api/sync-nl', ...requireAdminWrite, async (_req, res) => {
  if (nlSyncRunning) return res.status(409).json({ error: 'NL-Sync läuft bereits' })
  nlSyncRunning = true
  const logs = []
  try {
    // Basis-Sync UND Game-Detail-Sync laufen in EINER Schreib-Queue-Transaktion
    // (server/dbLock.js), damit dazwischen kein anderer Schreiber die DB
    // verändert. Der Game-Detail-Sync bleibt in seinem eigenen try/catch:
    // schlägt er fehl, bleibt die NL-Sync-Antwort davon unberührt.
    const { summary, gameDetailSummary } = await runExclusive(async () => {
      const summary = await runNlSync({ write: true, log: (...a) => logs.push(a.join(' ')) })
      let gameDetailSummary = null
      try {
        gameDetailSummary = await runNlGameDetailSync({ write: true, log: (...a) => logs.push(a.join(' ')) })
      } catch (e) {
        logs.push(`[NL GAME DETAIL] Fehler: ${e.message}`)
      }
      return { summary, gameDetailSummary }
    })
    refreshSnapshotSafe() // fire-and-forget: Projektion nach dem Sync auffrischen
    res.json({ ...summary, gameDetail: gameDetailSummary, logs })
  } catch (e) {
    res.status(502).json({ error: 'National-League-API momentan nicht erreichbar oder Team-Mapping fehlgeschlagen.', message: e.message, logs })
  } finally {
    nlSyncRunning = false
  }
})

// ---------------------------------------------------------------------------
// Live-Spielstand (server/liveSync.js) - eigenständig vom SIHF-Sync oben:
// schnelleres Polling (20s statt 5min), schreibt NIE in db.json/homeGoals/
// status - liefert nur den zuletzt bekannten Live-Snapshot (oder holt bei
// Bedarf einen frischen, siehe ensureFreshLiveState()). 404 = kein
// Live-Zustand für dieses Spiel bekannt (nicht live, keine sihfGameId, oder
// ausserhalb des Polling-Fensters) - kein Fehler.
// ---------------------------------------------------------------------------
// DEV-ONLY: Live-Replay eines abgeschlossenen Archiv-Spiels (server/liveReplay.js)
// zum Testen des kompletten Live-Datenflusses ohne ein aktuell laufendes
// NL-Spiel. Existiert im Produktions-Build GAR NICHT (Route wird nur bei
// NODE_ENV !== 'production' registriert) - kein Laufzeit-Flag, das versehentlich
// scharf bleiben könnte. Nutzt dieselbe parseLiveSnapshot()-Pipeline wie der
// echte Live-Endpunkt unten, NICHT dessen Cache/Poller (deterministisch pro
// Request, kein In-Flight-Lock/SIHF-Request nötig).
if (process.env.NODE_ENV !== 'production') {
  const { buildReplayLiveState } = await import('./liveReplay.js')
  app.get('/api/dev/live-replay', (req, res) => {
    try {
      const elapsedSeconds = Number(req.query.elapsed)
      if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
        return res.status(400).json({ error: '?elapsed=<Sekunden> (Zahl >= 0) erforderlich' })
      }
      res.json(buildReplayLiveState(elapsedSeconds))
    } catch (e) {
      res.status(500).json({ error: 'Replay fehlgeschlagen', message: e.message })
    }
  })
}

// Historischer Live-Replay für ECHTE, abgeschlossene Spiele (server/liveReplay.js
// ::buildRealGameReplayState) - produktives Feature (NICHT dev-only, im
// Unterschied zum Fixture-Tool oben), siehe MatchupDetail.jsx: für
// status:'final'-Spiele mit sihfGameId bietet die UI "Spielverlauf anzeigen"
// an. `elapsed` optional - fehlt es, wird der volle Endstand geliefert
// (FULL_GAME_SENTINEL_SECONDS). Kein Fallback auf erfundene Daten: fehlt
// sihfGameId oder ist das Spiel nicht final, liefert dies einen klaren
// 4xx-Fehler statt eines geratenen Zustands.
app.get('/api/games/:gameId/replay', async (req, res) => {
  const db = readDb()
  const game = db.games.find((g) => g.id === req.params.gameId)
  if (!game) return res.status(404).json({ error: 'Spiel nicht gefunden' })
  try {
    const { buildRealGameReplayState, FULL_GAME_SENTINEL_SECONDS } = await import('./liveReplay.js')
    const elapsedSeconds = req.query.elapsed != null ? Number(req.query.elapsed) : FULL_GAME_SENTINEL_SECONDS
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
      return res.status(400).json({ error: '?elapsed=<Sekunden> (Zahl >= 0) oder weglassen für Endstand' })
    }
    const liveState = await buildRealGameReplayState(game, elapsedSeconds, { log: (...a) => console.log('[REPLAY]', ...a) })
    res.json(liveState)
  } catch (e) {
    res.status(422).json({ error: 'Historischer Replay für dieses Spiel nicht möglich', message: e.message })
  }
})

// Vollständige historische Zeitreihe (server/liveReplay.js::buildRealGameReplayTimeline)
// für die grosse Live-Win-Probability-Kurve - EIN Request liefert die
// komplette Snapshot-Serie über das ganze Spiel (regelmässiges Raster +
// jeder echte Tor-Zeitpunkt), das Frontend berechnet daraus über die
// UNVERÄNDERTE liveProbability.js die vollständige probabilityHistory
// (siehe src/liveGameClient.js::useGameReplayTimeline).
app.get('/api/games/:gameId/replay/timeline', async (req, res) => {
  const db = readDb()
  const game = db.games.find((g) => g.id === req.params.gameId)
  if (!game) return res.status(404).json({ error: 'Spiel nicht gefunden' })
  try {
    const { buildRealGameReplayTimeline } = await import('./liveReplay.js')
    const timeline = await buildRealGameReplayTimeline(game, { log: (...a) => console.log('[REPLAY]', ...a) })
    res.json(timeline)
  } catch (e) {
    res.status(422).json({ error: 'Historischer Replay für dieses Spiel nicht möglich', message: e.message })
  }
})

app.get('/api/games/:gameId/live', async (req, res) => {
  const db = readDb()
  const game = db.games.find((g) => g.id === req.params.gameId)
  if (!game) return res.status(404).json({ error: 'Spiel nicht gefunden' })
  try {
    const liveState = await ensureFreshLiveState(game, { log: (...a) => console.log('[LIVE SYNC]', ...a) })
    if (!liveState) return res.status(404).json({ error: 'Kein Live-Zustand für dieses Spiel verfügbar' })
    res.json(liveState)
  } catch (e) {
    res.status(502).json({ error: 'SIHF momentan nicht erreichbar.', message: e.message })
  }
})

// Übersicht ALLER aktuell laufenden Spiele (Dashboard "Live jetzt") - liest
// ausschliesslich den bestehenden Live-Cache (server/liveSync.js::
// getAllLiveStates), löst selbst KEINEN zusätzlichen SIHF-Request aus. Der
// Hintergrund-Poller unten (pollLiveGames) füllt diesen Cache ohnehin
// bereits alle LIVE_POLL_INTERVAL_MS für jedes Spiel in seinem Zeitfenster -
// das Dashboard braucht deshalb nur EINEN Request statt eines eigenen
// useLiveGame()-Polls pro einzelnem Spiel.
app.get('/api/live-games', (req, res) => {
  res.json(getAllLiveStates())
})

// ---------------------------------------------------------------------------
// Backup / Import / Reset
// ---------------------------------------------------------------------------
app.get('/api/export', requireAuth, (_req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="nl-backup.json"')
  res.json(readDb())
})

app.post('/api/import', ...requireAdminWrite, async (req, res) => {
  const incoming = req.body
  if (!incoming || !Array.isArray(incoming.teams)) {
    return res.status(400).json({ error: 'Ungültiges Backup-Format' })
  }
  try {
    const db = await runExclusive(() => {
      writeDb({ ...emptyDb(), ...incoming })
      return readDb()
    })
    res.json(db)
  } catch (e) {
    res.status(500).json({ error: 'Import fehlgeschlagen', message: e.message })
  }
})

app.post('/api/reset', ...requireAdminWrite, async (req, res) => {
  // keepTeams=true behält Teams & Spieler, löscht nur Spiele.
  const keepTeams = req.body && req.body.keepTeams
  try {
    const db = await runExclusive(() => {
      if (keepTeams) {
        const d = readDb()
        d.games = []
        writeDb(d)
        return d
      }
      const seed = fs.existsSync(SEED_PATH)
        ? JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'))
        : emptyDb()
      writeDb(seed)
      return readDb()
    })
    res.json(db)
  } catch (e) {
    res.status(500).json({ error: 'Reset fehlgeschlagen', message: e.message })
  }
})

// ---------------------------------------------------------------------------
// Admin-Systemstatus: Kennzahlen + Datenquellen-/Sync-Status für das
// Admin-Dashboard. Nur für angemeldete Admins.
// ---------------------------------------------------------------------------
app.get('/api/admin/system', requireAuth, (_req, res) => {
  try {
    const db = readDb()
    const games = db.games || []
    const played = games.filter((g) => g.status === 'final').length
    const nl = readNlSyncStatus() || {}
    const sihf = readSyncStatus() || {}
    const snap = db.projectionSnapshot || null
    res.json({
      counts: {
        teams: (db.teams || []).length,
        players: (db.players || []).length,
        gamesTotal: games.length,
        gamesPlayed: played,
        gamesOpen: games.length - played,
        predictions: (db.predictions || []).length,
      },
      sync: {
        nl: { lastRunAt: nl.lastRunAt || null, lastSuccessAt: nl.lastSuccessAt || null, lastError: nl.lastError || null },
        sihf: { lastRunAt: sihf.lastRunAt || null, lastSuccessAt: sihf.lastSuccessAt || null, lastError: sihf.lastError || null },
      },
      projectionSnapshot: snap ? { computedAt: snap.computedAt, runs: snap.runs, scheduledCount: snap.scheduledCount } : null,
      runtime: {
        nodeEnv: process.env.NODE_ENV || 'development',
        uptimeSec: Math.round(process.uptime()),
        persistDir: PERSIST_DIR,
      },
    })
  } catch (e) {
    res.status(500).json({ error: 'Systemstatus nicht verfügbar', message: e.message })
  }
})

// ---------------------------------------------------------------------------
// Produktionsmodus: gebautes Frontend (dist/, `npm run build`/`npm run serve`)
// als statische Dateien ausliefern, damit die App als EIN Prozess unter EINEM
// Port läuft (kein separater Vite-Dev-Prozess nötig). Rein additiv - im
// Dev-Modus (`npm run dev`) existiert dist/ meist nicht oder ist veraltet;
// dort bedient ohnehin der Vite-Dev-Server (Port 5173) das Frontend und
// proxyt /api/* hierher (vite.config.js, unverändert). Registriert NACH allen
// /api/*-Routen oben, damit diese unverändert Vorrang haben; der
// SPA-Fallback (unbekannte, nicht-/api-Routen -> index.html, für
// React-Router-Deep-Links wie /players/xyz) schliesst /api/* explizit aus,
// damit ein Tippfehler in einer API-Route sauber 404 statt index.html liefert.
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

app.listen(PORT, () => {
  ensureDb()
  console.log(`\n  NL Tracker API läuft auf http://localhost:${PORT}`)
  console.log(`  Daten: ${DB_PATH}\n`)

  // Kontrollierter, SCHREIBFREIER Erststart (für den Render-Persistenz-Restore):
  // BOOT_SKIP_SYNC=1 unterdrückt beim Start ALLE automatischen Jobs, die
  // db.json verändern könnten - den unbedingten Start-NL-Sync (pollNl), den
  // SIHF-Auto-Discover und den SIHF-Auto-Sync - sowie das Live-Polling. So
  // kann nach einem Deploy mit leerer Disk zuerst das Backup per
  // POST /api/import eingespielt werden, ohne dass ein parallel laufender Job
  // den Import überschreibt (siehe render.yaml/Restore-Ablauf).
  //
  // WICHTIG: Die MANUELLEN Endpunkte bleiben BEWUSST aktiv - BOOT_SKIP_SYNC
  // schaltet NUR die automatischen Startjobs ab, NICHT POST /api/sync,
  // /api/sync-nl, /api/import oder /api/reset. Während des Restore-Fensters
  // darf daher ausser dem Import selbst niemand einen dieser Endpunkte
  // auslösen. Ohne BOOT_SKIP_SYNC (bzw. BOOT_SKIP_SYNC != '1') bleibt das
  // bisherige Startverhalten exakt unverändert.
  const bootSkipSync = process.env.BOOT_SKIP_SYNC === '1'
  if (bootSkipSync) {
    console.log('  ⏸ BOOT_SKIP_SYNC=1 - automatische Start-Jobs (NL-Sync, SIHF-Discover, SIHF-Sync, Live-Poll) deaktiviert. Manuelle /api/*-Endpunkte bleiben aktiv.')
  }

  // Automatischer SIHF-Poll: standardmässig AN (Dauerbetrieb, siehe `npm run
  // serve`/README) - alle 5 Minuten während der Saison. Abschaltbar mit
  // SIHF_AUTO_SYNC=0, Intervall überschreibbar mit SIHF_SYNC_INTERVAL_MIN.
  if (!bootSkipSync && process.env.SIHF_AUTO_SYNC !== '0') {
    const intervalMs = (Number(process.env.SIHF_SYNC_INTERVAL_MIN) || 5) * 60 * 1000
    console.log(`  SIHF-Auto-Sync aktiv (alle ${intervalMs / 60000} Min.)`)
    const poll = () => {
      if (syncRunning) return
      syncRunning = true
      runExclusive(() => runSihfSync({ write: true, log: (...a) => console.log('[SIHF SYNC]', ...a) }))
        .then(() => refreshSnapshotSafe())
        .catch((e) => console.error('[SIHF SYNC] Fehler:', e.message))
        .finally(() => { syncRunning = false })
    }
    setInterval(poll, intervalMs)
  }

  // National-League-API-Sync: läuft immer einmal beim Serverstart (fire-and-
  // forget, blockiert den Start nicht). Intervall standardmässig AN
  // (Dauerbetrieb, Default alle 30 Min., NL_SYNC_INTERVAL_MIN überschreibt) -
  // abschaltbar mit NL_AUTO_SYNC=0. Die API cacht ohnehin 10 Min. - häufigeres
  // Pollen bringt nichts (30 Min. respektiert das mit deutlichem Puffer).
  const pollNl = () => {
    if (nlSyncRunning) return
    nlSyncRunning = true
    // Basis-Sync + Game-Detail-Sync als EINE Schreib-Queue-Transaktion
    // (server/dbLock.js), damit kein paralleler Schreiber dazwischenfunkt.
    // Game-Detail läuft NUR nach erfolgreichem Basis-Sync (sonst z.B. unnötige
    // Requests, während die API insgesamt down ist).
    runExclusive(() =>
      runNlSync({ write: true, log: (...a) => console.log('[NL SYNC]', ...a) })
        .then(() => runNlGameDetailSync({ write: true, log: (...a) => console.log('[NL GAME DETAIL]', ...a) }))
    )
      .then(() => refreshSnapshotSafe())
      .catch((e) => console.error('[NL SYNC/GAME DETAIL] Fehler:', e.message))
      .finally(() => { nlSyncRunning = false })
  }
  // Unbedingter Start-NL-Sync - NUR durch BOOT_SKIP_SYNC unterdrückbar
  // (NL_AUTO_SYNC steuert weiterhin nur das Intervall unten, nicht diesen
  // einmaligen Startlauf).
  if (!bootSkipSync) pollNl()

  if (!bootSkipSync && process.env.NL_AUTO_SYNC !== '0') {
    const nlIntervalMs = (Number(process.env.NL_SYNC_INTERVAL_MIN) || DEFAULT_NL_SYNC_INTERVAL_MIN) * 60 * 1000
    console.log(`  NL-Auto-Sync aktiv (alle ${nlIntervalMs / 60000} Min.)`)
    setInterval(pollNl, nlIntervalMs)
  }

  // Live-Poller (server/liveSync.js): eigenständig vom obigen 5-Min-SIHF-Sync,
  // pollt nur Spiele innerhalb des Live-Fensters (siehe isCandidate() dort) -
  // bei 0 laufenden Spielen ist das ein billiger No-Op (leerer Filter, kein
  // Request). Abschaltbar mit LIVE_AUTO_POLL=0.
  if (!bootSkipSync && process.env.LIVE_AUTO_POLL !== '0') {
    console.log(`  Live-Auto-Poll aktiv (alle ${LIVE_POLL_INTERVAL_MS / 1000}s, nur für laufende Spiele)`)
    setInterval(() => {
      pollLiveGames(readDb(), { log: (...a) => console.log('[LIVE SYNC]', ...a) }).catch((e) => console.error('[LIVE SYNC] Fehler:', e.message))
    }, LIVE_POLL_INTERVAL_MS)
  }

  // SIHF-Discover (server/scripts/sync-sihf.cjs::runDiscover): ordnet lokalen
  // Spielen ihre SIHF-gameId zu (Matching über Datum + Heim/Gast, siehe dort)
  // und schreibt NUR dieses eine Feld in db.json - vorhandene gültige IDs
  // bleiben unangetastet (runDiscover filtert intern auf !g.sihfGameId).
  // Ohne diese ID pollt der Live-Poller oben ein Spiel nie (isCandidate() in
  // server/liveSync.js verlangt sihfGameId) - deshalb läuft Discover hier
  // automatisch: einmal beim Start (fire-and-forget, blockiert den Start
  // nicht) und danach periodisch (Default täglich). Abschaltbar mit
  // SIHF_AUTO_DISCOVER=0, Intervall überschreibbar mit
  // SIHF_DISCOVER_INTERVAL_HOURS. `discoverRunning` verhindert parallele
  // Läufe, falls ein Lauf länger dauert als das Intervall; ein Fehler lässt
  // Server und Live-Poller unberührt (eigener catch-Pfad). Wiederholte Fehler
  // werden nach den ersten Vorkommen unterdrückt (discoverFailStreak), um die
  // Logs nicht zu fluten.
  const runDiscoverSafe = () => {
    if (discoverRunning) return
    discoverRunning = true
    // Saison-Endjahr wie im CLI-Einstieg (sync-sihf.cjs::main): ab Juli zählt
    // die kommende Saison, davor die laufende - bestimmt das SIHF-id-Präfix.
    const now = new Date()
    const seasonEndYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
    console.log('[SIHF DISCOVER] Start')
    runExclusive(() => runSihfDiscover({ write: true, log: (...a) => console.log('[SIHF DISCOVER]', ...a), seasonEndYear }))
      .then((r) => {
        discoverFailStreak = 0
        console.log(`[SIHF DISCOVER] Fertig: ${r.matched} neu zugeordnet (${r.checked} geprüft)`)
      })
      .catch((e) => {
        discoverFailStreak++
        if (discoverFailStreak <= 3) console.error(`[SIHF DISCOVER] Fehler: ${e.message}`)
        else if (discoverFailStreak === 4) console.error('[SIHF DISCOVER] weitere Fehler werden bis zum nächsten Erfolg unterdrückt')
      })
      .finally(() => { discoverRunning = false })
  }

  if (!bootSkipSync && process.env.SIHF_AUTO_DISCOVER !== '0') {
    const discoverIntervalMs = (Number(process.env.SIHF_DISCOVER_INTERVAL_HOURS) || 24) * 60 * 60 * 1000
    console.log(`  SIHF-Auto-Discover aktiv (beim Start + alle ${discoverIntervalMs / 3600000} h)`)
    runDiscoverSafe()
    setInterval(runDiscoverSafe, discoverIntervalMs)
  }

  // Season-Projection-Snapshot (Public Edition): beim Start einmal auffrischen
  // (verzögert, damit der initiale NL-Sync oben zuerst Daten bringt - blockiert
  // den Start nicht) und danach periodisch als Fallback. Durch BOOT_SKIP_SYNC
  // unterdrückt (Restore-Fenster schreibt nicht).
  if (!bootSkipSync) {
    const snapIntervalMs = (Number(process.env.PROJECTION_INTERVAL_MIN) || 60) * 60 * 1000
    console.log(`  Projection-Snapshot aktiv (Start + alle ${snapIntervalMs / 60000} Min.)`)
    setTimeout(() => refreshSnapshotSafe(), 20 * 1000)
    setInterval(() => refreshSnapshotSafe(), snapIntervalMs)
  }

  console.log()
})
