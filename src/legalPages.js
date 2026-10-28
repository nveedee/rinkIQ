// ---------------------------------------------------------------------------
// Single Source of Truth für die rechtlichen/informativen Seiten. Wird vom
// Footer (Navigation) UND vom Router (src/App.jsx) genutzt, damit beide nie
// auseinanderlaufen. Alle diese Seiten sind ÖFFENTLICH (ohne Anmeldung
// erreichbar) - sie dürfen nie hinter dem Admin-Guard liegen.
// ---------------------------------------------------------------------------
export const LEGAL_PAGES = [
  { path: '/impressum', label: 'Impressum' },
  { path: '/datenschutz', label: 'Datenschutz' },
  { path: '/nutzungsbedingungen', label: 'Nutzungsbedingungen' },
  { path: '/quellen-methodik', label: 'Quellen & Methodik' },
]
