// ---------------------------------------------------------------------------
// Topscorers-Seite (/topscorers) - Ranking nach den Fantasy-Punkten des
// offiziellen "Topscorers"-Spiels von nationalleague.ch. Datenquelle sind die
// pro Spieler von der NL-API gelieferten Felder topscorerPoints /
// topscorerPointAverage / marktwert (siehe server/sync.js) - NICHT die
// Hockey-Punkte (G+A).
//
// Zusätzlich: Preis-/Leistung (P/Mio), eine transparente Kauf-/Verkauf-
// Empfehlung (src/topscorerAdvice.js) aus Form + Team-Form + Marktwert-Trend +
// Effizienz, sowie die Integration des eigenen Topscorers-Teams
// (settings.topscorerRoster, persistiert über PUT /api/settings).
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../DataContext.jsx'
import { useAuth } from '../authContext.jsx'
import { TeamBadge, SortableTable, MarketValueTrend, SectionHeader, Empty } from '../components/ui.jsx'
import { fmtChf, computeTeamForm } from '../stats.js'
import { computeMarketValueChange } from '../marketValueHistory.js'
import { buildPlayerAdvice, adviceReasons, VERDICT_LABEL } from '../topscorerAdvice.js'

const posLabel = { G: 'G', D: 'D', F: 'F' }
const MIN_GP_OPTIONS = [0, 3, 5, 10]
const BARGAIN_MIN_GP = 5 // gegen 1-2-Spiele-Ausreisser bei der Effizienz
const FORM_WINDOW = 5 // letzte n Spiele für die persönliche Form
const VALUE_WINDOW_DAYS = 14 // Zeitfenster für die Marktwert-Trend-Komponente

function normalizeSearch(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
function fmtInt(v) { return v == null ? '–' : Math.round(v).toLocaleString('de-CH') }
function pointsPerMillion(p) {
  return p.marketValue > 0 && p.topscorerPoints != null ? p.topscorerPoints / (p.marketValue / 1e6) : null
}
function median(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Kauf-/Verkauf-Badge (farbcodiert). Neutral = Halten.
const VERDICT_STYLE = {
  buy: { bg: 'var(--good)', fg: '#06240f', bd: 'var(--good)' },
  sell: { bg: 'var(--bad)', fg: '#2a0606', bd: 'var(--bad)' },
  hold: { bg: 'transparent', fg: 'var(--muted)', bd: 'var(--border)' },
  unknown: { bg: 'transparent', fg: 'var(--muted)', bd: 'var(--border)' },
}
function AdviceBadge({ advice, title }) {
  const v = advice?.verdict || 'unknown'
  const st = VERDICT_STYLE[v]
  return (
    <span
      title={title}
      style={{
        fontWeight: 800, fontSize: 11.5, padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap',
        background: st.bg, color: st.fg, border: `1px solid ${st.bd}`,
      }}
    >
      {VERDICT_LABEL[v]}
    </span>
  )
}

export default function Topscorers() {
  const { data, derived } = useData()
  const { isAdmin } = useAuth()
  const [teamFilter, setTeamFilter] = useState('all')
  const [posFilter, setPosFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [minGp, setMinGp] = useState(5)

  const teamMap = useMemo(() => Object.fromEntries(data.teams.map((t) => [t.id, t])), [data.teams])
  const statById = useMemo(() => Object.fromEntries(derived.playerStats.map((s) => [s.player.id, s])), [derived.playerStats])
  const gpOf = (p) => statById[p.id]?.gp ?? 0

  const pool = useMemo(
    () => data.players.filter((p) => typeof p.topscorerPoints === 'number'),
    [data.players]
  )

  // Team-Form (Ø Punkte 0-3 über die letzten 5 Spiele) je Team - einmal für
  // die ganze Liga, nicht pro Spielerzeile neu berechnet.
  const teamAvgPtsById = useMemo(() => {
    const m = {}
    for (const t of data.teams) m[t.id] = computeTeamForm(t.id, data.games, 5).avgPts
    return m
  }, [data.teams, data.games])

  // Liga-Median der Punkte/Mio - Referenz für die Effizienz-Komponente.
  const medianPpm = useMemo(
    () => median(pool.map(pointsPerMillion).filter((v) => v != null)),
    [pool]
  )

  // Kauf-/Verkauf-Empfehlung je Spieler (src/topscorerAdvice.js). Transparente
  // Heuristik, kein backgetestetes Modell.
  const adviceById = useMemo(() => {
    const m = {}
    for (const p of pool) {
      const valueDeltaPct = computeMarketValueChange(p.marketValueHistory, VALUE_WINDOW_DAYS)?.deltaPct ?? null
      m[p.id] = buildPlayerAdvice(p, {
        games: data.games,
        teamAvgPts: teamAvgPtsById[p.teamId] ?? null,
        valueDeltaPct,
        ppm: pointsPerMillion(p),
        medianPpm,
        formN: FORM_WINDOW,
      })
    }
    return m
  }, [pool, data.games, teamAvgPtsById, medianPpm])

  const filtered = useMemo(() => {
    let rows = pool
    if (teamFilter !== 'all') rows = rows.filter((p) => p.teamId === teamFilter)
    if (posFilter !== 'all') rows = rows.filter((p) => p.position === posFilter)
    if (minGp > 0) rows = rows.filter((p) => (statById[p.id]?.gp ?? 0) >= minGp)
    const q = normalizeSearch(query)
    if (q) rows = rows.filter((p) => {
      const team = teamMap[p.teamId]
      return normalizeSearch(p.name).includes(q)
        || normalizeSearch(team?.name).includes(q)
        || normalizeSearch(team?.short).includes(q)
    })
    return rows
  }, [pool, teamFilter, posFilter, minGp, query, teamMap, statById])

  const ranked = useMemo(() => {
    const arr = [...filtered].sort((a, b) =>
      (b.topscorerPoints ?? -1) - (a.topscorerPoints ?? -1) || (b.marketValue ?? -1) - (a.marketValue ?? -1)
    )
    return arr.map((p, i) => ({ player: p, rank: i + 1, stat: statById[p.id], ppm: pointsPerMillion(p), advice: adviceById[p.id] }))
  }, [filtered, statById, adviceById])

  const bargains = useMemo(() => {
    const eligible = pool.filter((p) => gpOf(p) >= BARGAIN_MIN_GP && pointsPerMillion(p) != null)
    return [...eligible].sort((a, b) => pointsPerMillion(b) - pointsPerMillion(a)).slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, statById])

  const topPts = useMemo(() => pool.reduce((m, p) => (p.topscorerPoints > (m?.topscorerPoints ?? -1) ? p : m), null), [pool])
  const topVal = useMemo(() => {
    const withMv = pool.filter((p) => p.marketValue != null)
    return withMv.reduce((m, p) => (p.marketValue > (m?.marketValue ?? -1) ? p : m), null)
  }, [pool])

  const nameCell = (r) => (
    <span className="row gap-sm">
      <Link to={`/players/${r.player.id}`}>{r.player.name}</Link>
      {r.player.number != null && r.player.number !== '' && <span className="muted">#{r.player.number}</span>}
    </span>
  )

  const columns = [
    { key: 'rank', label: '#', num: true, noSort: true, render: (r) => <span className="rank">{r.rank}</span> },
    { key: 'name', label: 'Spieler', left: true, noSort: true, render: nameCell },
    { key: 'team', label: 'Team', left: true, noSort: true, render: (r) => <TeamBadge team={teamMap[r.player.teamId]} short /> },
    { key: 'pos', label: 'Pos.', left: true, noSort: true, render: (r) => <span className="chip">{posLabel[r.player.position] || r.player.position}</span> },
    { key: 'gp', label: 'GP', num: true, title: 'Gespielte Spiele (laufende Saison)', value: (r) => r.stat?.gp ?? -1, render: (r) => r.stat?.gp ?? <span className="muted">–</span> },
    {
      key: 'topscorerPoints', label: 'TS-Punkte', num: true,
      title: 'Punkte im Topscorers-Spiel von nationalleague.ch',
      value: (r) => r.player.topscorerPoints ?? -1,
      render: (r) => <strong>{fmtInt(r.player.topscorerPoints)}</strong>,
    },
    {
      key: 'topscorerPointAverage', label: 'Ø/Spiel', num: true,
      title: 'Durchschnittliche Topscorer-Punkte pro Spiel (laut nationalleague.ch)',
      value: (r) => r.player.topscorerPointAverage ?? -1,
      render: (r) => fmtInt(r.player.topscorerPointAverage),
    },
    {
      key: 'marketValue', label: 'Spielerwert', num: true,
      title: 'Marktwert im Topscorers-Spiel (CHF) · Quelle: nationalleague.ch',
      value: (r) => r.player.marketValue ?? -1,
      render: (r) => r.player.marketValue == null ? <span className="muted">–</span> : (
        <span className="row gap-sm" style={{ justifyContent: 'flex-end' }}>
          CHF {fmtChf(r.player.marketValue)}
          <MarketValueTrend trend={r.player.marketValueTrend} />
        </span>
      ),
    },
    {
      key: 'ppm', label: 'P/Mio', num: true,
      title: 'Preis-/Leistung: Topscorer-Punkte pro Mio CHF Marktwert (höher = günstiger für seine Punkte)',
      value: (r) => r.ppm ?? -1,
      render: (r) => r.ppm == null ? <span className="muted">–</span> : <strong>{fmtInt(r.ppm)}</strong>,
    },
    {
      key: 'advice', label: 'Empfehlung', num: true,
      title: 'Heuristik aus Form + Team-Form + Marktwert-Trend + Effizienz (keine Prognose-Garantie)',
      value: (r) => r.advice?.score ?? -2,
      render: (r) => (
        <span style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
          <AdviceBadge advice={r.advice} title={adviceReasons(r.advice?.signals || {}, r.advice).join(' · ') || 'Zu wenig Daten'} />
        </span>
      ),
    },
  ]

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Topscorers</h1>
          <div className="sub">Fantasy-Ranking aus dem Topscorers-Spiel · nationalleague.ch</div>
        </div>
      </div>

      <div className="card mb" style={{ padding: '10px 16px' }}>
        <div className="stat-strip">
          <div className="stat"><strong>{pool.length}</strong><span>Spieler mit Punktewert</span></div>
          {topPts && <div className="stat"><strong>{fmtInt(topPts.topscorerPoints)}</strong><span>Höchste Punkte ({topPts.name})</span></div>}
          {topVal && <div className="stat"><strong>CHF {fmtChf(topVal.marketValue)}</strong><span>Höchster Wert ({topVal.name})</span></div>}
        </div>
      </div>

      {/* Persönlicher Topscorer-Kader: privat (schreibt settings) - nur Admin. */}
      {isAdmin && <MyTeam adviceById={adviceById} teamMap={teamMap} statById={statById} />}

      {bargains.length > 0 && (
        <>
          <SectionHeader
            title="Schnäppchen – beste Punkte pro Mio"
            caption={`Meiste Topscorer-Punkte pro investierter Mio CHF (nur Spieler mit ≥ ${BARGAIN_MIN_GP} Spielen, damit keine 1-2-Spiele-Ausreisser verzerren).`}
          />
          <div className="insights-grid mb">
            {bargains.map((p) => (
              <Link key={p.id} to={`/players/${p.id}`} className="insight-card">
                <div className="insight-label">{fmtInt(pointsPerMillion(p))} P/Mio</div>
                <div className="insight-name">{p.name}</div>
                <div className="insight-value good">{fmtInt(p.topscorerPoints)} Pkt · CHF {fmtChf(p.marketValue)}</div>
              </Link>
            ))}
          </div>
        </>
      )}

      <SectionHeader
        title="Ranking"
        caption="Standardmässig nach Topscorer-Punkten sortiert - per Klick auf „Empfehlung“, „P/Mio“ oder „Spielerwert“ umsortieren."
      />
      <div className="card card-pad mb">
        <div className="row gap-sm wrap">
          <input
            type="text" placeholder="Spieler oder Team suchen…" value={query}
            onChange={(e) => setQuery(e.target.value)} style={{ width: 200 }}
          />
          <select style={{ width: 'auto' }} value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="all">Alle Teams</option>
            {[...data.teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select style={{ width: 'auto' }} value={posFilter} onChange={(e) => setPosFilter(e.target.value)}>
            <option value="all">Alle Positionen</option>
            <option value="F">Stürmer</option>
            <option value="D">Verteidiger</option>
            <option value="G">Torhüter</option>
          </select>
          <select style={{ width: 'auto' }} value={minGp} onChange={(e) => setMinGp(Number(e.target.value))} title="Mindestanzahl Spiele (gegen Kleinstichproben bei P/Mio)">
            {MIN_GP_OPTIONS.map((n) => <option key={n} value={n}>{n === 0 ? 'Alle Spiele' : `≥ ${n} Spiele`}</option>)}
          </select>
        </div>
      </div>

      {ranked.length === 0 ? (
        <Empty
          title={query ? 'Keine Treffer' : 'Noch keine Topscorer-Daten'}
          hint={query ? 'Andere Suche versuchen.' : 'Filter lockern oder abwarten, bis der Sync die Topscorer-Werte geladen hat.'}
        />
      ) : (
        <div className="card mb">
          <SortableTable
            columns={columns}
            rows={ranked}
            initialSort="topscorerPoints"
            initialDir="desc"
            rowKey={(r) => r.player.id}
            pageSize={50}
            wrapClassName="ranking-scroll"
          />
        </div>
      )}
    </>
  )
}

// "Mein Team": der eigene Topscorers-Kader (settings.topscorerRoster, Array
// von player.id), persistiert über PUT /api/settings. Zeigt pro Spieler die
// Empfehlung + Kurzbegründung und eine Kader-Zusammenfassung (wen verkaufen,
// Gesamtwert). Editierbar per Suche (hinzufügen) und Entfernen-Button.
function MyTeam({ adviceById, teamMap, statById }) {
  const { data, api, refresh } = useData()
  const [addQuery, setAddQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const roster = Array.isArray(data.settings?.topscorerRoster) ? data.settings.topscorerRoster : []
  const playerById = useMemo(() => Object.fromEntries(data.players.map((p) => [p.id, p])), [data.players])
  const rosterPlayers = roster.map((id) => playerById[id]).filter(Boolean)

  const save = async (ids) => {
    setBusy(true)
    try { await api.updateSettings({ topscorerRoster: ids }); await refresh() }
    finally { setBusy(false) }
  }
  const add = (id) => { if (!roster.includes(id)) { save([...roster, id]); setAddQuery('') } }
  const remove = (id) => save(roster.filter((x) => x !== id))

  const addMatches = useMemo(() => {
    const q = normalizeSearch(addQuery)
    if (q.length < 2) return []
    return data.players
      .filter((p) => !roster.includes(p.id) && normalizeSearch(p.name).includes(q))
      .slice(0, 6)
  }, [addQuery, data.players, roster])

  const summary = useMemo(() => {
    let value = 0, points = 0, buy = 0, hold = 0, sell = 0
    for (const p of rosterPlayers) {
      value += p.marketValue || 0
      points += p.topscorerPoints || 0
      const v = adviceById[p.id]?.verdict
      if (v === 'buy') buy++; else if (v === 'sell') sell++; else hold++
    }
    return { value, points, buy, hold, sell }
  }, [rosterPlayers, adviceById])

  const sorted = [...rosterPlayers].sort((a, b) => (adviceById[a.id]?.score ?? -2) - (adviceById[b.id]?.score ?? -2))

  return (
    <>
      <SectionHeader
        title="Mein Topscorers-Team"
        caption="Deine Spieler mit Kauf-/Verkauf-Empfehlung aus Form, Team-Form, Marktwert-Trend und Preis-Effizienz. Heuristik, keine Garantie."
      />
      <div className="card card-pad mb">
        <div className="row gap-sm wrap" style={{ alignItems: 'center', marginBottom: rosterPlayers.length ? 12 : 0 }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text" placeholder="Spieler hinzufügen…" value={addQuery}
              onChange={(e) => setAddQuery(e.target.value)} style={{ width: 220 }} disabled={busy}
            />
            {addMatches.length > 0 && (
              <div className="card" style={{ position: 'absolute', zIndex: 5, top: '100%', left: 0, minWidth: 240, marginTop: 4, padding: 4 }}>
                {addMatches.map((p) => (
                  <button key={p.id} className="row spread" style={{ width: '100%', background: 'none', border: 'none', padding: '6px 8px', cursor: 'pointer', textAlign: 'left' }} onClick={() => add(p.id)}>
                    <span>{p.name}</span>
                    <span className="muted" style={{ fontSize: 11 }}>{teamMap[p.teamId]?.short} · {posLabel[p.position]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {rosterPlayers.length > 0 && (
            <div className="muted" style={{ fontSize: 12.5 }}>
              {rosterPlayers.length} Spieler · Gesamtwert CHF {fmtChf(summary.value)} · {fmtInt(summary.points)} Punkte ·{' '}
              <span style={{ color: 'var(--good)' }}>{summary.buy} kaufen</span> / {summary.hold} halten /{' '}
              <span style={{ color: 'var(--bad)' }}>{summary.sell} verkaufen</span>
            </div>
          )}
        </div>

        {rosterPlayers.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>Noch keine Spieler erfasst – oben per Suche hinzufügen.</div>
        ) : (
          <div>
            {sorted.map((p) => {
              const advice = adviceById[p.id]
              const reasons = adviceReasons(advice?.signals || {}, advice)
              return (
                <div key={p.id} className="row spread" style={{ padding: '9px 0', borderBottom: '1px solid var(--border)', gap: 10, alignItems: 'center' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row gap-sm" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                      <Link to={`/players/${p.id}`} style={{ fontWeight: 700 }}>{p.name}</Link>
                      <TeamBadge team={teamMap[p.teamId]} short />
                      <span className="chip">{posLabel[p.position] || p.position}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                      {fmtInt(p.topscorerPoints)} Pkt · CHF {fmtChf(p.marketValue)} <MarketValueTrend trend={p.marketValueTrend} />
                      {reasons.length > 0 && <> · {reasons.join(' · ')}</>}
                    </div>
                  </div>
                  <span className="row gap-sm" style={{ flex: 'none', alignItems: 'center' }}>
                    <AdviceBadge advice={advice} />
                    <button
                      onClick={() => remove(p.id)} disabled={busy} title="Aus meinem Team entfernen"
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', padding: '2px 8px', fontSize: 14, lineHeight: 1 }}
                    >×</button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
