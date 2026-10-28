import LegalLayout from '../../components/LegalLayout.jsx'

// Datenschutzerklärung - beschreibt die im Code tatsächlich festgestellten
// Datenverarbeitungen, ohne personenbezogene Betreiberangaben.
export default function Datenschutz() {
  return (
    <LegalLayout title="Datenschutzerklärung" updated="28.10.2026"
      intro="Diese Erklärung beschreibt, welche Daten beim Besuch dieser Website verarbeitet werden.">

      <h2>1. Grundsatz</h2>
      <p>
        RinkIQ ist ein privates, unabhängiges, nicht-kommerzielles Projekt. Der
        Schutz der Daten der Besucherinnen und Besucher ist wichtig: Es werden nur
        die für den Betrieb und die Sicherheit technisch notwendigen Daten
        verarbeitet, und es findet <strong>kein Tracking und keine Werbung</strong>{' '}
        statt.
      </p>

      <h2>2. Hosting und Server-Logfiles</h2>
      <p>
        Die Website wird bei einem externen Hosting-Anbieter betrieben. Beim
        Aufruf der Seite werden technisch zwangsläufig Verbindungsdaten
        verarbeitet, insbesondere die <strong>IP-Adresse</strong> des zugreifenden
        Geräts, Datum/Uhrzeit des Zugriffs, angeforderte Ressource und
        vergleichbare Metadaten. Diese Verarbeitung ist für den Betrieb und die
        Sicherheit der Website erforderlich; die Speicherung erfolgt im Rahmen der
        Vorgaben des Hosting-Anbieters.
      </p>

      <h2>3. Cookies und lokale Speicherung</h2>
      <p>
        Für <strong>normale Besucherinnen und Besucher werden keine Cookies
        gesetzt</strong> und es findet kein Tracking statt.
      </p>
      <p>
        Nur beim <strong>Admin-Login</strong> werden zwei technisch notwendige
        Cookies gesetzt: ein Session-Cookie (<code>nlsid</code>, <code>HttpOnly</code>,
        <code> SameSite=Lax</code>) zur Anmeldung sowie ein CSRF-Schutz-Cookie
        (<code>nlcsrf</code>). Beide dienen ausschliesslich der Authentifizierung
        bzw. der Absicherung gegen Cross-Site-Request-Forgery und werden nach
        begrenzter Zeit bzw. beim Abmelden ungültig.
      </p>
      <p>
        Zur Darstellung speichert die Anwendung im Browser (localStorage) eine
        rein lokale, nicht personenbezogene Verlaufsreihe der berechneten
        Wahrscheinlichkeiten. Diese Daten verbleiben im Browser und werden nicht
        an den Server übermittelt.
      </p>

      <h2>4. Admin-Zugang</h2>
      <p>
        Der geschützte Bereich ist durch einen serverseitigen Login abgesichert.
        Das Passwort wird nur als kryptografischer Hash (serverseitig, ausserhalb
        des Quellcodes) vorgehalten. Zur Begrenzung von Anmeldeversuchen wird die
        IP-Adresse kurzzeitig im Arbeitsspeicher ausgewertet (Schutz vor
        automatisierten Angriffen) und nicht dauerhaft gespeichert.
      </p>

      <h2>5. Dargestellte Sportdaten</h2>
      <p>
        Die Plattform stellt öffentlich zugängliche Sportdaten dar, die auch
        Angaben zu Spielern umfassen können (u.a. Name, Position, Statistiken,
        Marktwerte). Diese stammen aus öffentlichen Quellen (siehe{' '}
        <a href="/quellen-methodik">Quellen &amp; Methodik</a>) und werden
        ausschliesslich zu Informations- und Analysezwecken verarbeitet und
        angezeigt.
      </p>

      <h2>6. Externe Dienste</h2>
      <p>
        <strong>Schriftarten:</strong> Die Website bindet Schriftarten über Google
        Fonts ein. Dabei wird beim Seitenaufruf eine Verbindung zu Servern von
        Google aufgebaut, wodurch die IP-Adresse an Google übermittelt werden kann.
      </p>
      <p>
        <strong>Datenquellen:</strong> Zur Aktualisierung der Inhalte ruft der
        <em> Server</em> (nicht der Browser der Besucher) öffentliche
        Schnittstellen von nationalleague.ch und data.sihf.ch ab. Dabei werden
        keine personenbezogenen Daten der Website-Besucher an diese Dienste
        übermittelt.
      </p>
      <p>
        Es werden <strong>keine</strong> Analyse-, Tracking- oder Werbedienste
        eingesetzt.
      </p>

      <h2>7. Speicherdauer</h2>
      <p>
        Session-/CSRF-Cookies verfallen nach kurzer Zeit bzw. beim Abmelden.
        Server-Logfiles werden gemäss den Vorgaben des Hosting-Anbieters
        gespeichert. Inhaltsdaten (Statistiken/Prognosen) werden für den laufenden
        Betrieb vorgehalten.
      </p>

      <h2>8. Rechte der betroffenen Personen</h2>
      <p>
        Betroffene Personen haben im Rahmen des anwendbaren Rechts insbesondere das
        Recht auf Auskunft, Berichtigung, Löschung sowie Widerspruch gegen
        bestimmte Verarbeitungen.
      </p>
    </LegalLayout>
  )
}
