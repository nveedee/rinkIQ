// ---------------------------------------------------------------------------
// Zentrale PostHog-Anbindung (Web-Analytics). Wird GENAU EINMAL initialisiert
// (src/main.jsx::initAnalytics). Ohne konfigurierten Key bleibt alles ein
// No-Op - die App funktioniert vollständig ohne Analytics, und auch wenn
// PostHog vorübergehend nicht erreichbar ist (alle Aufrufe in try/catch).
//
// Datenschutz-/Sparsamkeits-Einstellungen (siehe FEATURES.md "Analytics"):
//   - autocapture AUS: keine automatische Klick-/Eingabe-Erfassung (so werden
//     z.B. Login-/Formularfelder gar nicht erst berührt)
//   - Session Recording / Heatmaps AUS
//   - respect_dnt: Do-Not-Track des Browsers wird respektiert
//   - person_profiles: 'identified_only' -> keine Personenprofile für anonyme
//     Besucher (wir identifizieren niemanden) = datensparsam + quota-schonend
//   - Pageviews werden MANUELL bei Router-Navigation erfasst (capture_pageview
//     AUS), um Doppel-Pageviews bei clientseitigen Wechseln zu vermeiden.
// ---------------------------------------------------------------------------
import posthog from 'posthog-js'
import { resolveAnalyticsConfig } from './analyticsConfig.js'

let enabled = false

export function initAnalytics(env = import.meta.env) {
  if (enabled) return // nur einmal
  const { key, host, enabled: shouldEnable } = resolveAnalyticsConfig(env)
  if (!shouldEnable) return // kein Key -> Analytics deaktiviert, App läuft normal
  try {
    posthog.init(key, {
      api_host: host,
      capture_pageview: false,
      autocapture: false,
      disable_session_recording: true,
      disable_surveys: true,
      capture_performance: false,
      respect_dnt: true,
      person_profiles: 'identified_only',
    })
    enabled = true
  } catch (e) {
    // Analytics darf die App nie blockieren.
    console.warn('[analytics] Initialisierung fehlgeschlagen:', e?.message)
  }
}

// Ein Pageview pro (clientseitiger) Navigation. PostHog ergänzt $current_url,
// $referrer, $referring_domain etc. automatisch aus window.location.
export function capturePageview() {
  if (!enabled) return
  try { posthog.capture('$pageview') } catch { /* nie werfen */ }
}

// Generisches, benanntes Ereignis für wichtige Interaktionen. `props` sollte
// NUR nicht-sensible, aggregierbare Werte enthalten (z.B. Filtername).
export function track(event, props) {
  if (!enabled) return
  try { posthog.capture(event, props) } catch { /* nie werfen */ }
}

export function isAnalyticsEnabled() { return enabled }
