import LegalLayout from '../../components/LegalLayout.jsx'

// Quellen & Methodik - dokumentiert die im Code tatsächlich vorhandenen
// Datenquellen und Berechnungen.
export default function QuellenMethodik() {
  return (
    <LegalLayout title="Quellen & Methodik" updated="28.10.2026"
      intro="Transparenz darüber, welche Daten RinkIQ verwendet und wie die Kennzahlen entstehen.">

      <h2>1. Originaldaten (externe Quellen)</h2>
      <ul>
        <li>
          <strong>nationalleague.ch</strong> (öffentliche API): Spielplan und
          Resultate, Tabellen-/Team-Rohdaten, Spieler-Stammdaten und
          -Saisonwerte, Marktwerte sowie Spiel-Detaildaten (u.a. Schüsse).
        </li>
        <li>
          <strong>data.sihf.ch</strong> (Swiss Ice Hockey Federation, öffentliche
          API): Boxscore-/Spielerstatistiken je Spiel, Drittel-/Schussdaten und
          Live-/Endresultate.
        </li>
        <li>
          <strong>Stadion-/Zuschauerkapazitäten</strong>: manuell
          zusammengetragen; die jeweiligen Herkunftslinks sind im Quellcode
          dokumentiert.
        </li>
        <li>
          <strong>Vereinslogos</strong> (sofern hinterlegt): Marken der jeweiligen
          Vereine, verbleiben bei den Rechteinhabern.
        </li>
      </ul>
      <p className="muted">
        Die Abrufe dieser Quellen erfolgen serverseitig zur periodischen
        Aktualisierung; es werden keine Besucherdaten an diese Quellen übermittelt.
      </p>

      <h2>2. Eigene Berechnungen</h2>
      <p>Aus den Originaldaten berechnet RinkIQ eigenständig u.a.:</p>
      <ul>
        <li><strong>ELO-Rating</strong> (eigenes, kalibriertes Modell inkl. Heimvorteil, OT/SO-Gewichtung, Tordifferenz).</li>
        <li><strong>Power Ranking</strong> (gewichteter Mehrkomponenten-Score).</li>
        <li><strong>Monte-Carlo-Saison-/Playoff-Simulation</strong> (reproduzierbare 10'000-Läufe inkl. Playoff-Bracket).</li>
        <li><strong>Pre-Game-Prognosen</strong> und Scoreline-/Tor-Verteilungen sowie «Expected Goals» als Mittel simulierter Tore.</li>
        <li><strong>Player Impact Score</strong> und weitere abgeleitete Spieler-/Team-Kennzahlen.</li>
      </ul>

      <h2>3. Abgeleitete Kennzahlen</h2>
      <ul>
        <li><strong>Playoff-, Top-6- und Meisterwahrscheinlichkeiten</strong> aus der Simulation (öffentlich als gespeicherter Snapshot mit Datenstand).</li>
        <li><strong>«Faire Quoten»</strong> als rechnerische Umkehrwerte (1 / Wahrscheinlichkeit) der Modellwerte – ohne Buchmachermarge, kein Wettangebot.</li>
      </ul>
      <p>
        Prognosen und abgeleitete Werte sind Schätzungen und garantieren keine
        Ergebnisse (siehe <a href="/nutzungsbedingungen">Nutzungsbedingungen</a>).
      </p>
    </LegalLayout>
  )
}
