import LegalLayout from '../../components/LegalLayout.jsx'

// Impressum - bewusst OHNE personenbezogene Betreiberangaben.
export default function Impressum() {
  return (
    <LegalLayout title="Impressum" updated="28.10.2026"
      intro="Angaben zum Projekt RinkIQ.">
      <h2>Projekt</h2>
      <p>
        RinkIQ ist ein privates, unabhängiges und nicht-kommerzielles
        Informationsprojekt rund um Schweizer Eishockey. Es handelt sich nicht um
        ein offizielles Angebot der National League, der Swiss Ice Hockey
        Federation (SIHF) oder der dargestellten Vereine.
      </p>

      <h2>Haftung für Inhalte</h2>
      <p>
        Die Inhalte dieser Website werden mit Sorgfalt erstellt. Für die
        Richtigkeit, Vollständigkeit und Aktualität der bereitgestellten
        Statistiken, Prognosen und abgeleiteten Kennzahlen wird keine Gewähr
        übernommen (siehe auch <a href="/nutzungsbedingungen">Nutzungsbedingungen</a>{' '}
        und <a href="/quellen-methodik">Quellen &amp; Methodik</a>).
      </p>

      <h2>Marken &amp; Inhalte Dritter</h2>
      <p>
        Genannte Namen, Marken und Logos Dritter dienen ausschliesslich der
        Identifikation und verbleiben bei den jeweiligen Rechteinhabern.
      </p>
    </LegalLayout>
  )
}
