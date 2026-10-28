import LegalLayout from '../../components/LegalLayout.jsx'

// Nutzungsbedingungen - ohne pauschale, unzulässige Haftungsausschlüsse.
export default function Nutzungsbedingungen() {
  return (
    <LegalLayout title="Nutzungsbedingungen" updated="28.10.2026"
      intro="Diese Bedingungen regeln die Nutzung der RinkIQ-Website.">

      <h2>1. Informationscharakter</h2>
      <p>
        RinkIQ ist eine informative Analyse-Plattform rund um Schweizer
        Eishockey. Sämtliche Inhalte – insbesondere Tabellen, Statistiken,
        ELO-Ratings, Power Rankings, Spielprognosen, Playoff-Wahrscheinlichkeiten
        und berechnete «faire Quoten» – dienen ausschliesslich Informations- und
        Unterhaltungszwecken.
      </p>

      <h2>2. Prognosen, Ratings und berechnete Quoten</h2>
      <p>
        ELO-Ratings, Spielprognosen, Playoff- und Meisterwahrscheinlichkeiten
        sowie berechnete Quoten sind <strong>modellbasierte Schätzungen</strong>.
        Sie beruhen auf statistischen Verfahren und historischen Daten und
        <strong> garantieren keine Ergebnisse</strong>. Tatsächliche Spiel- und
        Saisonverläufe können erheblich abweichen.
      </p>
      <p>
        Die dargestellten «fairen Quoten» sind rein rechnerische Umkehrwerte der
        Modellwahrscheinlichkeiten und stellen <strong>kein Wettangebot, keine
        Wettberatung und keine Aufforderung zur Teilnahme an Glücksspielen</strong>{' '}
        dar. RinkIQ nimmt keine Wetten entgegen und vermittelt keine solchen.
      </p>

      <h2>3. Keine offizielle Verbindung</h2>
      <p>
        RinkIQ ist ein unabhängiges, inoffizielles Projekt und steht in keiner
        Verbindung zur National League, zur Swiss Ice Hockey Federation (SIHF)
        oder zu den dargestellten Vereinen, sofern nicht ausdrücklich anders
        angegeben. Verwendete Namen und Marken Dritter dienen nur der
        Identifikation und verbleiben bei den jeweiligen Rechteinhabern.
      </p>

      <h2>4. Zulässige Nutzung</h2>
      <p>
        Die Website darf für den persönlichen, nicht missbräuchlichen Gebrauch
        genutzt werden. Nicht zulässig sind insbesondere automatisiertes,
        übermässiges Abrufen (Scraping), das die Verfügbarkeit beeinträchtigt,
        sowie Eingriffe in die Sicherheit oder Integrität der Dienste.
      </p>

      <h2>5. Rechte an Inhalten</h2>
      <p>
        Die von RinkIQ erstellten eigenen Inhalte (insbesondere Aufbereitung,
        Darstellung und eigene Berechnungen/abgeleitete Kennzahlen) sind
        urheberrechtlich geschützt. Zugrunde liegende Originaldaten und Marken
        Dritter (Resultate, Statistiken, Vereinslogos) verbleiben bei den
        jeweiligen Rechteinhabern; Herkunft ist unter{' '}
        <a href="/quellen-methodik">Quellen &amp; Methodik</a> dokumentiert.
      </p>

      <h2>6. Haftung</h2>
      <p>
        Die Inhalte werden mit Sorgfalt erstellt, jedoch ohne Gewähr für
        Richtigkeit, Vollständigkeit und Aktualität. Die Nutzung erfolgt auf
        eigene Verantwortung. Eine Haftung für Entscheidungen, die auf Basis der
        bereitgestellten Informationen getroffen werden, wird im gesetzlich
        zulässigen Rahmen ausgeschlossen.
      </p>

      <h2>7. Änderungen</h2>
      <p>
        Diese Bedingungen können angepasst werden. Massgeblich ist die bei der
        Nutzung veröffentlichte Fassung.
      </p>
    </LegalLayout>
  )
}
