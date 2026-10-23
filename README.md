# 🏒 NL Tracker 2026/27

Ein privater Analytics-Tracker für die Schweizer **National League** Saison
2026/27: ELO-Ranking, Power Ranking, klassische Ligatabelle, Monte-Carlo-
Saison-/Playoff-Simulation, Spiel- und Playoff-Prognosen, faire Quoten,
Spieler-/Torhüter-Ranglisten, Fan Analytics, ein Live-Spiel-Subsystem mit
Win-Probability-Verlauf sowie eine Model-Performance-/Backtesting-Auswertung.

**Die Spiel-, Tabellen- und Spielerdaten werden automatisch synchronisiert**
(öffentliche APIs von `nationalleague.ch` und der SIHF) – es gibt **keine
manuelle Spielerfassung** mehr. Manuell bleibt nur die Kaderpflege (Teams/
Spieler-CRUD).

Frontend: **React 18 + Vite**. Persistenz: eine **JSON-Datei**
(`server/data/db.json`), die ein kleiner **Node/Express-Server** liest und
schreibt. Der vollständige, gegen den Code verifizierte Funktionsumfang steht
in **[`FEATURES.md`](./FEATURES.md)**.

---

## Voraussetzungen

- **Node.js 20 oder neuer** (Deployment läuft auf Node 20, lokal getestet mit
  24). Prüfen mit `node -v`.
- npm (kommt mit Node).

## Installation & Start

```bash
npm install
npm run dev
```

`npm run dev` startet **beides gleichzeitig**:

- den API-Server auf <http://localhost:3001>
- das Vite-Frontend auf <http://localhost:5173>

Danach im Browser **http://localhost:5173** öffnen. Fertig.

> Der Vite-Dev-Server proxyt alle `/api`-Aufrufe automatisch an den Express-Server –
> du musst dich also um nichts kümmern.

### In IntelliJ IDEA / WebStorm öffnen

1. ZIP entpacken.
2. In IntelliJ **File → Open…** und den entpackten Ordner `nl-tracker` wählen.
3. Ein Terminal öffnen (unten) und `npm install`, dann `npm run dev` ausführen.
   (Alternativ die npm-Scripts im „npm"-Tool-Fenster per Doppelklick starten.)

---

## So benutzt du die App

1. **Starten** – nach `npm run dev` (oder `npm run serve`) ist die App im
   Browser offen. Der Server **synchronisiert die Spiele, die Tabelle und die
   Spielerdaten automatisch** aus den öffentlichen NL-/SIHF-APIs (siehe
   „Auto-Sync im Dauerbetrieb" unten). Du musst **keine Spiele mehr von Hand
   erfassen** – diese Funktion wurde entfernt.
2. **Kader pflegen (optional)** – unter **Teams & Kader** lassen sich Teams
   und Spieler weiterhin manuell anlegen/bearbeiten (Name, Nummer, Position).
   Vom Sync verwaltete Felder (`externalId`, `apiStats`, Marktwerte …) werden
   beim nächsten Lauf aber wieder überschrieben.
3. **Analysieren** – Tabelle, ELO, Power Ranking, Playoff Odds, Prognosen,
   Faire Quoten, Spieler-/Torhüter-Ranglisten, Fan Analytics und Model
   Performance berechnen sich automatisch aus den synchronisierten Daten.

### Punkte- und ELO-System

- **Tabelle:** Sieg 3, OT/PS-Sieg 2, OT/PS-Niederlage 1, Niederlage 0.
- **ELO:** Startwert, K-Faktor und Heimvorteil sind in den **Einstellungen**
  anpassbar. Reguläre Siege zählen mit 1,0, OT/PS-Siege mit 0,75 (knappe
  Entscheidungen werden schwächer gewichtet).

---

## Datenspeicherung

- Alles liegt in **`server/data/db.json`**. Diese Datei wird beim ersten Start
  automatisch aus `server/data/seed.json` (14 Teams + Spielplan) erzeugt.
- **Schreibzugriffe sind serialisiert und atomar**: Alle db.json-verändernden
  Vorgänge (beide Syncs, Game-Detail-Sync, API-Mutationen) laufen über eine
  zentrale Schreib-Queue (`server/dbLock.js`, `runExclusive`), sodass sich
  gleichzeitige Läufe nicht gegenseitig überschreiben; geschrieben wird per
  temporärer Datei + `rename` (`writeJsonAtomic`), damit ein Absturz keine
  halb geschriebene Datei hinterlässt.
- **Schutz vor stillem Datenverlust**: Ist `db.json` vorhanden, aber nicht
  parsebar (beschädigt), sichert der Server eine Rohkopie als
  `db.json.corrupt-<zeit>` und **bricht ab, statt mit einer leeren DB
  weiterzuschreiben** – danach ein Backup per **Einstellungen → Import**
  einspielen.
- **Persistenter Pfad (`PERSIST_DIR`)**: Standardmässig schreibt der Server
  nach `server/data`. Für eine Plattform mit separatem Datenträger lässt sich
  über die Umgebungsvariable `PERSIST_DIR` ein anderes Verzeichnis für die
  schreibbaren Dateien (db.json + Sync-Status) wählen; `seed.json` bleibt
  bewusst im Repo-Pfad (siehe `render.yaml`).
- In den **Einstellungen**: Backup als JSON exportieren/importieren und Reset
  (nur Spiele oder komplett auf den Seed).

> **Render-Hinweis (ehrlich):** `render.yaml` beschreibt einen persistenten
> Disk-Mount, der aber **erst auf einem Bezahlplan** greift. Auf dem
> **Free-Plan ist die Festplatte ephemer** – `db.json` überlebt einen
> Redeploy/Spin-down dann **nicht** und muss nach dem Start (`BOOT_SKIP_SYNC=1`
> verhindert, dass ein Auto-Sync dazwischenschreibt) per `POST /api/import`
> aus einem Backup wiederhergestellt werden. Dauerhafte Persistenz ist ohne
> Plan-Wechsel **nicht** garantiert.

---

## Projektstruktur

```
nl-tracker/
├─ index.html              # HTML-Einstieg (Vite)
├─ vite.config.js          # Vite-Config inkl. /api-Proxy auf Port 3001
├─ package.json            # Scripts & Abhängigkeiten
├─ server/
│  ├─ index.js             # Express-API (liest/schreibt db.json, startet Syncs)
│  ├─ dbLock.js            # Schreib-Queue (runExclusive) + atomarer Write
│  ├─ sync.js              # NL-API-Sync (Spiele/Tabelle/Spieler/Marktwerte)
│  ├─ nlGameDetailSync.js  # NL-Game-Detail-Sync (Boxscore, Schussdaten/xG)
│  ├─ liveSync.js          # Live-Spielstand-Poller (schreibt db.json NICHT)
│  ├─ liveReplay.js        # Replay-/Timeline-Rekonstruktion abgeschlossener Spiele
│  ├─ scripts/
│  │  ├─ sync-sihf.cjs     # SIHF-Sync (Live-Boxscores) + Discover
│  │  ├─ predictions.js    # Pre-Game-Prediction-Snapshots
│  │  └─ backtesting/      # Walk-Forward-Backtest-Tooling
│  └─ data/
│     ├─ seed.json         # 14 NL-Teams + Spielplan (Vorlage)
│     └─ db.json           # Live-Daten (wird automatisch erzeugt)
└─ src/
   ├─ main.jsx / App.jsx   # React-Einstieg, Layout + Routing (alle Routen)
   ├─ DataContext.jsx      # zentraler State + abgeleitete Statistiken
   ├─ elo.js / powerRankings.js / playoffSim.js / predictionMetrics.js …  # Logik
   ├─ components/          # UI + Visualisierungen (inkl. Live-/Replay-Komponenten)
   └─ pages/               # Dashboard, Standings, EloRanking, PowerRankings,
                           # PlayoffOdds, Postseason, PlayerRankings, Goalies,
                           # Topscorers, FairOdds, FanAnalytics, HeadToHead,
                           # Schedule, MatchupDetail, Teams, TeamDetail,
                           # PlayerDetail, ModelPerformance, Backtesting, Settings
```

Die vollständige, gegen den Code verifizierte Feature-/Routen-/Komponenten-
Übersicht steht in **[`FEATURES.md`](./FEATURES.md)**; die Routen selbst sind
in `src/App.jsx` definiert.

## Nützliche Scripts

| Befehl            | Zweck                                                          |
|-------------------|-----------------------------------------------------------------|
| `npm run dev`     | Server **und** Frontend-Dev-Server starten (Entwicklung, 2 Ports) |
| `npm run build`   | Nur Produktions-Build des Frontends (`dist/`)                  |
| `npm run start`   | Nur den API-Server starten (kein Build, kein Frontend-Ausliefern) |
| `npm run serve`   | **Build + Server in einem Prozess** – siehe unten               |
| `npm test`        | Gesamte `node --test`-Suite (alle `*.test.js`, offline)         |

### Tests

Die Logik ist mit Node's eingebautem Test-Runner abgedeckt (`node:test`,
keine zusätzliche Abhängigkeit). `npm test` führt **alle** Suiten aus
(zuletzt 347 Tests, vollständig offline – kein Netzwerk, keine Produktionsdaten).
Einzelne Bereiche: `npm run test:dblock` (Schreib-Serialisierung),
`npm run test:sim`, `test:scoreline`, `test:wheel`, `test:live`,
`test:advice`, `test:prediction`, `test:backtest`. React-Seiten/Komponenten
haben weiterhin **keine** Render-Tests. CI (`.github/workflows/ci.yml`) führt
`npm ci && npm run build && npm test` bei Push/PR aus.

---

## Dauerbetrieb / Produktion (ein Prozess, ein Port)

Für den Alltagsbetrieb (der Tracker soll einfach laufen, ohne dass du an Vite
denken musst) gibt es `npm run serve`:

```bash
npm run serve
```

Das baut das Frontend (`vite build` → `dist/`) und startet danach **nur noch
den Express-Server** – der liefert ab jetzt sowohl die API (`/api/...`) als
auch das gebaute Frontend selbst aus. **Alles läuft unter einem einzigen
Port:**

**http://localhost:3001**

Kein separater Vite-Prozess mehr nötig. Unbekannte Routen (z. B. ein
Deep-Link wie `/players/xyz` nach einem Reload) liefern automatisch
`index.html` aus (SPA-Fallback), `/api/...`-Pfade sind davon ausgenommen und
verhalten sich wie gewohnt.

> Der Dev-Modus (`npm run dev`, zwei Ports 3001 + 5173 mit Hot-Reload und
> `/api`-Proxy) ist davon unberührt und funktioniert weiterhin unverändert –
> nutze ihn, wenn du am Code arbeitest. `npm run serve` ist für den
> "einfach laufen lassen"-Betrieb gedacht.

### Auto-Sync im Dauerbetrieb

Sobald der Server läuft (egal ob per `npm run dev` oder `npm run serve`),
synchronisiert er automatisch im Hintergrund:

- **NL-API-Sync** (Spiele/Tabelle/Spieler, `nationalleague.ch`): einmal sofort
  beim Start, danach alle **30 Minuten** (die API selbst cacht 10 Minuten –
  30 Minuten respektiert das mit Puffer).
- **SIHF-Sync** (Live-Boxscores für bereits terminierte Spiele): alle **5
  Minuten**.

Beide sind standardmässig **aktiv** und brauchen keine Konfiguration. Falls du
einen davon (z. B. für einen kurzen lokalen Test) abschalten willst, setze vor
dem Start eine Umgebungsvariable:

```bash
# PowerShell
$env:NL_AUTO_SYNC = "0"       # NL-API-Sync-Intervall aus
$env:SIHF_AUTO_SYNC = "0"     # SIHF-Sync-Intervall aus
npm run serve
```

(`NL_SYNC_INTERVAL_MIN` bzw. `SIHF_SYNC_INTERVAL_MIN` überschreiben bei Bedarf
das jeweilige Intervall in Minuten.)

---

## Automatischer Start beim Windows-Login

Im Projektordner liegt **`start-nl-tracker.bat`** – sie wechselt automatisch
ins Projektverzeichnis und führt `npm run serve` aus. Lass das sich öffnende
Konsolenfenster einfach offen; der Tracker läuft, solange es offen ist
(Fenster schliessen = Server stoppen).

### Variante A – Autostart-Ordner (am einfachsten)

1. `Win + R` → `shell:startup` eingeben → Enter. Es öffnet sich dein
   persönlicher Autostart-Ordner.
2. Eine **Verknüpfung** zu `start-nl-tracker.bat` in diesen Ordner legen
   (Rechtsklick auf die Datei → *Senden an* → *Desktop (Verknüpfung
   erstellen)*, die Verknüpfung dann in den Autostart-Ordner verschieben).
3. Fertig – ab dem nächsten Login startet der Tracker automatisch (mit
   sichtbarem Konsolenfenster).

### Variante B – Aufgabenplanung (mehr Kontrolle, z. B. minimiert starten)

1. `Win + R` → `taskschd.msc` → Enter, öffnet die **Aufgabenplanung**.
2. Rechts **„Einfache Aufgabe erstellen…"** wählen.
3. Name z. B. `NL Tracker`, *Weiter*.
4. Trigger: **„Bei der Anmeldung"**, *Weiter*.
5. Aktion: **„Programm starten"**, *Weiter*.
6. *Programm/Skript*: Pfad zu `start-nl-tracker.bat` eintragen (z. B.
   `C:\Users\<dich>\OneDrive\Desktop\Nationalleague\nl-tracker\nl-tracker\start-nl-tracker.bat`),
   *Weiter* → *Fertig stellen*.
7. Optional für ein minimiertes/unauffälligeres Fenster: die erstellte
   Aufgabe in der Liste doppelklicken → Reiter **„Aktionen"** → Aktion
   bearbeiten → bei *Argumente hinzufügen* z. B. nichts nötig, aber im Reiter
   **„Allgemein"** lässt sich *„Nur ausführen, wenn Benutzer angemeldet ist"*
   setzen (empfohlen, da sonst kein sichtbares Fenster erscheint, in dem der
   Server läuft).

In beiden Fällen gilt: der PC muss eingeschaltet und eingeloggt sein, damit
der Tracker erreichbar ist – kein echter 24/7-Serverbetrieb ohne laufenden
PC, aber „läuft automatisch mit, solange der PC an ist".

Viel Spass mit der Saison 2026/27! 🇨🇭🏒
