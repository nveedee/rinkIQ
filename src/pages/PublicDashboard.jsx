import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../DataContext.jsx'
import { api } from '../api.js'
import { isFinalGame } from '../stats.js'
import { computePowerRankings } from '../powerRankings.js'
import { compareKickoffAsc, compareKickoffDesc } from '../scheduleSort.js'
import { TeamBadge, StatTile, ProbBar } from '../components/ui.jsx'
import Disclaimer from '../components/Disclaimer.jsx'

// ---------------------------------------------------------------------------
// Öffentliche Startseite (Public Edition). Kompaktes, datenorientiertes
// Dashboard: Hero -> Saison-Kennzahlen -> Playoff-Radar + EHC-Kloten-Karte ->
// Resultate/nächste Spiele -> Power-Ranking-Vorschau -> Schnellzugriffe.
// Nutzt ausschliesslich bereits vorhandene Daten/Berechnungen (useData/derived,
// gespeicherter Projection-Snapshot, computePowerRankings) - keine neuen
// Endpunkte, keine erfundenen Werte, modellbasierte Zahlen sind gekennzeichnet.
// ---------------------------------------------------------------------------

function fmtDate(iso) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' }) } catch { return '' }
}
function fmtStand(iso) {
  if (!iso) return null
  try { return new Date(iso).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return null }
}
function pct(v, digits = 1) {
  if (v == null || Number.isNaN(v)) return '–'
  const n = v * 100
  if (n > 0 && n < 0.1) return '<0.1 %'
  return n.toFixed(digits) + ' %'
}

// Eine Spielzeile (Resultat oder kommend), klickbar zur Matchup-Seite.
function GameRow({ game, nameOf }) {
  const played = isFinalGame(game)
  const result = played
    ? `${game.homeGoals}:${game.awayGoals}${game.decision && game.decision !== 'REG' ? ` (${game.decision})` : ''}`
    : (game.time || '')
  return (
    <Link className="home-game-row" to={`/matchup/${game.id}`}>
      <span className="g-date">{fmtDate(game.date)}</span>
      <span className="g-teams">{nameOf(game.homeTeamId)} – {nameOf(game.awayTeamId)}</span>
      <strong style={{ flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{result}</strong>
    </Link>
  )
}

export default function PublicDashboard() {
  const { data, derived, teamById } = useData()
  const [stand, setStand] = useState(null)

  useEffect(() => {
    api.getPublicStatus().then((s) => setStand(s?.lastSuccessAt || null)).catch(() => {})
  }, [])

  const games = data?.games || []
  const teams = data?.teams || []
  const snapshot = data?.projectionSnapshot || null
  const standings = derived?.standings || []
  const nameOf = (id) => teamById?.(id)?.short || teamById?.(id)?.name || '?'

  const playedCount = useMemo(() => games.filter(isFinalGame).length, [games])
  const openCount = games.length - playedCount

  // Resultate (neueste zuerst) / nächste Spiele (nächstes zuerst).
  const results = useMemo(() => games.filter(isFinalGame).sort(compareKickoffDesc).slice(0, 5), [games])
  const upcoming = useMemo(() => games.filter((g) => !isFinalGame(g)).sort(compareKickoffAsc).slice(0, 5), [games])

  // Meisterwahrscheinlichkeiten aus dem gespeicherten Snapshot (Modell).
  const championTop = useMemo(() => {
    if (!snapshot?.rows) return []
    return [...snapshot.rows].sort((a, b) => b.pChampion - a.pChampion).slice(0, 5)
  }, [snapshot])

  // Grösste ELO-Bewegung der letzten 5 Spiele (nur wenn tatsächlich Spiele da).
  const eloMover = useMemo(() => {
    const ranking = derived?.elo?.ranking || []
    let best = null
    for (const r of ranking) {
      if (r.games > 0 && (!best || Math.abs(r.deltaLast5) > Math.abs(best.deltaLast5))) best = r
    }
    return best && best.deltaLast5 !== 0 ? best : null
  }, [derived])

  // Power-Ranking-Vorschau (Top 5) - dieselbe Berechnung wie /power.
  const powerTop = useMemo(() => {
    if (!teams.length || !derived?.elo?.ratings) return []
    try {
      return computePowerRankings(teams, games, derived.elo.ratings, data?.players || []).slice(0, 5)
    } catch { return [] }
  }, [teams, games, derived, data])

  // EHC Kloten dynamisch (kein fest codierter Wert) - gleiche Datenquellen.
  const kloten = useMemo(() => {
    const team = teams.find((t) => t.short === 'KLO') || teams.find((t) => /kloten/i.test(t.name || ''))
    if (!team) return null
    const idx = standings.findIndex((r) => r.team.id === team.id)
    const standing = idx >= 0 ? standings[idx] : null
    const teamGames = games.filter((g) => g.homeTeamId === team.id || g.awayTeamId === team.id)
    const last = teamGames.filter(isFinalGame).sort(compareKickoffDesc)[0] || null
    const next = teamGames.filter((g) => !isFinalGame(g)).sort(compareKickoffAsc)[0] || null
    const snapRow = snapshot?.rows?.find((r) => r.teamId === team.id) || null
    return { team, standing, rank: idx >= 0 ? idx + 1 : null, last, next, snapRow }
  }, [teams, standings, games, snapshot])

  const leader = standings[0] || null
  const topChampion = championTop[0] || null
  const standLabel = fmtStand(stand)
  const seasonName = data?.settings?.seasonName || 'National League 2026/27'

  return (
    <section className="home">
      {/* 1) Hero */}
      <div className="card card-pad home-hero">
        <div className="home-hero-left">
          <h1 className="home-hero-title">
            <img className="home-hero-logo" src="/rinkiq-logo-wide.png" alt="RinkIQ" width="420" height="140" />
            <span className="chip home-hero-season">{seasonName}</span>
          </h1>
          <p className="home-hero-sub">
            Datengetriebene Analysen zur Schweizer National League: Tabelle, ELO-
            und Power-Rankings, Spielprognosen und modellierte Playoff-
            Wahrscheinlichkeiten – alles auf einen Blick.
          </p>
          {standLabel && <div className="home-hero-meta muted">Datenstand: <strong>{standLabel}</strong></div>}
          <div className="home-hero-cta">
            <Link className="btn primary" to="/standings">Tabelle ansehen</Link>
            <Link className="btn" to="/playoff-odds">Prognosen entdecken</Link>
          </div>
        </div>
      </div>

      {/* 2) Kennzahlen (nur zuverlässig verfügbare Werte) */}
      <div className="tiles home-kpis">
        <StatTile label="Spiele gespielt" value={playedCount} hint={`${openCount} offen · ${games.length} total`} />
        {leader && <StatTile label="Tabellenführer" value={leader.team.short} hint={`${leader.pts} Pkt · ${leader.gd > 0 ? '+' : ''}${leader.gd} Diff`} accent />}
        {topChampion && teamById?.(topChampion.teamId) && (
          <StatTile label="Top-Meisterchance (Modell)" value={teamById(topChampion.teamId).short} hint={`${pct(topChampion.pChampion)} · Prognose`} />
        )}
        {eloMover && (
          <StatTile label="Grösste ELO-Bewegung" value={eloMover.team.short} hint={`${eloMover.deltaLast5 > 0 ? '+' : ''}${eloMover.deltaLast5} · letzte 5 Spiele`} />
        )}
      </div>

      {/* 3) Playoff-Radar + EHC Kloten */}
      <div className="grid grid-2 home-section-gap">
        {/* Playoff-Radar */}
        <div className="card card-pad">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div className="section-label" style={{ margin: 0 }}>Playoff-Radar</div>
            <Link className="muted" to="/playoff-odds" style={{ fontSize: 12 }}>Alle Odds →</Link>
          </div>
          {championTop.length === 0 ? (
            <div className="muted" style={{ fontSize: 12.5 }}>Meisterwahrscheinlichkeiten werden berechnet, sobald genügend Spiele vorliegen.</div>
          ) : (
            <>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>Meisterwahrscheinlichkeit (Modell)</div>
              {championTop.map((r) => {
                const t = teamById?.(r.teamId)
                return (
                  <div className="home-radar-row" key={r.teamId}>
                    <span className="radar-team">{t ? <TeamBadge team={t} short link={false} /> : r.teamId}</span>
                    <span className="radar-bar"><ProbBar value={r.pChampion} color="var(--bracket-champion)" /></span>
                  </div>
                )
              })}
              <Disclaimer compact />
            </>
          )}
        </div>

        {/* EHC Kloten */}
        {kloten ? (
          <div className="card card-pad home-kloten">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <TeamBadge team={kloten.team} link={false} />
              <Link className="muted" to={`/teams/${kloten.team.id}`} style={{ fontSize: 12 }}>Team →</Link>
            </div>
            {kloten.standing ? (
              <>
                <div className="home-kv"><span className="k">Rang</span><strong>{kloten.rank}.</strong></div>
                <div className="home-kv"><span className="k">Punkte</span><strong>{kloten.standing.pts}</strong></div>
                <div className="home-kv"><span className="k">Tordifferenz</span><strong>{kloten.standing.gd > 0 ? '+' : ''}{kloten.standing.gd}</strong></div>
              </>
            ) : <div className="muted" style={{ fontSize: 12.5 }}>Noch keine Tabellendaten.</div>}
            {kloten.last && (
              <div className="home-kv"><span className="k">Letztes</span>
                <Link to={`/matchup/${kloten.last.id}`}>{nameOf(kloten.last.homeTeamId)} {kloten.last.homeGoals}:{kloten.last.awayGoals} {nameOf(kloten.last.awayTeamId)}</Link>
              </div>
            )}
            {kloten.next && (
              <div className="home-kv"><span className="k">Nächstes</span>
                <Link to={`/matchup/${kloten.next.id}`}>{fmtDate(kloten.next.date)} · {nameOf(kloten.next.homeTeamId)}–{nameOf(kloten.next.awayTeamId)}</Link>
              </div>
            )}
            {kloten.snapRow && (
              <div className="home-kv"><span className="k">Playoffs (Modell)</span><strong>{pct(kloten.snapRow.pPlayoffs)}</strong></div>
            )}
          </div>
        ) : (
          <div className="card card-pad"><div className="muted" style={{ fontSize: 12.5 }}>Kein Team „Kloten" in den Daten gefunden.</div></div>
        )}
      </div>

      {/* 4) Letzte Resultate + Nächste Spiele */}
      <div className="grid grid-2 home-section-gap">
        <div className="card card-pad">
          <div className="section-label" style={{ marginTop: 0 }}>Letzte Resultate</div>
          {results.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>Noch keine gespielten Partien.</div>
            : results.map((g) => <GameRow key={g.id} game={g} nameOf={nameOf} />)}
        </div>
        <div className="card card-pad">
          <div className="section-label" style={{ marginTop: 0 }}>Nächste Spiele</div>
          {upcoming.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>Keine angesetzten Partien.</div>
            : upcoming.map((g) => <GameRow key={g.id} game={g} nameOf={nameOf} />)}
        </div>
      </div>

      {/* 5) Power-Ranking-Vorschau */}
      {powerTop.length > 0 && (
        <div className="card card-pad home-section-gap">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div className="section-label" style={{ margin: 0 }}>Power Ranking</div>
            <Link className="muted" to="/power" style={{ fontSize: 12 }}>Vollständig →</Link>
          </div>
          {powerTop.map((r, i) => (
            <div className="home-radar-row" key={r.team.id}>
              <span className="muted" style={{ flex: '0 0 18px' }}>{i + 1}</span>
              <span className="radar-team" style={{ flex: '0 0 110px' }}><TeamBadge team={r.team} short link={false} /></span>
              <span className="radar-bar"><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(r.powerScore, 100)}%` }} /></div></span>
              <strong style={{ flex: '0 0 auto', fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{r.powerScore}</strong>
            </div>
          ))}
        </div>
      )}

      {/* 6) Schnellzugriffe */}
      <div className="card card-pad home-section-gap">
        <div className="section-label" style={{ marginTop: 0 }}>Entdecken</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link className="btn ghost sm" to="/standings">Tabelle</Link>
          <Link className="btn ghost sm" to="/schedule">Spielplan & Prognosen</Link>
          <Link className="btn ghost sm" to="/playoff-odds">Playoff-Wahrscheinlichkeiten</Link>
          <Link className="btn ghost sm" to="/elo">ELO</Link>
          <Link className="btn ghost sm" to="/power">Power Ranking</Link>
          <Link className="btn ghost sm" to="/players">Spieler</Link>
          <Link className="btn ghost sm" to="/goalies">Torhüter</Link>
          <Link className="btn ghost sm" to="/teams">Teams</Link>
          <Link className="btn ghost sm" to="/head-to-head">H2H</Link>
        </div>
      </div>
    </section>
  )
}
