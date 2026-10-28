// ---------------------------------------------------------------------------
// Erzeugt den scrypt-Hash für das Admin-Passwort, der in der Env-Var
// ADMIN_PASSWORD_HASH hinterlegt wird (z.B. Render-Dashboard). Das Klartext-
// Passwort wird NIE gespeichert und landet NIE im Repo.
//
// Nutzung (Passwort bevorzugt über Env-Var, damit es nicht in der Shell-
// History / Prozessliste landet):
//   NEW_ADMIN_PASSWORD='dein-passwort' node server/scripts/set-admin-password.js
// oder (weniger sicher, als Argument):
//   node server/scripts/set-admin-password.js 'dein-passwort'
//
// Ausgabe = der Wert für ADMIN_PASSWORD_HASH.
// ---------------------------------------------------------------------------
import { hashPassword } from '../auth.js'

const pw = process.env.NEW_ADMIN_PASSWORD || process.argv[2]
if (!pw || String(pw).length < 8) {
  console.error('Fehler: Passwort fehlt oder ist kürzer als 8 Zeichen.')
  console.error("Nutzung: NEW_ADMIN_PASSWORD='…' node server/scripts/set-admin-password.js")
  process.exit(1)
}

const hash = hashPassword(pw)
console.log('\nADMIN_PASSWORD_HASH=' + hash + '\n')
console.log('Diesen Wert als Umgebungsvariable ADMIN_PASSWORD_HASH setzen (nicht ins Repo committen).')
console.log('Optional: ADMIN_USERNAME setzen (Default: admin).')
