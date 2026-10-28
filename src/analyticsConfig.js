// ---------------------------------------------------------------------------
// Reine, testbare Auflösung der PostHog-Konfiguration aus den (Vite-)
// Umgebungsvariablen. Bewusst OHNE Import von posthog-js, damit sie in
// node --test geprüft werden kann (siehe analyticsConfig.test.js).
//
// VITE_POSTHOG_KEY  = öffentlicher Project-API-Key (KEIN geheimer Key)
// VITE_POSTHOG_HOST = Region-Host; Default = US Cloud (Region des RinkIQ-
//                     PostHog-Projekts). Für ein EU-Projekt auf
//                     https://eu.i.posthog.com setzen. Muss zur Region des
//                     PostHog-Projekts passen, sonst werden Events abgewiesen.
// ---------------------------------------------------------------------------
export const POSTHOG_DEFAULT_HOST = 'https://us.i.posthog.com'

export function resolveAnalyticsConfig(env = {}) {
  const key = (env.VITE_POSTHOG_KEY || '').trim()
  const host = (env.VITE_POSTHOG_HOST || '').trim() || POSTHOG_DEFAULT_HOST
  // Analytics ist nur aktiv, wenn ein Key gesetzt ist - ohne Key läuft die App
  // vollständig weiter, nur eben ohne Tracking.
  return { key, host, enabled: Boolean(key) }
}
